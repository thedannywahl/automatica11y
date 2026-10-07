import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { checkEnvironment } from "../env/browser.js";
import { readToolVersions } from "../env/versions.js";
import { launchBrowser } from "../harness/browser.js";
import { serveStatic } from "../harness/static-serve.js";
import { listStories, readIndex, selectStories, storyUrl, waitForStory } from "../harness/storybook.js";
import { closedShadowHosts, notTestableEntries } from "../harness/shadow.js";
import { openPage } from "../harness/url.js";
import { renderReport } from "../report/single.js";
import { num } from "../text.js";
import { parseResults } from "../schema.js";
import { runRules, selfTest } from "../tiers/rules/index.js";
import { evaluateFailCheck } from "./fail-check.js";
import { mapPool } from "./pool.js";

/** How many stories to audit at once. */
const STORY_CONCURRENCY = 4;

const EXIT = { OK: 0, FAIL_THRESHOLD: 1, ENVIRONMENT: 3, ALL_TARGETS_FAILED: 4 };

const NOT_BUILT = {
  interactions: "The interactions tier isn't built yet (M5).",
  vsr: "The virtual screen reader tier isn't built yet (M6).",
};

const UNSUPPORTED_KIND = (kind) => `${kind} targets aren't built yet (M4).`;

/** Roll the engine results up into counts. Impact counts belong to axe and Toolkit-level counts belong to IBM. */
function summarize(archetypes, engines, gaps = []) {
  const summary = { engines: {}, gaps, notTestable: [] };
  for (const engine of engines) {
    const results = Object.values(archetypes).flatMap((a) => a.configs.map((c) => c.tiers.rules?.engines?.[engine]).filter(Boolean));
    if (results.length === 0) continue;
    const ran = results.filter((r) => r.status === "ran");
    const entry = {
      status: ran.length ? "ran" : results[0].status,
      violations: ran.reduce((n, r) => n + r.violations.length, 0),
      needsReview: ran.reduce((n, r) => n + r.incomplete.length, 0),
    };
    if (engine === "axe") {
      entry.violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const r of ran) for (const f of r.violations) if (f.impact) entry.violationsByImpact[f.impact] += 1;
    }
    if (engine === "ibm") {
      entry.violationsByToolkitLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const r of ran) for (const f of r.violations) if (f.toolkitLevel != null) entry.violationsByToolkitLevel[f.toolkitLevel] += 1;
    }
    summary.engines[engine] = entry;
  }
  return summary;
}

function failedTarget(id, reason) {
  return { id, status: "failed", reason, archetypes: {}, summary: { engines: {}, gaps: [], notTestable: [] }, warnings: [] };
}

/** Audit one page and return its target result. */
async function auditPage(browser, url, planTarget, plan, extraWarnings) {
  const opened = await openPage(browser, url);
  try {
    /** @type {Record<string, any>} */
    const tiers = {};
    for (const tier of plan.options.tiers) {
      if (tier === "rules") {
        tiers.rules = await runRules(opened.page, { engines: plan.options.engines, wcag: plan.options.wcag, level: plan.options.level });
      } else {
        tiers[tier] = { status: "skipped", reason: NOT_BUILT[tier] };
      }
    }
    const archetypes = { page: { status: "ran", configs: [{ libA11y: "n/a", tiers }] } };
    const hidden = notTestableEntries(await closedShadowHosts(opened.page));
    const summary = summarize(archetypes, plan.options.engines);
    summary.notTestable = hidden;
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
          : { status: "skipped", reason: NOT_BUILT[tier] };
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
    summary: { ...summarize(archetypes, plan.options.engines, gaps), notTestable: audited.flatMap((item) => (item.ok ? item.hidden.map((h) => `${item.id}: ${h}`) : [])) },
    warnings,
  };
}

/** Run one target. Anything that goes wrong becomes a failed result, so one target can't stop the rest. */
async function runTarget(browser, planTarget, plan) {
  if (planTarget.status === "failed") return failedTarget(planTarget.id, planTarget.reason);
  const servers = [];
  try {
    const pageNote = plan.options.archetypes ? ["--archetypes only applies to Storybook and npm targets. This page was checked as a whole."] : [];
    if (planTarget.kind === "storybook") return await auditStorybook(browser, planTarget, plan, servers);
    if (planTarget.kind === "url") return await auditPage(browser, planTarget.resolved.url, planTarget, plan, pageNote);
    if (planTarget.kind === "html-file") {
      const file = planTarget.resolved.path;
      const server = await serveStatic(dirname(file));
      servers.push(server);
      return await auditPage(browser, `${server.origin}/${encodeURIComponent(basename(file))}`, planTarget, plan, pageNote);
    }
    if (planTarget.kind === "static-dir") {
      const dir = planTarget.resolved.path;
      if (!existsSync(resolve(dir, "index.html"))) return failedTarget(planTarget.id, "The directory has no index.html to check.");
      const server = await serveStatic(dir);
      servers.push(server);
      return await auditPage(browser, `${server.origin}/`, planTarget, plan, ["Only index.html was checked. Other pages in the directory weren't.", ...pageNote]);
    }
    return failedTarget(planTarget.id, UNSUPPORTED_KIND(planTarget.kind));
  } catch (error) {
    return failedTarget(planTarget.id, error instanceof Error ? error.message.split("\n")[0] : String(error));
  } finally {
    for (const server of servers) await server.close();
  }
}

/** A short line per target for the terminal. */
function describeResult(target) {
  if (target.status === "failed") return `${target.id}: failed (${target.reason})`;
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
    for (const planTarget of plan.targets) targets.push(await runTarget(browser, planTarget, plan));

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

    const lines = ["", ...results.targets.map((t) => `  ${describeResult(t)}`)];
    if (results.failCheck) lines.push(`  Fail check (${results.failCheck.mode}): ${results.failCheck.tripped ? "tripped" : "not tripped"}`);
    lines.push(`  Wrote ${resolve(outDir, "results.json")}`, `  Wrote ${resolve(outDir, "report.md")}`);
    io.stdout.write(`${lines.join("\n")}\n`);

    if (results.targets.every((t) => t.status === "failed")) {
      io.stderr.write("Every target failed.\n");
      return EXIT.ALL_TARGETS_FAILED;
    }
    return results.failCheck?.tripped ? EXIT.FAIL_THRESHOLD : EXIT.OK;
  } finally {
    await browser.close().catch(() => {});
  }
}
