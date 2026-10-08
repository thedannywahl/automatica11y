import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { runConditions } from "../src/tiers/conditions/index.js";

const dir = new URL("./fixtures/conditions/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @type {any} */
let session;
/** @type {any} */
let server;
before(async () => {
  if (skip) return;
  session = await launchBrowser();
  server = await serveStatic(dir);
});
after(async () => {
  await session?.browser.close();
  await server?.close();
});

const P = "pass";
const F = "fail";
const N = "not-applicable";
const NAMES = ["reduced-motion-respected", "dark-mode-contrast", "more-contrast-respected", "less-contrast-stays-readable", "reduced-transparency-respected", "forced-colors-focus-visible", "reflow-at-320px", "text-spacing-no-clipping"];

/** One page per row: the archetype, then the result of each check in order (motion, dark mode, more contrast, less contrast, transparency, forced colors, reflow, spacing). */
/** @type {Record<string, [string, string[]]>} */
const PAGES = {
  base: ["button", [N, N, N, N, N, P, P, P]],
  "motion-good": ["button", [P, N, N, N, N, P, P, P]],
  "motion-bad": ["button", [F, N, N, N, N, P, P, P]],
  "motion-fade-only": ["button", [P, N, N, N, N, P, P, P]],
  "motion-transition-bad": ["button", [F, N, N, N, N, P, P, P]],
  "motion-transition-good": ["button", [P, N, N, N, N, P, P, P]],
  "scheme-good": ["button", [N, P, N, N, N, P, P, P]],
  "scheme-bad": ["button", [N, F, N, N, N, P, P, P]],
  "forced-bad": ["button", [N, N, N, N, N, F, P, P]],
  "reflow-bad": ["button", [N, N, N, N, N, P, F, P]],
  "reflow-scroll-ok": ["button", [N, N, N, N, N, P, P, P]],
  "spacing-bad": ["button", [N, N, N, N, N, P, P, F]],
  "spacing-sr-only": ["button", [N, N, N, N, N, P, P, P]],
  "contrast-more-good": ["button", [N, N, P, N, N, P, P, P]],
  "contrast-more-worse": ["button", [N, N, F, N, N, P, P, P]],
  "contrast-less-good": ["button", [N, N, N, P, N, P, P, P]],
  "contrast-less-bad": ["button", [N, N, N, F, N, P, P, P]],
  "transparency-good": ["button", [N, N, N, N, P, P, P, P]],
  "transparency-bad": ["button", [N, N, N, N, F, P, P, P]],
  "whole-page": ["page", [N, N, N, N, N, P, P, P]],
};

for (const [page, [archetype, expected]] of Object.entries(PAGES)) {
  test(`${page}: each conditions check gives its known result`, { skip, timeout: 180_000 }, async () => {
    const result = await runConditions(session.browser, `${server.origin}/${page}.html`, archetype);
    assert.equal(result.status, "ran");
    assert.deepEqual(result.checks.map((c) => c.name), NAMES);
    assert.deepEqual(result.checks.map((c) => c.result), expected, JSON.stringify(result.checks.map((c) => `${c.name}: ${c.detail}`), null, 1));
    for (const check of result.checks) {
      assert.ok(check.detail.length > 10, `${check.name} explains itself`);
      assert.ok(check.criteria.length > 0, `${check.name} names its WCAG criteria`);
    }
  });
}

test("a failure says what moved, which element overflowed, or what got clipped", { skip, timeout: 400_000 }, async () => {
  const detail = async (page, name) => (await runConditions(session.browser, `${server.origin}/${page}.html`, "button")).checks.find((c) => c.name === name).detail;
  assert.match(await detail("motion-bad", "reduced-motion-respected"), /still moves or repeats: slide on div\.spin \(moves transform; 1000ms, repeats forever\)/);
  assert.match(await detail("motion-transition-bad", "reduced-motion-respected"), /transform on div#panel/);
  assert.match(await detail("reflow-bad", "reflow-at-320px"), /div\.wide ends at 6\d\dpx/);
  assert.match(await detail("spacing-bad", "text-spacing-no-clipping"), /span\.tag \("Status ok"\)/);
  assert.match(await detail("forced-bad", "forced-colors-focus-visible"), /box-shadow or a background color disappears in forced colors/);
  assert.match(await detail("scheme-bad", "dark-mode-contrast"), /In dark mode, .* text fall/);
  assert.match(await detail("contrast-more-worse", "more-contrast-respected"), /With prefers-contrast: more, one piece of text falls below the minimum contrast\. The worst is "Plain text for the page\." at 2\.8\d:1/);
  assert.match(await detail("contrast-less-bad", "less-contrast-stays-readable"), /With prefers-contrast: less, .* "Plain text for the page\." at 1\.9\d:1/);
  assert.match(await detail("transparency-bad", "reduced-transparency-respected"), /div\.card \(60% opaque, backdrop-filter blur\(8px\)\)/);
});

test("the checks record the numbers they measured", { skip, timeout: 200_000 }, async () => {
  const { checks } = await runConditions(session.browser, `${server.origin}/motion-bad.html`, "button");
  const motion = checks.find((c) => c.name === "reduced-motion-respected");
  assert.deepEqual(motion.measurements.map((m) => [m.setting, m.moveOrRepeat]), [["no preference", 1], ["reduce", 1]]);
  const reflow = (await runConditions(session.browser, `${server.origin}/reflow-bad.html`, "button")).checks.find((c) => c.name === "reflow-at-320px");
  assert.equal(reflow.measurements[0].viewportWidth, 320);
  assert.ok(reflow.measurements[0].scrollWidth > 320);
});

/** Run the CLI on pages from this folder and read back what it wrote. */
async function audit(args) {
  const cwd = makeTree();
  const { io, out } = makeIo({ cwd, env: process.env });
  const code = await main(args, io);
  const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
  return { code, results, report: readFileSync(join(cwd, "a11y-report", "report.md"), "utf8"), ...out };
}

test("a page target runs the conditions tier, and the report and results carry it", { skip, timeout: 180_000 }, async () => {
  const run = await audit(["audit", `${dir}motion-bad.html`, "--tiers", "computed,conditions"]);
  assert.equal(run.code, 0, run.stderr);
  const target = run.results.targets[0];
  const tiers = target.archetypes.page.configs[0].tiers;
  assert.equal(tiers.computed.status, "not-applicable");
  assert.equal(tiers.conditions.status, "ran");
  assert.deepEqual(tiers.conditions.checks.map((c) => c.name), NAMES);
  assert.deepEqual(target.summary.conditions, { pass: 3, fail: 1, undetermined: 0, notApplicable: 4, error: 0 });
  assert.match(run.report, /### Conditions\./, "the coverage matrix has a Conditions table");
  assert.match(run.report, /\| motion-bad\.html \| not-applicable \| ran, one failed, three passed, four not applicable \|/);
  assert.match(run.report, /#### Conditions\./, "the details have a Conditions section");
  assert.match(run.report, /\| `reduced-motion-respected` \| fail \| \[2\.3\.3 Animation from Interactions\]\(https:\/\/www\.w3\.org\/TR\/WCAG22\/#animation-from-interactions\), \[2\.2\.2 Pause, Stop, Hide\]/);
  assert.match(run.report, /never added to the axe-core or IBM Equal Access counts/);
  assert.match(run.report, /Computed checks: .*Page and Storybook targets don't have one/, "the computed tier says why it didn't run on a page");
});

test("a comparison puts the conditions results of each page side by side", { skip, timeout: 240_000 }, async () => {
  const run = await audit(["compare", `good=${dir}motion-good.html`, `bad=${dir}motion-bad.html`, "--tiers", "conditions"]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.report, /\| Target \| Configuration \| axe-core \| IBM Equal Access \| Interactions \| Computed checks \| Conditions \| Virtual screen reader \(simulated\) \|/);
  assert.match(run.report, /\| good \|[^\n]*no failures[^\n]*\n/);
  assert.match(run.report, /\| bad \|[^\n]*failed: `reduced-motion-respected`/);
});
