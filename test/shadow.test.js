import assert from "node:assert/strict";
import { test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { closedShadowHosts, notTestableEntries } from "../src/harness/shadow.js";
import { openPage } from "../src/harness/url.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { runRules } from "../src/tiers/rules/index.js";
import { main } from "../src/cli.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

const page = (mode) => `<!doctype html><html lang="en"><head><title>Shadow</title></head><body><main><h1>Shadow test</h1><div id="root"></div></main>
<script>
class XThing extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: ${JSON.stringify(mode)} }).innerHTML = '<button data-a11y-trigger style="min-width:44px;min-height:44px"></button><img src="x.png">';
  }
}
customElements.define("x-thing", XThing);
document.getElementById("root").append(document.createElement("x-thing"));
</script></main></body></html>`;

test("notTestableEntries names each host", () => {
  assert.deepEqual(notTestableEntries({ "x-a": 2 }), ["closed shadow root in <x-a> (2): its content isn't visible to the rule engines"]);
  assert.deepEqual(notTestableEntries({}), []);
});

test("open shadow roots: both engines read inside, and nothing is recorded as hidden", { skip }, async () => {
  const dir = makeTree({ "open.html": page("open") });
  const server = await serveStatic(dir);
  const { browser } = await launchBrowser();
  try {
    const opened = await openPage(browser, `${server.origin}/open.html`);
    const result = await runRules(opened.page, { engines: ["axe", "ibm"], wcag: "2.2", level: "AA" });
    assert.deepEqual(result.engines.axe.violations.map((v) => v.ruleId).sort(), ["button-name", "image-alt"]);
    assert.deepEqual(result.engines.ibm.violations.map((v) => v.ruleId).sort(), ["img_alt_valid", "input_label_exists"]);
    assert.deepEqual(await closedShadowHosts(opened.page), {});
    assert.equal(await opened.page.locator("[data-a11y-trigger]").count(), 1);
    await opened.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("closed shadow roots: the engines see nothing, so the run records them as not testable", { skip }, async () => {
  const dir = makeTree({ "closed.html": page("closed") });
  const { browser } = await launchBrowser();
  const server = await serveStatic(dir);
  try {
    const opened = await openPage(browser, `${server.origin}/closed.html`);
    const result = await runRules(opened.page, { engines: ["axe", "ibm"], wcag: "2.2", level: "AA" });
    assert.deepEqual(result.engines.axe.violations, []);
    assert.deepEqual(result.engines.ibm.violations, []);
    assert.deepEqual(await closedShadowHosts(opened.page), { "x-thing": 1 });
    await opened.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("a page with a closed shadow root is reported as not testable, never as clean", { skip }, async () => {
  const cwd = makeTree({ "closed.html": page("closed") });
  const { io } = makeIo({ cwd, env: process.env });
  assert.equal(await main(["audit", "./closed.html", "--tiers", "rules"], io), 0);
  const results = JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8"));
  assert.match(results.targets[0].summary.notTestable[0], /closed shadow root in <x-thing>/);
  const report = readFileSync(join(cwd, "a11y-report", "report.md"), "utf8");
  assert.match(report, /\*\*Not testable in closed\.html\.\*\*/);
  assert.match(report, /Not testable: closed shadow root in <x-thing>/);
});
