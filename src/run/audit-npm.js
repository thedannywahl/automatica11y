import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleEntries } from "../harness/bundle.js";
import { GENERATABLE } from "../harness/generate/index.js";
import { generateFixture } from "./generate-fixture.js";
import { settleAnimations } from "../harness/settle.js";
import { installedVersion, installExtraPackages, installOptionalPeers, installPackage } from "../harness/npm-install.js";
import { shipsBrowserAssets } from "../frameworks/html.js";
import { ANGULAR_FLOOR } from "../frameworks/angular.js";
import { explainAngularError } from "../frameworks/angular-errors.js";
import { adapterFor, adapterForKind } from "../frameworks/index.js";
import { offeredSubpaths, subpathProblem } from "../plan/subpath.js";
import { closedShadowHosts, notTestableEntries } from "../harness/shadow.js";
import { serveStatic } from "../harness/static-serve.js";
import { openPage } from "../harness/url.js";
import { candidateMapping, findAuthoredFixture } from "../plan/mapping.js";
import { ARCHETYPES } from "../schema.js";
import { runComputed } from "../tiers/computed/index.js";
import { runConditions } from "../tiers/conditions/index.js";
import { runInteractions } from "../tiers/interactions/index.js";
import { runRules } from "../tiers/rules/index.js";
import { failedVsr, runVsr } from "../tiers/vsr.js";
import { num } from "../text.js";
import { summarize } from "./summary.js";

/** @typedef {ReturnType<typeof import("../schema.js").parsePlan>} Plan */
/** @typedef {ReturnType<typeof import("../schema.js").parseResults>["targets"][number]} TargetResult */
/** @typedef {ReturnType<typeof import("../schema.js").parseMappingFile>[string]} TargetMapping */
/** @typedef {NonNullable<TargetResult["archetypes"][string]["fixture"]>} FixtureInfo */
/** @typedef {TargetResult["archetypes"][string]["configs"][number]} FixtureConfig */

/** The states worth checking for each archetype. The first is where a page starts. */
const STATES = {
  dialog: ["closed", "open"],
  menu: ["closed", "open"],
  tooltip: ["closed", "open"],
  combobox: ["closed", "open"],
  accordion: ["collapsed", "expanded"],
  "live-region": ["before message", "message shown"],
};

const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split("\n").find((l) => l.trim()) ?? "unknown error";

/** Page and console errors that mean a fixture didn't mount cleanly. A missing favicon doesn't count. */
function watchErrors(errors) {
  return (page) => {
    page.on("pageerror", (error) => errors.push(explainAngularError(error.message.split("\n")[0])));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/favicon|Failed to load resource/i.test(text) && !/\.(js|css)\b/.test(text)) return;
      errors.push(explainAngularError(text.split("\n")[0]));
    });
  };
}

/**
 * Bundle, and if the library needs an optional peer dependency that npm left out, install it and bundle once more.
 * @param {Parameters<typeof bundleEntries>[0]} options
 * @param {string[]} warnings Gets a note when peers were installed.
 */
async function bundleWithPeers(options, warnings) {
  try {
    return await bundleEntries(options);
  } catch (error) {
    const added = await installOptionalPeers({ dir: options.workDir, unresolved: error.unresolved ?? [] });
    if (added.installed.length === 0) throw error;
    warnings.push(...added.warnings);
    return bundleEntries(options);
  }
}

/** The installed package's own package.json, or an empty object. */
function readInstalledMeta(workDir, name) {
  try {
    return JSON.parse(readFileSync(join(workDir, "node_modules", name, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Load the whole package in a page to list its exports and the custom elements it defines. */
async function discover({ browser, workDir, flavor, pkg, buildDir, warnings }) {
  const adapter = adapterFor(flavor);
  const entryFile = join(workDir, "discover.js");
  writeFileSync(entryFile, adapter.discoverEntry(pkg));
  await bundleWithPeers({ entries: { discover: entryFile }, outdir: buildDir, workDir, framework: adapter }, warnings);
  const server = await serveStatic(buildDir);
  const errors = [];
  try {
    const opened = await openPage(browser, `${server.origin}/discover.html`, { beforeGoto: watchErrors(errors) });
    try {
      await opened.page.waitForFunction(() => window.__a11yExports !== undefined, undefined, { timeout: 15_000 });
    } catch {
      throw new Error(`The package didn't finish loading in the browser${errors.length ? `: ${errors[0]}` : "."}`);
    }
    const exportsList = await opened.page.evaluate(() => window.__a11yExports ?? []);
    const tags = await opened.page.evaluate(() => [...(window.__a11yDefined ?? [])]);
    // What each element says about itself, so a fixture can be built around it: observed attributes, class members, slots.
    const facts = await opened.page.evaluate((names) => {
      const out = {};
      for (const name of names.slice(0, 80)) {
        const Element = customElements.get(name);
        if (!Element) continue;
        const members = new Set();
        for (let proto = Element.prototype; proto && proto !== HTMLElement.prototype && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
          for (const key of Object.getOwnPropertyNames(proto)) if (!key.startsWith("_") && key !== "constructor") members.add(key);
        }
        let slots = [];
        try {
          const el = document.createElement(name);
          document.body.append(el);
          slots = [...(el.shadowRoot?.querySelectorAll("slot") ?? [])].map((slot) => slot.getAttribute("name") ?? "");
          el.remove();
        } catch {
          // An element that can't be created on its own has no slots to report.
        }
        const attributes = "observedAttributes" in Element && Array.isArray(Element.observedAttributes) ? Element.observedAttributes : [];
        out[name] = { attributes: [...attributes], members: [...members], slots: slots.filter(Boolean) };
      }
      return out;
    }, tags);
    await opened.close();
    return { exports: exportsList, tags, facts };
  } finally {
    await server.close();
  }
}

/** Open one fixture page, check it follows the contract, and run the tiers in each state. `libA11y` is `on`, `off`, or `n/a`. */
async function auditFixturePage({ browser, url, archetype, plan, libA11y }) {
  const errors = [];
  const opened = await openPage(browser, libA11y === "n/a" ? url : `${url}?libA11y=${libA11y}`, { beforeGoto: watchErrors(errors) });
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

    if (archetype === "live-region" && (await trigger.first().evaluate((el) => el.matches("[data-a11y-root]")))) {
      return { gap: "The fixture marks the same element as the trigger and the message. A live-region fixture needs a control that makes the message appear (data-a11y-trigger) and the message itself (data-a11y-root)." };
    }
    const states = STATES[archetype] ?? ["initial"];
    const configs = [];
    for (const [index, state] of states.entries()) {
      let failure = null;
      if (index > 0) {
        try {
          if (archetype === "tooltip") await trigger.first().focus();
          else await trigger.first().click();
          await opened.page.waitForFunction(
            (needsText) => {
              const root = document.querySelector("[data-a11y-root]");
              const shown = root && /** @type {HTMLElement} */ (root).getClientRects().length > 0;
              // A live region can be on the page and empty until the trigger fills it, so wait for the message itself.
              if (needsText) return Boolean(shown && ((root.textContent ?? "").trim() || root.getAttribute("aria-label") || root.getAttribute("aria-labelledby")));
              return shown || document.querySelector('[data-a11y-trigger][aria-expanded="true"]') !== null;
            },
            archetype === "live-region",
            { timeout: 3000 },
          );
        } catch {
          failure = `The ${state} state never appeared after activating the trigger. A fixture's data-a11y-root has to show up when the ${archetype} opens.`;
        }
      }
      await settleAnimations(opened.page);
      /** @type {TargetResult["archetypes"][string]["configs"][number]["tiers"]} */
      const tiers = {};
      for (const tier of plan.options.tiers) {
        if (tier === "interactions" || tier === "computed" || tier === "conditions") continue;
        if (tier === "vsr") tiers.vsr = failure ? { status: "skipped", simulated: true, reason: failure } : await runVsr(opened.page, { scope: "body", state }).catch(failedVsr);
        else if (failure) tiers.rules = { status: "failed", reason: failure, engines: Object.fromEntries(plan.options.engines.map((e) => [e, { status: "failed", reason: failure }])) };
        else {
          tiers.rules = await runRules(opened.page, { engines: plan.options.engines, wcag: plan.options.wcag, level: plan.options.level, scope: index === 0 ? "#root" : ["#root", "[data-a11y-root]"] });
        }
      }
      configs.push({ libA11y, state, tiers });
      if (errors.length) return { gap: `The fixture logged errors in the ${state} state: ${errors[0]}` };
    }
    const hidden = notTestableEntries(await closedShadowHosts(opened.page));
    // The checks open their own fresh pages, so run them after this page's rules results are in.
    if (plan.options.tiers.includes("interactions")) configs[0].tiers.interactions = await runInteractions(browser, libA11y === "n/a" ? url : `${url}?libA11y=${libA11y}`, archetype);
    if (plan.options.tiers.includes("computed")) configs[0].tiers.computed = await runComputed(browser, libA11y === "n/a" ? url : `${url}?libA11y=${libA11y}`, archetype);
    if (plan.options.tiers.includes("conditions")) configs[0].tiers.conditions = await runConditions(browser, libA11y === "n/a" ? url : `${url}?libA11y=${libA11y}`, archetype);
    return { configs, hidden };
  } finally {
    await opened.close();
  }
}

/**
 * Audit one fixture. A library that ships opt-in accessibility features runs once for each `--lib-a11y` value, and each result carries its label.
 * @param {{ browser: import("playwright-core").Browser, url: string, archetype: string, plan: Plan, toggle: boolean }} options
 * @returns {Promise<{ gap: string } | { configs: FixtureConfig[], hidden: string[] }>}
 */
async function auditFixture({ browser, url, archetype, plan, toggle }) {
  const values = toggle ? plan.options.libA11y : ["n/a"];
  const configs = [];
  const hidden = [];
  for (const libA11y of values) {
    const outcome = await auditFixturePage({ browser, url, archetype, plan, libA11y });
    if ("gap" in outcome) return { gap: toggle ? `With library accessibility ${libA11y}: ${outcome.gap}` : outcome.gap };
    configs.push(...outcome.configs);
    hidden.push(...outcome.hidden);
  }
  return { configs, hidden };
}

/**
 * Audit an npm package: install it on its own, find what it exports, and audit each archetype that has a fixture.
 * An archetype without a usable fixture is a gap with a reason, never a pass.
 * @param {{ browser: import("playwright-core").Browser, planTarget: Plan["targets"][number], plan: Plan, cwd: string, install?: typeof installPackage }} options
 * @returns {Promise<{ result: TargetResult, mapping: TargetMapping | null, files?: Record<string, string> }>}
 */
export async function auditNpm({ browser, planTarget, plan, cwd, install = installPackage }) {
  install ??= installPackage;
  const base = { id: planTarget.id, reason: null, archetypes: {}, summary: { engines: {}, gaps: [], notTestable: [] }, warnings: [] };
  const resolved = planTarget.resolved ?? {};
  if (planTarget.kind === "npm-unsupported") {
    return { result: { ...base, status: "unsupported", reason: `${resolved.framework ?? "This framework"} packages aren't supported.${resolved.framework === "Angular" && resolved.detectedBy ? ` ${resolved.detectedBy}` : ""} This version covers React, Vue 3, Angular ${ANGULAR_FLOOR} and newer, and web components.` }, mapping: null };
  }
  const tmp = mkdtempSync(join(tmpdir(), "automatica11y-npm-"));
  const workDir = join(tmp, "install");
  const buildDir = join(tmp, "build");
  const fixtureDir = join(tmp, "fixtures");
  mkdirSync(fixtureDir, { recursive: true });
  const servers = [];
  try {
    /** The framework's id (react, vue, or wc), or "unknown" when the metadata couldn't say. */
    const adapterId = adapterForKind(planTarget.kind)?.id;
    /** @type {"react" | "vue" | "angular" | "html" | "wc" | "unknown"} */
    let flavor = adapterId === "react" || adapterId === "vue" || adapterId === "angular" || adapterId === "html" || adapterId === "wc" ? adapterId : "unknown";
    const installed = await install({ dir: workDir, name: resolved.name, version: resolved.version, flavor });
    const warnings = [...installed.warnings];
    // What fixtures and templates import: the package, or the sub-path of it that was asked for.
    const importSpec = resolved.subpath ? `${resolved.name}/${resolved.subpath}` : resolved.name;
    if (resolved.subpath) {
      const problem = subpathProblem(workDir, resolved.name, resolved.subpath, installed.version ?? resolved.version);
      if (problem) throw new Error(problem);
    }

    // The other packages of a list target (`npm:a,b`) go into the same folder, so the scripts and styles of one see the others.
    /** @type {Array<{ name: string, subpath: string | null, version: string | null }>} */
    const companions = [];
    const alreadyInstalled = new Set([resolved.name]);
    for (const companion of planTarget.companions ?? []) {
      // A second entry for a package that's already in the folder (a stylesheet and a script from one package) needs no second install.
      const added = alreadyInstalled.has(companion.name) ? { warnings: [], version: installedVersion(workDir, companion.name) } : await install({ dir: workDir, name: companion.name, version: companion.version, flavor: "unknown" });
      warnings.push(...added.warnings);
      if (companion.subpath) {
        const problem = subpathProblem(workDir, companion.name, companion.subpath, added.version ?? companion.version);
        if (problem) throw new Error(problem);
      }
      alreadyInstalled.add(companion.name);
      companions.push({ name: companion.name, subpath: companion.subpath ?? null, version: added.version ?? companion.version });
    }

    // Packages the mapping names (a token stylesheet, a theme) go in beside the library, so a fixture can import them.
    const extras = await installExtraPackages({ dir: workDir, specs: Object.values(planTarget.mapping ?? {}).flatMap((entry) => entry.install ?? []) });
    warnings.push(...extras.warnings);

    // What the install left behind that an adapter's entry needs to know about, such as whether zone.js came with the library.
    const listed = [{ name: resolved.name, subpath: resolved.subpath ?? null }, ...companions.map((c) => ({ name: c.name, subpath: c.subpath }))];
    let context = adapterForKind(planTarget.kind)?.inspect?.(workDir, listed) ?? {};

    // Plain HTML has no exports or elements to list. What it loads came from the target itself.
    let found = flavor === "html" ? { exports: [], tags: [], facts: {} } : await discover({ browser, workDir, flavor: flavor === "unknown" ? "wc" : flavor, pkg: importSpec, buildDir, warnings });
    if (flavor === "unknown") {
      if (found.tags.length > 0) flavor = "wc";
      else if (installed.react && found.exports.some((e) => /^[A-Z]/.test(e.name))) flavor = "react";
      // Nothing to load as a component, but the package ships stylesheets or browser scripts: it's plain HTML.
      else if (shipsBrowserAssets(readInstalledMeta(workDir, resolved.name))) {
        flavor = "html";
        found = { exports: [], tags: [], facts: {} };
        context = adapterFor("html").inspect?.(workDir, listed) ?? {};
      }
    }
    if (flavor === "html") {
      const assets = /** @type {any} */ (context).assets;
      if (!assets || (assets.styles.length === 0 && assets.scripts.length === 0)) {
        warnings.push("The target didn't name a stylesheet or a script, so the page loaded none and the templates ran on the browser's own styles. Name them as sub-paths, such as npm:name/style.css.");
      }
    }
    if (flavor === "unknown" || (flavor === "wc" && found.tags.length === 0)) {
      // Some packages keep their components in sub-paths and leave the main entry nearly empty.
      const hints = resolved.subpath ? [] : offeredSubpaths(workDir, resolved.name);
      const where = hints.length ? ` Some packages keep their components in sub-paths, and this one exports ${hints.join(", ")}. Try one, for example npm:${hints[0]}.` : "";
      return { result: { ...base, status: "not-applicable", reason: `The package has no rendering surface. It exports no components for a supported framework and defines no custom elements.${where}`, warnings }, mapping: null };
    }

    const candidates = candidateMapping({ flavor, exports: found.exports, tags: found.tags });
    if (flavor === "html") {
      // There's no component to find, so an archetype is either a fixture someone writes or a gap that says so.
      for (const [archetype, entry] of Object.entries(candidates)) {
        if (adapterFor("html").template(archetype, "")) Object.assign(entry, { status: "template", reason: undefined });
        else if (entry.status === "no-match") Object.assign(entry, { status: "needs-fixture", reason: `Plain HTML has no component to find, so the ${archetype} archetype needs a fixture someone writes.` });
      }
    }
    const adapter = adapterFor(flavor);
    const wanted = plan.options.archetypes ?? ARCHETYPES;
    /** @type {TargetMapping} */
    const mapping = {};
    /** @type {TargetResult["archetypes"]} */
    const archetypes = {};
    const gaps = [];
    const hidden = [];
    /** Files to write beside the report: the fixtures the tool generated, so they can be reviewed and adopted. */
    const files = {};
    /** Where each archetype's fixture came from, for the results. */
    const sources = {};
    /** One server for the probes, started when the first one is needed. */
    let probeServer = null;
    const getServer = async () => {
      if (!probeServer) {
        mkdirSync(buildDir, { recursive: true });
        probeServer = await serveStatic(buildDir);
        servers.push(probeServer);
      }
      return probeServer;
    };

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
        const source = adapter.template(archetype, importSpec, flavor === "wc" ? entry.tag : entry.export, found.exports.find((e) => e.name === entry.export));
        if (source) {
          entry.status = "template";
          delete entry.reason;
          fixture = join(fixtureDir, `${archetype}.${adapter.extension}`);
          writeFileSync(fixture, source);
        }
      }
      /** @type {FixtureInfo | null} */
      let source = fixture ? { source: entry.status === "authored" ? "authored" : "template" } : null;
      let attempts = [];
      let generationTried = false;
      // Nothing authored and no template: build candidates from what the package exports, and keep one only if it works.
      if (!fixture && !user.fixture && plan.options.generate !== false && GENERATABLE.has(archetype) && !(entry.status === "no-match" && flavor === "wc")) {
        const generated = await generateFixture({ browser, adapter, archetype, entry, found, explicit: Boolean(user.export), pkg: importSpec, tmp, workDir, buildDir, context, getServer, bundle: (options) => bundleWithPeers(options, warnings) });
        attempts = generated.attempts;
        generationTried = attempts.length > 0;
        if (generated.ok && generated.winner) {
          const { winner } = generated;
          const relative = `generated/${planTarget.id}/${archetype}.${winner.extension}`;
          files[relative] = winner.source;
          fixture = winner.file;
          entry.status = "generated";
          entry.recipe = winner.recipe;
          entry.summary = winner.summary;
          entry.used = winner.used;
          entry.generatedFile = relative;
          delete entry.reason;
          source = { source: "generated", recipe: winner.recipe, summary: winner.summary, used: winner.used, file: relative, attempts };
        } else if (generated.reason && (generationTried || entry.status !== "no-match")) {
          entry.reason = `${entry.status === "no-match" ? "" : `${entry.reason ?? `The ${archetype} archetype needs a fixture someone writes.`} `}Generating one didn't work. ${generated.reason}`.trim();
        }
      }
      mapping[archetype] = entry;
      if (!fixture) {
        // A no-match archetype has no component to write a fixture for, unless a generator looked and said why it couldn't build one.
        const writable = entry.status !== "no-match" || generationTried;
        const reason = entry.reason ?? `The ${archetype} archetype needs a fixture someone writes.`;
        archetypes[archetype] = { status: "gap", reason: writable ? `${reason} Write fixtures/${planTarget.id}/${archetype}.${adapter.extension}.` : reason, configs: [], ...(attempts.length ? { fixture: { source: "none", attempts } } : {}) };
        gaps.push(`archetype:${archetype}`);
        continue;
      }
      const entryFile = join(tmp, "entries", `${archetype}-entry.js`);
      mkdirSync(join(tmp, "entries"), { recursive: true });
      writeFileSync(entryFile, adapter.entry(fixture, importSpec, context));
      try {
        await bundleWithPeers({ entries: { [archetype]: entryFile }, outdir: buildDir, workDir, framework: adapter }, warnings);
        runnable[archetype] = `/${archetype}.html`;
        sources[archetype] = source;
      } catch (error) {
        archetypes[archetype] = { status: "gap", reason: `The fixture didn't bundle. ${firstLine(error)}`, configs: [], ...(attempts.length ? { fixture: { source: "none", attempts } } : {}) };
        gaps.push(`archetype:${archetype}`);
        entry.status = "needs-fixture";
        entry.reason = firstLine(error);
      }
    }

    if (Object.keys(runnable).length > 0) {
      const live = await serveStatic(buildDir);
      servers.push(live);
      for (const [archetype, path] of Object.entries(runnable)) {
        const outcome = await auditFixture({ browser, url: `${live.origin}${path}`, archetype, plan, toggle: mapping[archetype].libA11y === true }).catch((error) => ({ gap: firstLine(error) }));
        const fixtureInfo = sources[archetype];
        if ("gap" in outcome) {
          archetypes[archetype] = { status: "gap", reason: outcome.gap, configs: [], ...(fixtureInfo?.attempts?.length ? { fixture: { source: "none", attempts: fixtureInfo.attempts } } : {}) };
          gaps.push(`archetype:${archetype}`);
          mapping[archetype].status = "needs-fixture";
          mapping[archetype].reason = outcome.gap;
        } else {
          archetypes[archetype] = { status: "ran", configs: outcome.configs, ...(fixtureInfo ? { fixture: fixtureInfo } : {}) };
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
          subpath: resolved.subpath ?? null,
          version: installed.version ?? resolved.version,
          ...(companions.length ? { companions } : {}),
          flavor,
          framework: resolved.framework ?? null,
          react: installed.react,
          reactDom: installed.reactDom,
          vue: installed.vue ?? null,
          angular: installed.angular ?? null,
          ...(flavor === "html" ? { assets: /** @type {any} */ (context).assets } : {}),
          tags: flavor === "wc" ? found.tags : [],
        },
        summary: (() => {
          const base = summarize(ordered, plan.options.engines, gaps);
          return { ...base, notTestable: [...base.notTestable, ...hidden] };
        })(),
        warnings,
      },
      mapping: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, { ...v, fixture: v.fixture ?? null }])),
      files,
    };
  } finally {
    for (const s of servers) await s.close();
    if (!process.env.AUTOMATICA11Y_KEEP_TEMP) rmSync(tmp, { recursive: true, force: true });
  }
}
