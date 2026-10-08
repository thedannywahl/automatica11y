import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { checkEnvironment } from "../env/browser.js";
import { readToolVersions } from "../env/versions.js";
import { launchBrowser } from "../harness/browser.js";
import { serveStatic } from "../harness/static-serve.js";
import { listStories, readIndex, selectStories, storyUrl, waitForStory } from "../harness/storybook.js";
import { closedShadowHosts, notTestableEntries } from "../harness/shadow.js";
import { NOT_APPLICABLE_FOR_PAGES } from "../tiers/interactions/index.js";
import { failedVsr, runVsr } from "../tiers/vsr.js";
import { openPage } from "../harness/url.js";
import { renderReport } from "../report/single.js";
import { num } from "../text.js";
import { parseResults } from "../schema.js";
import { runRules, selfTest } from "../tiers/rules/index.js";
import { evaluateFailCheck } from "./fail-check.js";
import { mapPool } from "./pool.js";
import { auditNpm } from "./audit-npm.js";
import { failedTarget, summarize } from "./summary.js";

/** How many stories to audit at once. */
const STORY_CONCURRENCY = 4;

const EXIT = { OK: 0, FAIL_THRESHOLD: 1, ENVIRONMENT: 3, ALL_TARGETS_FAILED: 4 };

const NPM_KINDS = new Set(["npm", "npm-react", "npm-wc", "npm-unsupported"]);
const UNSUPPORTED_KIND = (kind) => `${kind} targets aren't supported.`;

/** Audit one page and return its target result. */
async function auditPage(browser, url, planTarget, plan, extraWarnings) {
  const opened = await openPage(browser, url);
  try {
    /** @type {Record<string, any>} */
    const tiers = {};
    for (const tier of plan.options.tiers) {
      if (tier === "rules") {
        tiers.rules = await runRules(opened.page, { engines: plan.options.engines, wcag: plan.options.wcag, level: plan.options.level });
      } else if (tier === "interactions") {
        tiers.interactions = NOT_APPLICABLE_FOR_PAGES;
      } else {
        tiers.vsr = await runVsr(opened.page, { scope: "body" }).catch(failedVsr);
      }
    }
    const archetypes = { page: { status: "ran", configs: [{ libA11y: "n/a", tiers }] } };
    const hidden = notTestableEntries(await closedShadowHosts(opened.page));
    const summary = summarize(archetypes, plan.options.engines);
    summary.notTestable = [...summary.notTestable, ...hidden];
    return {
      id: planTarget.id,
      status: "ran",
      reason: null,
      archetypes,
      summary,
      warnings: [...extraWarnings, ...opened.warnings, ...hidden.map((h) => `Not testable: ${h}.`)],
    };
  } finally {
    await opened.close();
  }
}

/** Audit one story in its own page. The story's root element is the scope, so page-level rules don't fire. */
async function auditStory(browser, base, story, plan) {
  const opened = await openPage(browser, storyUrl(base, story.id));
  try {
    await waitForStory(opened.page);
    /** @type {Record<string, any>} */
    const tiers = {};
    for (const tier of plan.options.tiers) {
      tiers[tier] =
        tier === "rules"
          ? await runRules(opened.page, { engines: plan.options.engines, wcag: plan.options.wcag, level: plan.options.level, scope: "#storybook-root" })
          : tier === "interactions"
            ? NOT_APPLICABLE_FOR_PAGES
            : await runVsr(opened.page, { scope: "#storybook-root" }).catch(failedVsr);
    }
    const hidden = notTestableEntries(await closedShadowHosts(opened.page));
    return { id: story.id, ok: true, archetype: { status: "ran", configs: [{ libA11y: "n/a", tiers }] }, hidden };
  } catch (error) {
    return { id: story.id, ok: false, reason: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  } finally {
    await opened.close();
  }
}

/** Audit a Storybook: list the stories, pick the ones to run, and audit each as its own unit. */
async function auditStorybook(browser, planTarget, plan, servers) {
  const resolved = planTarget.resolved;
  const index = await readIndex(resolved);
  const stories = listStories(index);
  if (stories.length === 0) return failedTarget(planTarget.id, "The Storybook index lists no stories.");
  const picked = selectStories(stories, { archetypes: plan.options.archetypes, max: plan.options.maxStories });
  if (picked.selected.length === 0) {
    return failedTarget(planTarget.id, `No stories matched the archetypes ${plan.options.archetypes.join(", ")}.`);
  }
  let base = resolved.url;
  if (resolved.path) {
    const server = await serveStatic(resolved.path);
    servers.push(server);
    base = `${server.origin}/`;
  }
  const audited = await mapPool(picked.selected, STORY_CONCURRENCY, (story) => auditStory(browser, base, story, plan));

  const archetypes = {};
  const failedStories = [];
  for (const item of audited) {
    if (item.ok) archetypes[`story:${item.id}`] = item.archetype;
    else {
      archetypes[`story:${item.id}`] = { status: "gap", configs: [] };
      failedStories.push({ id: item.id, reason: item.reason });
    }
  }
  const warnings = [];
  if (picked.truncated) {
    warnings.push(`The story cap cut the list short. ${num(picked.selected.length)} of ${num(picked.matched)} ${plan.options.archetypes ? "matching " : ""}stories ${picked.selected.length === 1 ? "was" : "were"} audited, spread across components. Raise --max-stories to audit more.`);
  }
  const gaps = failedStories.map((f) => `story:${f.id}`);
  for (const archetype of plan.options.archetypes ?? []) {
    if (!picked.matchedByArchetype[archetype]) {
      gaps.push(`archetype:${archetype}`);
      warnings.push(`No stories matched the ${archetype} archetype. That's a gap in coverage, not a pass.`);
    }
  }
  const ranCount = audited.filter((item) => item.ok).length;
  if (ranCount === 0) return failedTarget(planTarget.id, `None of the ${audited.length} audited stories rendered.`);
  return {
    id: planTarget.id,
    status: "ran",
    reason: null,
    archetypes,
    storybook: {
      index: resolved.index,
      total: picked.total,
      matched: picked.matched,
      audited: audited.length,
      truncated: picked.truncated,
      maxStories: plan.options.maxStories,
      archetypeMatches: picked.matchedByArchetype,
      failedStories,
    },
    summary: (() => {
      const base = summarize(archetypes, plan.options.engines, gaps);
      return { ...base, notTestable: [...base.notTestable, ...audited.flatMap((item) => (item.ok ? item.hidden.map((h) => `${item.id}: ${h}`) : []))] };
    })(),
    warnings,
  };
}

/** Run one target. Anything that goes wrong becomes a failed result, so one target can't stop the rest. */
async function runTarget(browser, planTarget, plan, io) {
  if (planTarget.status === "failed") return { result: failedTarget(planTarget.id, planTarget.reason), mapping: null };
  const servers = [];
  try {
    const pageNote = plan.options.archetypes ? ["--archetypes only applies to Storybook and npm targets. This page was checked as a whole."] : [];
    if (planTarget.kind === "storybook") return { result: await auditStorybook(browser, planTarget, plan, servers), mapping: null };
    if (NPM_KINDS.has(planTarget.kind)) return await auditNpm({ browser, planTarget, plan, cwd: io.cwd, install: io.installPackage });
    if (planTarget.kind === "url") return { result: await auditPage(browser, planTarget.resolved.url, planTarget, plan, pageNote), mapping: null };
    if (planTarget.kind === "html-file") {
      const file = planTarget.resolved.path;
      const server = await serveStatic(dirname(file));
      servers.push(server);
      return { result: await auditPage(browser, `${server.origin}/${encodeURIComponent(basename(file))}`, planTarget, plan, pageNote), mapping: null };
    }
    if (planTarget.kind === "static-dir") {
      const dir = planTarget.resolved.path;
      if (!existsSync(resolve(dir, "index.html"))) return { result: failedTarget(planTarget.id, "The directory has no index.html to check."), mapping: null };
      const server = await serveStatic(dir);
      servers.push(server);
      return { result: await auditPage(browser, `${server.origin}/`, planTarget, plan, ["Only index.html was checked. Other pages in the directory weren't.", ...pageNote]), mapping: null };
    }
    return { result: failedTarget(planTarget.id, UNSUPPORTED_KIND(planTarget.kind)), mapping: null };
  } catch (error) {
    return { result: failedTarget(planTarget.id, error instanceof Error ? error.message.split("\n")[0] : String(error)), mapping: null };
  } finally {
    for (const server of servers) await server.close();
  }
}

/** A short line per target for the terminal. */
function describeResult(target) {
  if (target.status !== "ran") return `${target.id}: ${target.status} (${target.reason})`;
  const parts = Object.entries(target.summary.engines).map(([engine, s]) => {
    if (s.status !== "ran") return `${engine} ${s.status}`;
    const extra = engine === "axe" ? Object.entries(s.violationsByImpact).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`) : [];
    return `${engine} ${s.violations} violation${s.violations === 1 ? "" : "s"}${extra.length ? ` (${extra.join(", ")})` : ""}, ${s.needsReview} to review`;
  });
  return `${target.id}: ${parts.join("; ") || "no engines ran"}`;
}

/**
 * Run a plan: check the environment, launch one browser, audit each target, write results.json and report.md.
 * @param {any} plan
 * @param {import("../commands/common.js").Io} io
 * @returns {Promise<number>} The exit code.
 */
export async function runPlan(plan, io) {
  const environment = await checkEnvironment({ env: io.env, platform: io.platform });
  if (!environment.ok) {
    for (const problem of environment.problems) io.stderr.write(`${problem.message}\n  Fix: ${problem.fix}\n`);
    return EXIT.ENVIRONMENT;
  }
  let session;
  try {
    session = await launchBrowser({ env: io.env, platform: io.platform });
  } catch (error) {
    io.stderr.write(`Couldn't start the browser: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n  Run "automatica11y doctor" to check the setup.\n`);
    return EXIT.ENVIRONMENT;
  }
  const { browser, version } = session;
  try {
    if (plan.options.tiers.includes("rules")) {
      const test = await selfTest(browser, plan.options.engines);
      if (!test.passed) {
        io.stderr.write(`The rule engines failed their self-test, so no results are reported.\n${test.problems.map((p) => `  ${p}`).join("\n")}\n`);
        return EXIT.ENVIRONMENT;
      }
    }
    const targets = [];
    const mappings = {};
    for (const planTarget of plan.targets) {
      const { result, mapping } = await runTarget(browser, planTarget, plan, io);
      targets.push(result);
      if (mapping) {
        mappings[planTarget.id] = mapping;
        planTarget.mapping = mapping;
      }
      if (result.npm) planTarget.kind = result.npm.flavor === "react" ? "npm-react" : "npm-wc";
    }

    const results = parseResults({
      schema: 1,
      planRef: "plan.json",
      runAt: new Date().toISOString(),
      tools: readToolVersions({ chromium: version }),
      targets,
      failCheck: evaluateFailCheck(targets, plan.options.fail),
      warnings: [],
    });
    const outDir = resolve(io.cwd, plan.options.out);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(resolve(outDir, "report.md"), renderReport({ plan, results }));
    if (Object.keys(mappings).length > 0) {
      // The candidate mapping, in the shape --mapping reads, so it can be edited and passed back in.
      writeFileSync(resolve(outDir, "mapping.json"), `${JSON.stringify(mappings, null, 2)}\n`);
      writeFileSync(resolve(outDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    }

    const lines = ["", ...results.targets.map((t) => `  ${describeResult(t)}`)];
    if (results.failCheck) lines.push(`  Fail check (${results.failCheck.mode}): ${results.failCheck.tripped ? "tripped" : "not tripped"}`);
    lines.push(`  Wrote ${resolve(outDir, "results.json")}`, `  Wrote ${resolve(outDir, "report.md")}`);
    io.stdout.write(`${lines.join("\n")}\n`);

    if (!results.targets.some((t) => t.status === "ran")) {
      io.stderr.write("No target produced results.\n");
      return EXIT.ALL_TARGETS_FAILED;
    }
    return results.failCheck?.tripped ? EXIT.FAIL_THRESHOLD : EXIT.OK;
  } finally {
    await browser.close().catch(() => {});
  }
}
