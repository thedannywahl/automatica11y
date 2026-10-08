import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleEntries } from "../harness/bundle.js";
import { installPackage } from "../harness/npm-install.js";
import * as react from "../harness/npm-react.js";
import * as wc from "../harness/npm-wc.js";
import { closedShadowHosts, notTestableEntries } from "../harness/shadow.js";
import { serveStatic } from "../harness/static-serve.js";
import { openPage } from "../harness/url.js";
import { candidateMapping, findAuthoredFixture } from "../plan/mapping.js";
import { ARCHETYPES } from "../schema.js";
import { runInteractions } from "../tiers/interactions/index.js";
import { runRules } from "../tiers/rules/index.js";
import { num } from "../text.js";
import { summarize } from "./summary.js";

/** The states worth checking for each archetype. The first is where a page starts. */
const STATES = {
  dialog: ["closed", "open"],
  menu: ["closed", "open"],
  tooltip: ["closed", "open"],
  combobox: ["closed", "open"],
  accordion: ["collapsed", "expanded"],
};
const NOT_BUILT = {
  vsr: "The virtual screen reader tier isn't built yet (M6).",
};

const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split("\n").find((l) => l.trim()) ?? "unknown error";

/** Page and console errors that mean a fixture didn't mount cleanly. A missing favicon doesn't count. */
function watchErrors(errors) {
  return (page) => {
    page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/favicon|Failed to load resource/i.test(text) && !/\.(js|css)\b/.test(text)) return;
      errors.push(text.split("\n")[0]);
    });
  };
}

/** Load the whole package in a page to list its exports and the custom elements it defines. */
async function discover({ browser, workDir, flavor, pkg, buildDir }) {
  const helper = flavor === "react" ? react : wc;
  const entryFile = join(workDir, "discover.js");
  writeFileSync(entryFile, helper.discoverEntry(pkg));
  await bundleEntries({ entries: { discover: entryFile }, outdir: buildDir, workDir, react: flavor === "react" });
  const server = await serveStatic(buildDir);
  const errors = [];
  try {
    const opened = await openPage(browser, `${server.origin}/discover.html`, { beforeGoto: watchErrors(errors) });
    try {
      await opened.page.waitForFunction(() => /** @type {any} */ (window).__a11yExports !== undefined, undefined, { timeout: 15_000 });
    } catch {
      throw new Error(`The package didn't finish loading in the browser${errors.length ? `: ${errors[0]}` : "."}`);
    }
    const exportsList = await opened.page.evaluate(() => /** @type {any} */ (window).__a11yExports);
    const tags = await opened.page.evaluate(() => [.../** @type {any} */ (window).__a11yDefined ?? []]);
    await opened.close();
    return { exports: exportsList, tags };
  } finally {
    await server.close();
  }
}

/** Open one fixture page, check it follows the contract, and run the rules tier in each state. */
async function auditFixture({ browser, url, archetype, plan }) {
  const errors = [];
  const opened = await openPage(browser, url, { beforeGoto: watchErrors(errors) });
  try {
    const trigger = opened.page.locator("[data-a11y-trigger]");
    try {
      await trigger.first().waitFor({ state: "attached", timeout: 5000 });
    } catch {
      return { gap: `The fixture didn't render an element with data-a11y-trigger${errors.length ? `: ${errors[0]}` : "."}` };
    }
    const count = await trigger.count();
    if (count !== 1) return { gap: `The fixture must mark exactly one data-a11y-trigger. It marked ${num(count)}.` };
    if (errors.length) return { gap: `The fixture logged errors when it mounted: ${errors[0]}` };

    const states = STATES[archetype] ?? ["initial"];
    const configs = [];
    for (const [index, state] of states.entries()) {
      let failure = null;
      if (index > 0) {
        try {
          if (archetype === "tooltip") await trigger.first().focus();
          else await trigger.first().click();
          await opened.page.waitForFunction(
            () => {
              const root = document.querySelector("[data-a11y-root]");
              const shown = root && /** @type {HTMLElement} */ (root).getClientRects().length > 0;
              return shown || document.querySelector('[data-a11y-trigger][aria-expanded="true"]') !== null;
            },
            undefined,
            { timeout: 3000 },
          );
        } catch {
          failure = `The ${state} state never appeared after activating the trigger. A fixture's data-a11y-root has to show up when the ${archetype} opens.`;
        }
      }
      await opened.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      /** @type {Record<string, any>} */
      const tiers = {};
      for (const tier of plan.options.tiers) {
        if (tier === "interactions") continue;
        if (tier !== "rules") tiers[tier] = { status: "skipped", reason: NOT_BUILT[tier] };
        else if (failure) tiers.rules = { status: "failed", reason: failure, engines: Object.fromEntries(plan.options.engines.map((e) => [e, { status: "failed", reason: failure }])) };
        else {
          tiers.rules = await runRules(opened.page, { engines: plan.options.engines, wcag: plan.options.wcag, level: plan.options.level, scope: index === 0 ? "#root" : ["#root", "[data-a11y-root]"] });
        }
      }
      configs.push({ libA11y: "n/a", state, tiers });
      if (errors.length) return { gap: `The fixture logged errors in the ${state} state: ${errors[0]}` };
    }
    const hidden = notTestableEntries(await closedShadowHosts(opened.page));
    // The checks open their own fresh pages, so run them after this page's rules results are in.
    if (plan.options.tiers.includes("interactions")) configs[0].tiers.interactions = await runInteractions(browser, url, archetype);
    return { configs, hidden };
  } finally {
    await opened.close();
  }
}

/**
 * Audit an npm package: install it on its own, find what it exports, and audit each archetype that has a fixture.
 * An archetype without a usable fixture is a gap with a reason, never a pass.
 * @returns {Promise<{ result: any, mapping: Record<string, any> | null }>}
 */
export async function auditNpm({ browser, planTarget, plan, cwd, install = installPackage }) {
  install ??= installPackage;
  const base = { id: planTarget.id, reason: null, archetypes: {}, summary: { engines: {}, gaps: [], notTestable: [] }, warnings: [] };
  const resolved = planTarget.resolved ?? {};
  if (planTarget.kind === "npm-unsupported") {
    return { result: { ...base, status: "unsupported", reason: `${resolved.framework ?? "This framework"} packages aren't supported. v1 covers React and web components.` }, mapping: null };
  }
  const tmp = mkdtempSync(join(tmpdir(), "automatica11y-npm-"));
  const workDir = join(tmp, "install");
  const buildDir = join(tmp, "build");
  const fixtureDir = join(tmp, "fixtures");
  mkdirSync(fixtureDir, { recursive: true });
  const servers = [];
  try {
    /** @type {"react" | "wc" | "unknown"} */
    let flavor = planTarget.kind === "npm-react" ? "react" : planTarget.kind === "npm-wc" ? "wc" : "unknown";
    const installed = await install({ dir: workDir, name: resolved.name, version: resolved.version, flavor });
    const warnings = [...installed.warnings];

    const found = await discover({ browser, workDir, flavor: flavor === "react" ? "react" : "wc", pkg: resolved.name, buildDir });
    if (flavor === "unknown") {
      if (found.tags.length > 0) flavor = "wc";
      else if (installed.react && found.exports.some((e) => /^[A-Z]/.test(e.name))) flavor = "react";
    }
    if (flavor === "unknown" || (flavor === "wc" && found.tags.length === 0)) {
      return { result: { ...base, status: "not-applicable", reason: "The package has no rendering surface. It exports no React components and defines no custom elements.", warnings }, mapping: null };
    }

    const candidates = candidateMapping({ flavor, exports: found.exports, tags: found.tags });
    const kindFlavor = /** @type {"react" | "wc"} */ (flavor);
    const wanted = plan.options.archetypes ?? ARCHETYPES;
    /** @type {Record<string, any>} */
    const mapping = {};
    /** @type {Record<string, any>} */
    const archetypes = {};
    const gaps = [];
    const hidden = [];
    const helper = flavor === "react" ? react : wc;

    // Decide where each archetype's fixture comes from, then bundle each one on its own so one bad fixture can't break the rest.
    const runnable = {};
    for (const archetype of wanted) {
      const user = planTarget.mapping?.[archetype] ?? {};
      const entry = { ...candidates[archetype], ...user };
      const authored = findAuthoredFixture({ cwd, targetId: planTarget.id, archetype, mapped: user });
      let fixture = null;
      if (authored) {
        entry.status = "authored";
        entry.fixture = authored;
        delete entry.reason;
        fixture = authored;
      } else if (user.fixture) {
        entry.status = "needs-fixture";
        entry.reason = `The mapping names ${user.fixture}, but that file doesn't exist.`;
      } else if (entry.status === "template" || (user.export || user.tag) && ["button", "link"].includes(archetype)) {
        const source = flavor === "react" ? react.template(archetype, resolved.name, entry.export) : wc.template(archetype, entry.tag);
        if (source) {
          entry.status = "template";
          delete entry.reason;
          fixture = join(fixtureDir, `${archetype}.${flavor === "react" ? "jsx" : "js"}`);
          writeFileSync(fixture, source);
        }
      }
      mapping[archetype] = entry;
      if (!fixture) {
        const reason = entry.status === "no-match" ? entry.reason : entry.reason ?? `The ${archetype} archetype needs a fixture someone writes.`;
        archetypes[archetype] = { status: "gap", reason: archetype && entry.status !== "no-match" ? `${reason} Write fixtures/${planTarget.id}/${archetype}.${flavor === "react" ? "jsx" : "js"}.` : reason, configs: [] };
        gaps.push(`archetype:${archetype}`);
        continue;
      }
      const entryFile = join(tmp, "entries", `${archetype}-entry.js`);
      mkdirSync(join(tmp, "entries"), { recursive: true });
      writeFileSync(entryFile, helper.entry(fixture, resolved.name));
      try {
        await bundleEntries({ entries: { [archetype]: entryFile }, outdir: buildDir, workDir, react: flavor === "react" });
        runnable[archetype] = `/${archetype}.html`;
      } catch (error) {
        archetypes[archetype] = { status: "gap", reason: `The fixture didn't bundle. ${firstLine(error)}`, configs: [] };
        gaps.push(`archetype:${archetype}`);
        entry.status = "needs-fixture";
        entry.reason = firstLine(error);
      }
    }

    if (Object.keys(runnable).length > 0) {
      const live = await serveStatic(buildDir);
      servers.push(live);
      for (const [archetype, path] of Object.entries(runnable)) {
        /** @type {any} */
        const outcome = await auditFixture({ browser, url: `${live.origin}${path}`, archetype, plan }).catch((error) => ({ gap: firstLine(error) }));
        if (outcome.gap) {
          archetypes[archetype] = { status: "gap", reason: outcome.gap, configs: [] };
          gaps.push(`archetype:${archetype}`);
          mapping[archetype].status = "needs-fixture";
          mapping[archetype].reason = outcome.gap;
        } else {
          archetypes[archetype] = { status: "ran", configs: outcome.configs };
          hidden.push(...outcome.hidden.map((h) => `${archetype}: ${h}`));
        }
      }
    }

    const ordered = Object.fromEntries(wanted.filter((a) => archetypes[a]).map((a) => [a, archetypes[a]]));
    const ranAny = Object.values(ordered).some((a) => a.status === "ran");
    return {
      result: {
        id: planTarget.id,
        status: ranAny ? "ran" : "failed",
        reason: ranAny ? null : "No archetype had a usable fixture, so nothing was tested. See the gaps for what each one needs.",
        archetypes: ordered,
        npm: {
          name: resolved.name,
          version: installed.version ?? resolved.version,
          flavor,
          framework: resolved.framework ?? null,
          react: installed.react,
          reactDom: installed.reactDom,
          tags: flavor === "wc" ? found.tags : [],
        },
        summary: { ...summarize(ordered, plan.options.engines, gaps), notTestable: hidden },
        warnings,
      },
      mapping: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, { ...v, fixture: v.fixture ?? null }])),
    };
  } finally {
    for (const s of servers) await s.close();
    if (!process.env.AUTOMATICA11Y_KEEP_TEMP) rmSync(tmp, { recursive: true, force: true });
  }
}
