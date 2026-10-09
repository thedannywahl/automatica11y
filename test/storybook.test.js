import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { listStories, matchArchetypes, readIndex, selectStories, storyUrl } from "../src/harness/storybook.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { mapPool } from "../src/run/pool.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const sbDir = new URL("./fixtures/storybook-static/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

const story = (id, title, name = "Default", tags = []) => ({ id, title, name, tags });

test("listStories: reads index.json entries and leaves out docs pages", () => {
  const index = JSON.parse(readFileSync(join(sbDir, "index.json"), "utf8"));
  const stories = listStories(index);
  assert.equal(stories.length, 7);
  assert.ok(!stories.some((s) => s.id === "button--docs"));
  assert.deepEqual(stories.map((s) => s.id), [...stories.map((s) => s.id)].sort());
});

test("listStories: reads the older stories.json shape", () => {
  const stories = listStories({ v: 3, stories: { "a--b": { id: "a--b", kind: "Group/A", name: "B" }, "c--d": { id: "c--d", kind: "C", name: "D" } } });
  assert.deepEqual(stories.map((s) => [s.id, s.title]), [["a--b", "Group/A"], ["c--d", "C"]]);
});

test("matchArchetypes: reads title, name, and tags", () => {
  assert.deepEqual(matchArchetypes(story("a", "Components/Button", "Primary")), ["button"]);
  assert.deepEqual(matchArchetypes(story("a", "Overlays/Modal", "Open")), ["dialog"]);
  assert.deepEqual(matchArchetypes(story("a", "Forms/Text field", "Error")), ["form-field"]);
  assert.deepEqual(matchArchetypes(story("a", "Navigation/Tabs", "Default")), ["tabs"]);
  assert.deepEqual(matchArchetypes(story("a", "Data/Line chart", "Default")), ["chart"]);
  assert.deepEqual(matchArchetypes(story("a", "Misc/Badge", "Default", ["dialog"])), ["dialog"]);
  assert.deepEqual(matchArchetypes(story("a", "Misc/Badge", "Default")), []);
  assert.ok(matchArchetypes(story("a", "Button group menu", "Default")).includes("menu"));
});

test("selectStories: no filter keeps everything under the cap", () => {
  const stories = listStories(JSON.parse(readFileSync(join(sbDir, "index.json"), "utf8")));
  const picked = selectStories(stories, { max: 200 });
  assert.equal(picked.selected.length, 7);
  assert.equal(picked.truncated, false);
  assert.equal(picked.total, 7);
});

test("selectStories: an archetype filter keeps matches and records them", () => {
  const stories = listStories(JSON.parse(readFileSync(join(sbDir, "index.json"), "utf8")));
  const picked = selectStories(stories, { archetypes: ["button", "dialog", "chart"], max: 200 });
  assert.deepEqual(picked.selected.map((s) => s.id), ["button--icon-only", "button--primary", "dialog-modal--open"]);
  assert.deepEqual(picked.matchedByArchetype, { button: ["button--icon-only", "button--primary"], dialog: ["dialog-modal--open"] });
  assert.equal(/** @type {Record<string, string[]>} */ (picked.matchedByArchetype).chart, undefined);
});

test("selectStories: the cap spreads over components and picks the same stories every time", () => {
  const stories = [
    ...["a1", "a2", "a3", "a4"].map((n) => story(`alpha--${n}`, "Alpha")),
    ...["b1", "b2"].map((n) => story(`beta--${n}`, "Beta")),
    story("gamma--g1", "Gamma"),
  ];
  const one = selectStories(stories, { max: 4 });
  assert.equal(one.truncated, true);
  assert.equal(one.matched, 7);
  assert.deepEqual(one.selected.map((s) => s.id), ["alpha--a1", "alpha--a2", "beta--b1", "gamma--g1"]);
  assert.deepEqual(selectStories(stories, { max: 4 }).selected, one.selected);
  assert.equal(selectStories(stories, { max: 7 }).truncated, false);
});

test("storyUrl builds the iframe address", () => {
  assert.equal(storyUrl("http://x.test/sb/", "button--primary"), "http://x.test/sb/iframe.html?id=button--primary&viewMode=story");
  assert.match(storyUrl("http://x.test/", "a b--c"), /id=a%20b--c/);
});

test("readIndex: reads from disk and from a URL, and reports HTTP errors", async () => {
  const local = await readIndex({ path: sbDir, index: "index.json" });
  assert.ok(typeof local === "object" && local !== null && "v" in local);
  assert.equal(local.v, 5);
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ v: 3, stories: {} }) });
  assert.deepEqual(await readIndex({ url: "http://x.test/", index: "stories.json" }, ok), { v: 3, stories: {} });
  const bad = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(readIndex({ url: "http://x.test/", index: "index.json" }, bad), /HTTP 500/);
});

test("mapPool: keeps order and respects the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapPool([30, 5, 20, 1, 10], 2, async (ms, i) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((done) => setTimeout(done, ms));
    running -= 1;
    return i;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
  assert.ok(peak <= 2);
});

async function audit(args, cwd = makeTree()) {
  const { io, out } = makeIo({ cwd, env: process.env });
  const code = await main(args, io);
  let results = null;
  let report = null;
  try {
    results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
    report = readFileSync(join(cwd, "a11y-report", "report.md"), "utf8");
  } catch {
    // Early exits write no results.
  }
  return { code, results, report, ...out };
}

const storyIds = (result) => Object.keys(result.targets[0].archetypes).map((k) => k.replace("story:", "")).sort();
const engineViolations = (result, key, engine) => result.targets[0].archetypes[`story:${key}`].configs[0].tiers.rules.engines[engine].violations.map((v) => v.ruleId);

test("audits a local Storybook build: each story is a unit, and failures are gaps", { skip }, async () => {
  const run = await audit(["audit", sbDir]);
  assert.equal(run.code, 0, run.stderr);
  const target = run.results.targets[0];
  assert.equal(target.status, "ran");
  assert.equal(target.storybook.total, 7);
  assert.equal(target.storybook.audited, 7);
  assert.equal(target.storybook.truncated, false);
  assert.deepEqual(storyIds(run.results), ["broken--throws", "button--icon-only", "button--primary", "dialog-modal--open", "form-input--labeled", "form-input--unlabeled", "tabs--default"]);
  assert.deepEqual(engineViolations(run.results, "button--icon-only", "axe"), ["button-name"]);
  assert.deepEqual(engineViolations(run.results, "form-input--unlabeled", "axe"), ["label"]);
  assert.deepEqual(engineViolations(run.results, "form-input--unlabeled", "ibm"), ["input_label_exists"]);
  for (const clean of ["button--primary", "form-input--labeled", "dialog-modal--open", "tabs--default"]) {
    assert.deepEqual(engineViolations(run.results, clean, "axe"), [], clean);
    assert.deepEqual(engineViolations(run.results, clean, "ibm"), [], clean);
  }
  // The story that throws is a gap with a reason. It never counts as clean.
  assert.equal(target.archetypes["story:broken--throws"].status, "gap");
  assert.equal(target.storybook.failedStories[0].id, "broken--throws");
  assert.match(target.storybook.failedStories[0].reason, /this story throws on purpose/);
  assert.ok(target.summary.gaps.includes("story:broken--throws"));
  assert.match(run.report, /Stories that didn't render/);
  assert.match(run.report, /Violations by rule/);
});

test("rules are scoped to the story, so page-level rules stay quiet", { skip }, async () => {
  const run = await audit(["audit", sbDir]);
  const all = Object.values(run.results.targets[0].archetypes).flatMap((a) => a.configs.flatMap((c) => Object.values(c.tiers.rules.engines).flatMap((e) => e.violations)));
  const pageLevel = new Set(["document-title", "html-has-lang", "landmark-one-main", "region", "page-has-heading-one", "html_lang_exists", "page_title_exists", "skip_main_exists"]);
  assert.deepEqual(all.filter((v) => pageLevel.has(v.ruleId)), []);
});

test("--archetypes keeps matching stories and reports the archetypes that matched nothing", { skip }, async () => {
  const run = await audit(["audit", sbDir, "--archetypes", "button,dialog,chart"]);
  const sb = run.results.targets[0].storybook;
  assert.deepEqual(storyIds(run.results), ["button--icon-only", "button--primary", "dialog-modal--open"]);
  assert.equal(sb.matched, 3);
  assert.deepEqual(sb.archetypeMatches, { button: ["button--icon-only", "button--primary"], dialog: ["dialog-modal--open"] });
  assert.ok(run.results.targets[0].summary.gaps.includes("archetype:chart"));
  assert.match(run.results.targets[0].warnings.join("\n"), /No stories matched the chart archetype/);
  assert.match(run.report, /\*\*Archetype matches\./);
  assert.match(run.report, /`button--icon-only`/);
});

test("--archetypes with no matches fails the target", { skip }, async () => {
  const run = await audit(["audit", sbDir, "--archetypes", "chart"]);
  assert.equal(run.code, 4);
  assert.match(run.results.targets[0].reason, /No stories matched the archetypes chart/);
});

test("--max-stories caps the run and the report says so", { skip }, async () => {
  const run = await audit(["audit", sbDir, "--max-stories", "3"]);
  const target = run.results.targets[0];
  assert.equal(target.storybook.audited, 3);
  assert.equal(target.storybook.truncated, true);
  assert.equal(target.storybook.total, 7);
  assert.match(target.warnings[0], /The story cap cut the list short\. three of seven stories were audited/);
  assert.match(run.report, /Warning: The story cap cut the list short/);
});

test("a Storybook URL gives the same results as the directory", { skip }, async () => {
  const server = await serveStatic(sbDir);
  try {
    const run = await audit(["audit", `${server.origin}/`, "--tiers", "rules"]);
    assert.equal(run.results.targets[0].storybook.audited, 7);
    assert.deepEqual(engineViolations(run.results, "button--icon-only", "axe"), ["button-name"]);
  } finally {
    await server.close();
  }
});

test("fail flags count violations across stories", { skip }, async () => {
  const run = await audit(["audit", sbDir, "--fail-on-axe", "serious", "--fail-on-ibm", "1", "--fail-mode", "all"]);
  assert.equal(run.code, 1);
  assert.equal(run.results.failCheck.axe.hits, 2);
  assert.equal(run.results.failCheck.ibm.hits, 2);
  const clean = await audit(["audit", sbDir, "--archetypes", "tabs,dialog", "--fail-on-axe", "minor", "--fail-on-ibm", "3"]);
  assert.equal(clean.code, 0);
});

test("the same Storybook run twice picks the same stories and finds the same things", { skip }, async () => {
  const strip = (r) => ({ ...r, runAt: null });
  const a = await audit(["audit", sbDir, "--max-stories", "5"]);
  const b = await audit(["audit", sbDir, "--max-stories", "5"]);
  assert.deepEqual(strip(b.results), strip(a.results));
});

test("--archetypes on a page target is noted, not ignored silently", { skip }, async () => {
  const run = await audit(["audit", new URL("./fixtures/clean.html", import.meta.url).pathname, "--archetypes", "button"]);
  assert.match(run.results.targets[0].warnings.join("\n"), /--archetypes only applies to Storybook and npm targets/);
});
