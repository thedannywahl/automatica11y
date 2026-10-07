import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { selfTest } from "../src/tiers/rules/index.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** Run the CLI against real fixtures and read back what it wrote. */
async function audit(args, { cwd = makeTree() } = {}) {
  const { io, out } = makeIo({ cwd, env: process.env });
  const code = await main(args, io);
  let results = null;
  let report = null;
  try {
    results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
    report = readFileSync(join(cwd, "a11y-report", "report.md"), "utf8");
  } catch {
    // A run that stops early writes neither file.
  }
  return { code, results, report, ...out, cwd };
}

const tiersOf = (results, index = 0) => results.targets[index].archetypes.page.configs[0].tiers;
const ids = (engineResult) => engineResult.violations.map((v) => v.ruleId).sort();

test("clean page: neither engine reports violations, and the wording stays careful", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`]);
  assert.equal(run.code, 0, run.stderr);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), []);
  assert.deepEqual(ids(ibm), []);
  assert.match(run.report, /No automated violations found by axe-core/);
  assert.match(run.report, /No automated violations found by IBM Equal Access/);
  assert.doesNotMatch(run.report, /\b(is|are) (fully )?(accessible|compliant)\b/i);
});

test("missing label: each engine reports its own rule, labeled and separate", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}missing-label.html`]);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), ["label"]);
  assert.deepEqual(ids(ibm), ["input_label_exists"]);
  assert.equal(axe.violations[0].impact, "critical");
  assert.equal(ibm.violations[0].impact, null);
  assert.equal(ibm.violations[0].toolkitLevel, 1);
  assert.equal(axe.violations[0].toolkitLevel, undefined);
  assert.match(run.report, /#### axe-core/);
  assert.match(run.report, /#### IBM Equal Access/);
  const summary = run.results.targets[0].summary.engines;
  assert.equal(summary.axe.violationsByImpact.critical, 1);
  assert.equal(summary.ibm.violationsByToolkitLevel["1"], 1);
});

test("low contrast and missing alt text", { skip }, async () => {
  const contrast = await audit(["audit", `${fixtures}low-contrast.html`]);
  const c = tiersOf(contrast.results).rules.engines;
  assert.deepEqual(ids(c.axe), ["color-contrast"]);
  assert.deepEqual(ids(c.ibm), ["text_contrast_sufficient"]);
  assert.equal(contrast.results.tools.chromium, available.version);

  const alt = await audit(["audit", `${fixtures}missing-alt.html`]);
  const a = tiersOf(alt.results).rules.engines;
  assert.deepEqual(ids(a.axe), ["image-alt"]);
  assert.deepEqual(ids(a.ibm), ["img_alt_valid"]);
});

test("IBM needs-review items stay out of the violations", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`]);
  const { ibm } = tiersOf(run.results).rules.engines;
  assert.ok(ibm.incomplete.length > 0);
  assert.ok(ibm.incomplete.every((f) => ["potential", "manual", "recommendation"].includes(f.kind)));
  assert.match(run.report, /\*\*Needs review\.\*\*/);
});

test("--engine picks one engine or both", { skip }, async () => {
  const axeOnly = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "axe"]);
  assert.deepEqual(Object.keys(tiersOf(axeOnly.results).rules.engines), ["axe"]);
  const ibmOnly = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "ibm"]);
  assert.deepEqual(Object.keys(tiersOf(ibmOnly.results).rules.engines), ["ibm"]);
  const both = await audit(["audit", `${fixtures}missing-label.html`, "--engine", "ibm,axe"]);
  assert.deepEqual(Object.keys(tiersOf(both.results).rules.engines).sort(), ["axe", "ibm"]);
});

test("--level A drops the AA rules", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}low-contrast.html`, "--level", "A"]);
  const { axe, ibm } = tiersOf(run.results).rules.engines;
  assert.deepEqual(ids(axe), []);
  assert.deepEqual(ids(ibm), []);
});

test("--level AAA tells the reader IBM has no AAA rules", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--level", "AAA", "--engine", "ibm"]);
  assert.match(tiersOf(run.results).rules.engines.ibm.notes[0], /levels A and AA/);
  assert.match(run.report, /Note: IBM's WCAG rulesets cover levels A and AA/);
});

test("tiers that aren't built yet are reported as skipped, not clean", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`]);
  const tiers = tiersOf(run.results);
  assert.equal(tiers.interactions.status, "skipped");
  assert.equal(tiers.vsr.status, "skipped");
  assert.match(run.report, /Not run: The interactions tier isn't built yet \(M5\)\./);
});

test("--tiers limits what runs and what the matrix shows", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "rules"]);
  assert.deepEqual(Object.keys(tiersOf(run.results)), ["rules"]);
});

test("html files, static directories, and URLs all work", { skip }, async () => {
  const file = await audit(["audit", `${fixtures}missing-alt.html`]);
  assert.equal(file.results.targets[0].status, "ran");

  const dir = await audit(["audit", `${fixtures}static-site`]);
  assert.equal(dir.results.targets[0].status, "ran");
  assert.deepEqual(ids(tiersOf(dir.results).rules.engines.axe), []);
  assert.match(dir.results.targets[0].warnings[0], /Only index\.html was checked/);

  const server = await serveStatic(fixtures);
  try {
    const url = await audit(["audit", `${server.origin}/missing-label.html`]);
    assert.equal(url.results.targets[0].status, "ran");
    assert.deepEqual(ids(tiersOf(url.results).rules.engines.axe), ["label"]);
  } finally {
    await server.close();
  }
});

test("a directory without index.html fails that target, and all failing exits 4", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}static-site-no-index`]);
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
    await audit(["compare", `${base}/ok`, `${base}/ok2`, "--plan"], { cwd });
    const planFile = join(cwd, "a11y-report", "plan.json");
    const plan = JSON.parse(readFileSync(planFile, "utf8"));
    plan.targets[1].resolved.url = `${base}/gone`;
    writeFileSync(planFile, JSON.stringify(plan));
    const { io } = makeIo({ cwd, env: process.env });
    assert.equal(await main(["run", "--plan", planFile], io), 0);
    const results = JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8"));
    assert.deepEqual(results.targets.map((t) => t.status), ["ran", "failed"]);
    assert.match(results.targets[1].reason, /HTTP 404/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("compare runs every target and keeps each one's results apart", { skip }, async () => {
  const run = await audit(["compare", `bad=${fixtures}missing-label.html`, `good=${fixtures}clean.html`]);
  assert.equal(run.code, 0);
  assert.deepEqual(run.results.targets.map((t) => t.id), ["bad", "good"]);
  assert.equal(run.results.targets[0].summary.engines.axe.violations, 1);
  assert.equal(run.results.targets[1].summary.engines.axe.violations, 0);
  assert.match(run.report, /\| bad \|/);
  assert.match(run.report, /\| good \|/);
});

test("one failed target doesn't stop a comparison", { skip }, async () => {
  const run = await audit(["compare", `${fixtures}clean.html`, `${fixtures}static-site-no-index`]);
  assert.equal(run.code, 0);
  assert.deepEqual(run.results.targets.map((t) => t.status), ["ran", "failed"]);
  assert.match(run.report, /This target failed: The directory has no index\.html to check\./);
});

test("fail flags set the exit code", { skip }, async () => {
  const bad = `${fixtures}missing-label.html`;
  const good = `${fixtures}clean.html`;
  assert.equal((await audit(["audit", bad, "--fail-on-axe", "serious"])).code, 1);
  assert.equal((await audit(["audit", bad, "--fail-on-ibm", "1"])).code, 1);
  assert.equal((await audit(["audit", good, "--fail-on-axe", "minor", "--fail-on-ibm", "3"])).code, 0);
  const both = await audit(["audit", bad, "--fail-on-axe", "serious", "--fail-on-ibm", "1", "--fail-mode", "all"]);
  assert.equal(both.code, 1);
  assert.equal(both.results.failCheck.tripped, true);
  assert.equal(both.results.failCheck.axe.hits, 1);
  assert.equal(both.results.failCheck.ibm.hits, 1);
  assert.match(both.report, /## Fail check\./);
  // axe sees nothing at this threshold, so "all" doesn't trip even though IBM does.
  const split = await audit(["audit", `${fixtures}low-contrast.html`, "--fail-on-axe", "critical", "--fail-on-ibm", "1", "--fail-mode", "all"]);
  assert.equal(split.code, 0);
  assert.equal(split.results.failCheck.ibm.tripped, true);
  assert.equal(split.results.failCheck.axe.tripped, false);
  // No fail flags: findings never change the exit code.
  const none = await audit(["audit", bad]);
  assert.equal(none.code, 0);
  assert.equal(none.results.failCheck, null);
});

test("the same plan run twice gives the same findings", { skip }, async () => {
  const cwd = makeTree();
  const first = await audit(["audit", `${fixtures}low-contrast.html`, "--out", "./one"], { cwd });
  const planned = JSON.parse(readFileSync(join(cwd, "one", "plan.json"), "utf8"));
  assert.ok(planned);
  const a = JSON.parse(readFileSync(join(cwd, "one", "results.json"), "utf8"));
  const { io } = makeIo({ cwd, env: process.env });
  assert.equal(await main(["run", "--plan", join(cwd, "one", "plan.json")], io), 0);
  const b = JSON.parse(readFileSync(join(cwd, "one", "results.json"), "utf8"));
  const strip = (r) => ({ ...r, runAt: null });
  assert.deepEqual(strip(b), strip(a));
  assert.equal(first.code, 0);
});

test("self-test: passes with real engines, and refuses when an engine misses a known problem", { skip }, async () => {
  const { browser } = await launchBrowser();
  try {
    assert.deepEqual(await selfTest(browser, ["axe", "ibm"]), { passed: true, problems: [] });
    const blind = async () => ({ engines: { axe: { status: "ran", violations: [] }, ibm: { status: "failed", reason: "boom" } } });
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
