import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { runRules, selfTest } from "../src/tiers/rules/index.js";
import { installSelectors } from "../src/tiers/rules/selectors.js";
import { captureRuleScreenshots } from "../src/run/a11y-screenshots.js";
import { findingBlock } from "../src/report/parts.js";
import { parseResults, TIERS } from "../src/schema.js";
import { makeIo, makeTree, reportPath } from "./helpers/fixtures.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/**
 * Run the CLI against real fixtures and read back what it wrote.
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
async function audit(args, { cwd = makeTree() } = {}) {
  const { io, out } = makeIo({ cwd, env: process.env });
  const code = await main(args, io);
  let results = null;
  let report = null;
  try {
    results = parseResults(JSON.parse(readFileSync(reportPath(cwd, "results.json"), "utf8")));
    report = readFileSync(reportPath(cwd, "report.md"), "utf8");
  } catch {
    // A run that stops early writes neither file.
  }
  return { code, results, report, ...out, cwd };
}

/**
 * @param {import("../src/types.js").Results} results
 * @param {number} [index]
 */
const tiersOf = (results, index = 0) => results.targets[index].archetypes.page.configs[0].tiers;
/** @param {import("../src/types.js").EngineResult} engineResult */
const ids = (engineResult) => engineResult.violations.map((v) => v.ruleId).sort();

test("clean page: neither engine reports violations, and the wording stays careful", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "rules"]);
  assert.equal(run.code, 0, run.stderr);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), []);
  assert.deepEqual(ids(ibm), []);
  assert.match(run.report, /No automated violations found by axe-core/);
  assert.match(run.report, /No automated violations found by IBM Equal Access/);
  assert.doesNotMatch(run.report, /\b(is|are) (fully )?(accessible|compliant)\b/i);
});

test("missing label: each engine reports its own rule, labeled and separate", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}missing-label.html`, "--tiers", "rules"]);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), ["label"]);
  assert.deepEqual(ids(ibm), ["input_label_exists"]);
  assert.equal(axe.violations[0].impact, "critical");
  assert.equal(ibm.violations[0].impact, null);
  assert.equal(ibm.violations[0].toolkitLevel, 1);
  assert.equal(axe.violations[0].toolkitLevel, undefined);
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(readFileSync(`${fixtures}missing-label.html`, "utf8"));
    for (const engine of [axe, ibm]) {
      const selector = engine.violations[0].nodes[0].selector;
      assert.ok(selector);
      assert.deepEqual(await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((element) => element.localName), selector), ["input"]);
      assert.ok(run.report.includes(selector));
    }
  } finally {
    await browser.close();
  }
  assert.doesNotMatch(run.report, /HTML\[\d+\]\/BODY\[\d+\]/);
  assert.match(run.report, /#### axe-core/);
  assert.match(run.report, /#### IBM Equal Access/);
  const summary = run.results.targets[0].summary.engines;
  assert.equal(summary.axe.violationsByImpact.critical, 1);
  assert.equal(summary.ibm.violationsByToolkitLevel["1"], 1);
});

test("annotated screenshots are opt-in and linked beside rule findings", { skip }, async () => {
  const target = `${fixtures}missing-label.html`;
  const without = await audit(["audit", target, "--engine", "axe", "--tiers", "rules"]);
  assert.equal(tiersOf(without.results).rules.engines.axe.screenshot, undefined);

  const run = await audit(["audit", target, "--engine", "axe", "--tiers", "rules", "--screenshots"]);
  const screenshot = tiersOf(run.results).rules.engines.axe.screenshot;
  assert.ok(screenshot);
  assert.match(screenshot, /^screenshots\/[a-z0-9_-]+\/page-axe\.png$/);
  const imagePath = reportPath(run.cwd, screenshot);
  assert.ok(existsSync(imagePath));
  assert.equal(readFileSync(imagePath).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(run.report.includes(`[Annotated screenshot](${screenshot})`));
  assert.match(run.report, /#1 `.*`/);
  const ibmRun = await audit(["audit", target, "--engine", "ibm", "--tiers", "rules", "--screenshots"]);
  const ibm = tiersOf(ibmRun.results).rules.engines.ibm;
  assert.ok(ibm.screenshot);
  assert.ok(ibmRun.report.includes(`[Annotated screenshot](${ibm.screenshot})`));
  assert.ok(existsSync(reportPath(ibmRun.cwd, ibm.screenshot)));
  assert.ok(!ibm.notes.some((note) => note.includes("No reported elements")));
});

test("default runs preserve each report and its screenshots together", { skip }, async () => {
  const cwd = makeTree();
  const first = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "axe", "--tiers", "rules", "--screenshots"], { cwd });
  assert.equal(first.code, 0, first.stderr);
  const firstPlanPath = reportPath(cwd, "plan.json");
  const firstReportPath = reportPath(cwd, "report.md");
  const firstScreenshot = tiersOf(first.results).rules.engines.axe.screenshot;
  assert.ok(firstScreenshot);
  const firstImagePath = reportPath(cwd, firstScreenshot);
  const firstImage = readFileSync(firstImagePath);
  const second = await audit(["audit", `${fixtures}missing-alt.html`, "--engine", "axe", "--tiers", "rules", "--screenshots"], { cwd });
  assert.equal(second.code, 0, second.stderr);
  const secondScreenshot = tiersOf(second.results).rules.engines.axe.screenshot;
  assert.ok(secondScreenshot);
  assert.notEqual(reportPath(cwd, "plan.json"), firstPlanPath);
  assert.deepEqual(readFileSync(firstImagePath), firstImage);
  assert.equal(readFileSync(firstReportPath, "utf8"), first.report);
  assert.ok(first.report.includes(`[Annotated screenshot](${firstScreenshot})`));
  assert.ok(second.report.includes(`[Annotated screenshot](${secondScreenshot})`));
  assert.ok(existsSync(reportPath(cwd, secondScreenshot)));
});

test("low contrast and missing alt text", { skip }, async () => {
  const contrast = await audit(["audit", `${fixtures}low-contrast.html`, "--tiers", "rules"]);
  const c = tiersOf(contrast.results).rules.engines;
  assert.deepEqual(ids(c.axe), ["color-contrast"]);
  assert.deepEqual(ids(c.ibm), ["text_contrast_sufficient"]);
  assert.equal(contrast.results.tools.chromium, available.version);

  const alt = await audit(["audit", `${fixtures}missing-alt.html`, "--tiers", "rules"]);
  const a = tiersOf(alt.results).rules.engines;
  assert.deepEqual(ids(a.axe), ["image-alt"]);
  assert.deepEqual(ids(a.ibm), ["img_alt_valid"]);
});

test("finding selectors identify repeated siblings and escaped IDs without changing the DOM", { skip }, async () => {
  const { browser } = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html lang="en"><head><title>Selectors</title></head><body><main>
      <h1>Selectors</h1><div id="1:group"><input id="same" data-finding="first"><span>Sibling</span><input id="same" data-finding="second"><input id="odd:id" data-finding="third"></div>
      <svg><g><circle class="target"/><rect/><circle class="target"/></g></svg>
      <div id="slotted"><input data-finding="slotted"></div>
    </main></body></html>`);
    await page.evaluate(() => document.querySelector("#slotted").attachShadow({ mode: "open" }).innerHTML = "<slot></slot>");
    const before = await page.content();
    /** @type {import('../src/types.js').TierResult} */
    const rules = await runRules(page, { engines: ["axe", "ibm"], wcag: "2.2", level: "AA" });
    for (const engine of Object.values(rules.engines)) {
      assert.equal(engine.status, "ran", engine.reason);
      const finding = engine.violations.find((finding) => ["label", "input_label_exists"].includes(finding.ruleId));
      assert.ok(finding);
      assert.equal(finding.nodeCount, 4);
      assert.equal(finding.nodes.length, 4);
      assert.deepEqual(await page.evaluate((nodes) => nodes.map((node) => window.__a11ySelectors.resolve(node).getAttribute("data-finding")), finding.nodes), ["first", "second", "third", "slotted"]);
      assert.ok(finding.nodes.every((node) => !node.selectorError && !node.selectorPath));
    }
    assert.equal(await page.content(), before);
    const svg = await page.evaluate(() => [...document.querySelectorAll("circle")].map((element) => {
      const location = window.__a11ySelectors.forNode(element);
      return { location, correct: window.__a11ySelectors.resolve(location) === element };
    }));
    assert.ok(svg.every((entry) => entry.correct));
    assert.notEqual(svg[0].location.selector, svg[1].location.selector);
    const error = await page.evaluate(() => window.__a11ySelectors.forNode(document.createElement("input")));
    assert.equal(error.selector, "");
    assert.match(error.selectorError, /not a connected element/);
    const closed = await page.evaluate(() => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = "<input>";
      return window.__a11ySelectors.forNode(root.querySelector("input"));
    });
    assert.equal(closed.selector, "");
    assert.match(closed.selectorError, /shadow root is closed/);
  } finally {
    await browser.close();
  }
});

test("screenshot omissions preserve marker numbering and clean overlays on failure", { skip }, async () => {
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="present"><input class="ambiguous"><input class="ambiguous"><input id="hidden" style="display:none">');
    await installSelectors(page);
    /** @type {import('../src/types.js').TierResult} */
    const rules = { status: "ran", engines: { ibm: { status: "ran", violations: [{
      ruleId: "input_label_exists", impact: null, wcag: [], help: "Missing label", helpUrl: "", nodeCount: 5,
      nodes: ["#missing", "#present", ".ambiguous", "#hidden", "HTML[0]/BODY[0]"].map((selector) => ({ selector, html: "" })),
    }], notes: [] } } };
    let screenshotCalled = false;
    page.screenshot = async () => {
      screenshotCalled = true;
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-automatica11y-screenshot-overlay] span')].map((element) => element.textContent)), ["2"]);
      throw new Error("Expected screenshot failure");
    };
    await captureRuleScreenshots(page, rules, { enabled: true, outputDir: makeTree(), target: "test", context: "page" });
    assert.equal(screenshotCalled, true);
    assert.ok(rules.engines.ibm.notes.some((note) => note.includes("omitted 4 of 5") && note.includes("#3: Selector matched 2") && note.includes("#4: Reported element has no visible bounds")));
    assert.ok(rules.engines.ibm.notes.some((note) => note.includes("Expected screenshot failure")));
    assert.equal(await page.locator('[data-automatica11y-screenshot-overlay]').count(), 0);
    assert.equal(rules.engines.ibm.screenshot, undefined);
    /** @type {import('../src/types.js').TierResult} */
    const missing = { ...rules, engines: { ibm: { ...rules.engines.ibm, violations: [{ ...rules.engines.ibm.violations[0], nodes: [{ selector: "#missing", html: "" }], nodeCount: 1 }], notes: [] } } };
    await captureRuleScreenshots(page, missing, { enabled: true, outputDir: makeTree(), target: "missing", context: "page" });
    assert.ok(missing.engines.ibm.notes.includes("No reported elements could be located for an annotated screenshot."));
  } finally {
    await browser.close();
  }
});

test("result schema preserves boundary locations and accepts legacy node objects", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "ibm", "--tiers", "rules"]);
  const source = JSON.parse(JSON.stringify(run.results));
  const original = tiersOf(source).rules.engines.ibm.violations[0].nodes[0];
  assert.deepEqual(tiersOf(parseResults(source)).rules.engines.ibm.violations[0].nodes[0], original);
  original.selectorPath = [{ selector: "#frame", enter: "frame" }, { selector: "#host", enter: "shadow" }];
  original.selectorError = "Root unavailable";
  const parsed = tiersOf(parseResults(source)).rules.engines.ibm.violations[0];
  assert.deepEqual(parsed.nodes[0], original);
  const block = findingBlock(parsed, { showImpact: false, showToolkit: true });
  assert.match(block, /`#frame` -> frame document -> `#host` -> shadow root/);
  assert.match(block, /Location unavailable: Root unavailable/);
});

test("IBM needs-review items stay out of the violations", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "rules"]);
  const { ibm } = tiersOf(run.results).rules.engines;
  assert.ok(ibm.incomplete.length > 0);
  assert.ok(ibm.incomplete.every((f) => ["potential", "manual", "recommendation"].includes(f.kind)));
  assert.match(run.report, /\*\*Needs review\.\*\*/);
});

test("--engine picks one engine or both", { skip }, async () => {
  const axeOnly = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "axe", "--tiers", "rules"]);
  assert.deepEqual(Object.keys(tiersOf(axeOnly.results).rules.engines), ["axe"]);
  const ibmOnly = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "ibm", "--tiers", "rules"]);
  assert.deepEqual(Object.keys(tiersOf(ibmOnly.results).rules.engines), ["ibm"]);
  const both = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "ibm,axe", "--tiers", "rules"]);
  assert.deepEqual(Object.keys(tiersOf(both.results).rules.engines).sort(), ["axe", "ibm"]);
});

test("--level A drops the AA rules", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}low-contrast.html`, "--level", "A", "--tiers", "rules"]);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), []);
  assert.deepEqual(ids(ibm), []);
});

test("--level AAA tells the reader IBM has no AAA rules", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--level", "AAA", "--engine", "ibm", "--tiers", "rules"]);
  assert.match(tiersOf(run.results).rules.engines.ibm.notes[0], /levels A and AA/);
  assert.match(run.report, /Note: IBM's WCAG rulesets cover levels A and AA/);
});

test("the interactions tier is not applicable to a page, and says so", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "interactions,vsr"]);
  const tiers = tiersOf(run.results);
  assert.equal(tiers.interactions.status, "not-applicable");
  assert.equal(tiers.vsr.status, "ran");
  assert.equal(tiers.vsr.simulated, true);
  assert.match(run.report, /\*\*Not run\.\*\*/);
  assert.match(run.report, /- Interactions: Interaction checks need an archetype fixture/);
});

test("--tiers limits what runs and what the matrix shows", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "rules"]);
  assert.deepEqual(Object.keys(tiersOf(run.results)), ["rules"]);
});

test("html files, static directories, and URLs all work", { skip }, async () => {
  const file = await audit(["audit", `${fixtures}missing-alt.html`, "--tiers", "rules"]);
  assert.equal(file.results.targets[0].status, "ran");

  const dir = await audit(["audit", `${fixtures}static-site`, "--tiers", "rules"]);
  assert.equal(dir.results.targets[0].status, "ran");
  assert.deepEqual(ids(tiersOf(dir.results).rules.engines.axe), []);
  assert.match(dir.results.targets[0].warnings[0], /Only index\.html was checked/);

  const server = await serveStatic(fixtures);
  try {
    const url = await audit(["audit", `${server.origin}/missing-label.html`, "--tiers", "rules"]);
    assert.equal(url.results.targets[0].status, "ran");
    assert.deepEqual(ids(tiersOf(url.results).rules.engines.axe), ["label"]);
  } finally {
    await server.close();
  }
});

test("a directory without index.html fails that target, and all failing exits 4", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}static-site-no-index`, "--tiers", "rules"]);
  assert.equal(run.code, 4);
  assert.match(run.results.targets[0].reason, /no index\.html/);
});

test("a page that returns an error status fails that target and the rest still run", { skip }, async () => {
  const server = createServer((req, res) => {
    if (req.url === "/gone") res.writeHead(404, { "content-type": "text/html" }).end("<h1>Gone</h1>");
    else res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><html lang=en><head><title>x</title></head><body><main><h1>Hi</h1></main></body></html>");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  const base = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`;
  try {
    // Classification would reject the 404 URL up front, so edit the saved plan to reach the run step.
    const cwd = makeTree();
    await audit(["compare", `${base}/ok`, `${base}/ok2`, "--tiers", "rules", "--plan"], { cwd });
    const planFile = reportPath(cwd, "plan.json");
    const plan = JSON.parse(readFileSync(planFile, "utf8"));
    plan.targets[1].resolved.url = `${base}/gone`;
    writeFileSync(planFile, JSON.stringify(plan));
    const { io } = makeIo({ cwd, env: process.env });
    assert.equal(await main(["run", "--plan", planFile], io), 0);
    /** @type {import("../src/types.js").Results} */
    const results = JSON.parse(readFileSync(reportPath(cwd, "results.json"), "utf8"));
    assert.deepEqual(results.targets.map((t) => t.status), ["ran", "failed"]);
    assert.match(results.targets[1].reason, /HTTP 404/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("compare runs every target and keeps each one's results apart", { skip }, async () => {
  const run = await audit(["compare", `bad=${fixtures}missing-label.html`, `good=${fixtures}clean.html`, "--tiers", "rules"]);
  assert.equal(run.code, 0);
  assert.deepEqual(run.results.targets.map((t) => t.id), ["bad", "good"]);
  assert.equal(run.results.targets[0].summary.engines.axe.violations, 1);
  assert.equal(run.results.targets[1].summary.engines.axe.violations, 0);
  assert.match(run.report, /\| bad \|/);
  assert.match(run.report, /\| good \|/);
});

test("one failed target doesn't stop a comparison", { skip }, async () => {
  const run = await audit(["compare", `${fixtures}clean.html`, `${fixtures}static-site-no-index`, "--tiers", "rules"]);
  assert.equal(run.code, 0);
  assert.deepEqual(run.results.targets.map((t) => t.status), ["ran", "failed"]);
  assert.match(run.report, /This target failed: The directory has no index\.html to check\./);
});

test("fail flags set the exit code", { skip }, async () => {
  const bad = `${fixtures}missing-label.html`;
  const good = `${fixtures}clean.html`;
  assert.equal((await audit(["audit", bad, "--fail-on-axe", "serious", "--tiers", "rules"])).code, 1);
  assert.equal((await audit(["audit", bad, "--fail-on-ibm", "1", "--tiers", "rules"])).code, 1);
  assert.equal((await audit(["audit", good, "--fail-on-axe", "minor", "--fail-on-ibm", "3", "--tiers", "rules"])).code, 0);
  const both = await audit(["audit", bad, "--fail-on-axe", "serious", "--fail-on-ibm", "1", "--fail-mode", "all", "--tiers", "rules"]);
  assert.equal(both.code, 1);
  assert.equal(both.results.failCheck.tripped, true);
  assert.equal(both.results.failCheck.axe.hits, 1);
  assert.equal(both.results.failCheck.ibm.hits, 1);
  assert.match(both.report, /## Fail check\./);
  // axe sees nothing at this threshold, so "all" doesn't trip even though IBM does.
  const split = await audit(["audit", `${fixtures}low-contrast.html`, "--fail-on-axe", "critical", "--fail-on-ibm", "1", "--fail-mode", "all", "--tiers", "rules"]);
  assert.equal(split.code, 0);
  assert.equal(split.results.failCheck.ibm.tripped, true);
  assert.equal(split.results.failCheck.axe.tripped, false);
  // No fail flags: findings never change the exit code.
  const none = await audit(["audit", bad, "--tiers", "rules"]);
  assert.equal(none.code, 0);
  assert.equal(none.results.failCheck, null);
});

test("the same plan run twice gives the same findings", { skip }, async () => {
  const cwd = makeTree();
  const first = await audit(["audit", `${fixtures}low-contrast.html`, "--out", "./one", "--tiers", "rules"], { cwd });
  const planned = JSON.parse(readFileSync(join(cwd, "one", "plan.json"), "utf8"));
  assert.ok(planned);
  const a = JSON.parse(readFileSync(join(cwd, "one", "results.json"), "utf8"));
  const { io } = makeIo({ cwd, env: process.env });
  assert.equal(await main(["run", "--plan", join(cwd, "one", "plan.json")], io), 0);
  const b = JSON.parse(readFileSync(join(cwd, "one", "results.json"), "utf8"));
  /**
   * @param {Record<string, unknown>} r
   * @returns {Record<string, unknown>}
   */
  const strip = (r) => ({ ...r, runAt: null });
  assert.deepEqual(strip(b), strip(a));
  assert.equal(first.code, 0);
});

test("self-test: passes with real engines, and refuses when an engine misses a known problem", { skip }, async () => {
  const { browser } = await launchBrowser();
  try {
    assert.deepEqual(await selfTest(browser, ["axe", "ibm"]), { passed: true, problems: [] });
    const blind = async () => ({ engines: { axe: { status: "ran", violations: /** @type {import("../src/types.js").Finding[]} */ ([]) }, ibm: { status: "failed", reason: "boom" } } });
    const result = await selfTest(browser, ["axe", "ibm"], blind);
    assert.equal(result.passed, false);
    assert.match(result.problems.join("\n"), /axe missed image-alt, color-contrast/);
    assert.match(result.problems.join("\n"), /ibm: boom/);
  } finally {
    await browser.close();
  }
});

test("results.json validates against the schema and records tool versions", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`]);
  assert.deepEqual(Object.keys(tiersOf(run.results)).sort(), [...TIERS].sort());
  assert.equal(run.results.schema, 1);
  assert.equal(run.results.planRef, "plan.json");
  assert.match(run.results.tools["axe-core"], /^\d+\.\d+\.\d+/);
  assert.match(run.results.tools["ibm-checker-engine"], /^\d+\.\d+\.\d+/);
  assert.match(run.results.tools["playwright-core"], /^\d+\.\d+\.\d+/);
  assert.equal(run.results.tools.axe, undefined);
  assert.equal(tiersOf(run.results).rules.engines.axe.version, run.results.tools["axe-core"]);
});

test("the static server never serves files outside its root", async () => {
  const root = makeTree({ "site/index.html": "<h1>ok</h1>", "secret.txt": "secret" });
  const server = await serveStatic(join(root, "site"));
  /** @param {string} path */
  const get = (path) =>
    new Promise((resolve, reject) => {
      const port = Number(new URL(server.origin).port);
      request({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }).on("error", reject).end();
    });
  try {
    assert.equal((await get("/")).status, 200);
    assert.equal((await get("/missing")).status, 404);
    for (const path of ["/../secret.txt", "/..%2Fsecret.txt", "/%2e%2e/secret.txt", "/site/../../secret.txt"]) {
      const response = await get(path);
      assert.notEqual(response.status, 200, path);
      assert.doesNotMatch(response.body, /secret/, path);
    }
  } finally {
    await server.close();
  }
});

test("canvas-only output is not testable, never clean", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}canvas-only.html`, "--tiers", "rules"]);
  assert.equal(run.code, 0, run.stderr);
  const rules = tiersOf(run.results).rules;
  assert.equal(rules.status, "not-testable");
  assert.match(rules.reason, /Canvas output exposes nothing to rule checks/);
  assert.deepEqual(Object.values(rules.engines).map((e) => e.status), ["not-testable", "not-testable"]);
  const summary = run.results.targets[0].summary;
  assert.equal(summary.engines.axe.status, "not-testable");
  assert.match(summary.notTestable[0], /Canvas output exposes nothing/);
  assert.match(run.report, /\| canvas-only\.html \| not-testable \| not-testable \|/);
  assert.match(run.report, /Not testable: Canvas output exposes nothing to rule checks\./);
  assert.doesNotMatch(run.report, /No automated violations found by axe-core/);
});

test("a canvas with a label, or a table beside it, is tested, and the report says the drawing isn't", { skip }, async () => {
  for (const page of ["canvas-labelled", "canvas-table"]) {
    const run = await audit(["audit", `${fixtures}${page}.html`, "--tiers", "rules"]);
    const { axe, ibm } = tiersOf(run.results).rules.engines;
    assert.equal(axe.status, "ran", page);
    assert.equal(ibm.status, "ran", page);
    assert.match(axe.notes[0], /canvas drawing itself isn't checked/, page);
  }
});
