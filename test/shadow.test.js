import assert from "node:assert/strict";
import { test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { closedShadowHosts, notTestableEntries } from "../src/harness/shadow.js";
import { openPage } from "../src/harness/url.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { runRules } from "../src/tiers/rules/index.js";
import { captureRuleScreenshots } from "../src/run/a11y-screenshots.js";
import { findingBlock } from "../src/report/parts.js";
import { main } from "../src/cli.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @param {string} mode */
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
    const axe = result.engines.axe;
    const ibm = result.engines.ibm;
    if (!("violations" in axe)) throw new Error("axe didn't run");
    if (!("violations" in ibm)) throw new Error("IBM didn't run");
    assert.deepEqual(axe.violations.map((v) => v.ruleId).sort(), ["button-name", "image-alt"]);
    assert.deepEqual(ibm.violations.map((v) => v.ruleId).sort(), ["img_alt_valid", "input_label_exists"]);
    for (const engine of [axe, ibm]) {
      for (const finding of engine.violations) {
        for (const node of finding.nodes) {
          assert.equal(node.selectorError, undefined);
          assert.deepEqual(node.selectorPath.map((step) => step.enter), ["shadow"]);
          assert.ok(["button", "img"].includes(await opened.page.evaluate((node) => window.__a11ySelectors.resolve(node).localName, node)));
        }
      }
    }
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
    const axe = result.engines.axe;
    const ibm = result.engines.ibm;
    if (!("violations" in axe)) throw new Error("axe didn't run");
    if (!("violations" in ibm)) throw new Error("IBM didn't run");
    assert.deepEqual(axe.violations, []);
    assert.deepEqual(ibm.violations, []);
    assert.deepEqual(await closedShadowHosts(opened.page), { "x-thing": 1 });
    await opened.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("nested shadow and frame selectors highlight exact elements in both engines", { skip }, async () => {
  const { browser } = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<!doctype html><html lang="en"><head><title>Nested</title></head><body><main><h1>Nested</h1><div id="host"></div></main></body></html>');
    await page.evaluate(() => {
      const root = document.querySelector("#host").attachShadow({ mode: "open" });
      const frame = document.createElement("iframe");
      frame.style.cssText = "width:500px;height:300px;margin:40px;border:5px solid black";
      frame.srcdoc = '<!doctype html><html lang="en"><head><title>Frame</title></head><body><main><h1>Frame</h1><div id="inside"></div></main></body></html>';
      root.append(frame);
    });
    const iframe = await page.locator("iframe").elementHandle();
    const frame = await iframe.contentFrame();
    await frame.waitForLoadState();
    await frame.evaluate(() => {
      const root = document.querySelector("#inside").attachShadow({ mode: "open" });
      root.innerHTML = "<x-inner></x-inner><x-inner></x-inner>";
      root.querySelectorAll("x-inner")[1].attachShadow({ mode: "open" }).innerHTML = '<button data-finding="button" style="width:100px;height:50px"></button><img data-finding="img" src="bad.png" style="width:80px;height:60px">';
    });
    /** @type {import('../src/types.js').TierResult} */
    const rules = await runRules(page, { engines: ["axe", "ibm"], wcag: "2.2", level: "AA" });
    for (const engine of Object.values(rules.engines)) {
      assert.equal(engine.status, "ran", engine.reason);
      const findings = engine.violations.filter((finding) => ["button-name", "image-alt", "input_label_exists", "img_alt_valid"].includes(finding.ruleId));
      assert.equal(findings.length, 2);
      for (const finding of findings) {
        assert.equal(finding.nodeCount, 1);
        const node = finding.nodes[0];
        assert.equal(node.selectorError, undefined);
        assert.deepEqual(node.selectorPath.map((step) => step.enter), ["shadow", "frame", "shadow", "shadow"]);
        const expected = ["button-name", "input_label_exists"].includes(finding.ruleId) ? "button" : "img";
        assert.equal(await page.evaluate((node) => window.__a11ySelectors.resolve(node).getAttribute("data-finding"), node), expected);
        assert.match(findingBlock(finding, { showImpact: false, showToolkit: false }), /shadow root.*frame document.*shadow root.*shadow root/);
      }
    }
    const takeScreenshot = page.screenshot.bind(page);
    let captures = 0;
    page.screenshot = async (options) => {
      const bounds = await frame.evaluate(() => {
        const elements = document.querySelector("#inside").shadowRoot.querySelectorAll("x-inner")[1].shadowRoot.querySelectorAll("[data-finding]");
        const outlines = [...document.querySelectorAll('[data-automatica11y-screenshot-overlay] > div')];
        return [...elements].map((element) => {
          const rect = element.getBoundingClientRect();
          return outlines.some((outline) => {
            const box = outline.getBoundingClientRect();
            return Math.abs(box.left - rect.left) < 1 && Math.abs(box.top - rect.top) < 1 && Math.abs(box.width - rect.width) < 1 && Math.abs(box.height - rect.height) < 1;
          });
        });
      });
      assert.deepEqual(bounds, [true, true]);
      captures += 1;
      return takeScreenshot(options);
    };
    const outputDir = makeTree();
    await captureRuleScreenshots(page, rules, { enabled: true, outputDir, target: "nested", context: "page" });
    assert.equal(captures, 2);
    for (const engine of Object.values(rules.engines)) {
      assert.ok(engine.screenshot);
      assert.equal(readFileSync(join(outputDir, engine.screenshot)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
    for (const current of page.frames()) assert.equal(await current.locator('[data-automatica11y-screenshot-overlay]').count(), 0);
  } finally {
    await browser.close();
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
