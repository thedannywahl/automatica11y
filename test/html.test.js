import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { assetsOf, entry, isAsset } from "../src/frameworks/html.js";
import { classifyTarget } from "../src/plan/classify.js";
import { detectFlavor, resolveNpmTarget } from "../src/plan/resolve-npm.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

async function run(args, files = {}) {
  const cwd = makeTree(files);
  const { io, out } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(args, io);
  const read = (file) => {
    try {
      return readFileSync(join(cwd, "a11y-report", file), "utf8");
    } catch {
      return null;
    }
  };
  const results = read("results.json");
  return { code, ...out, cwd, results: results && parseResults(JSON.parse(results)), report: read("report.md"), file: read };
}

const DISCLOSURE = `<button type="button" data-a11y-trigger data-toggle="more">Details</button>
<div id="more" data-a11y-root role="region" aria-label="Details" hidden>More about this.</div>`;

test("a package that ships a stylesheet or a browser script and needs no framework is plain HTML", () => {
  assert.equal(detectFlavor({ exports: { "./components.css": "./components.css" } }).kind, "npm-html");
  assert.equal(detectFlavor({ style: "dist/style.css" }).kind, "npm-html");
  assert.equal(detectFlavor({ unpkg: "dist/a.iife.js" }).kind, "npm-html");
  assert.equal(detectFlavor({ exports: { "./a.umd.js": "./a.umd.js" } }).kind, "npm-html");
  assert.equal(detectFlavor({ peerDependencies: { react: "^18" }, exports: { "./a.css": "./a.css" } }).kind, "npm-react", "a framework wins");
  assert.equal(detectFlavor({ peerDependencies: { svelte: "^5" }, style: "a.css" }).kind, "npm-unsupported");
  assert.equal(detectFlavor({ exports: { ".": "./index.js" } }).kind, "npm", "no browser assets, so the metadata can't say");
});

test("a list that names a stylesheet or a script is plain HTML even when the metadata says nothing", async () => {
  const target = await resolveNpmTarget(await classifyTarget("npm:plain-utils,fake-html-js/init.iife.js"), npmView);
  assert.equal(target.status, "ok");
  assert.equal(target.kind, "npm-html");
  const framework = await resolveNpmTarget(await classifyTarget("npm:fake-ui,fake-html-js/init.iife.js"), npmView);
  assert.equal(framework.kind, "npm-react", "the primary's framework wins");
});

test("styles and scripts are told apart by their sub-path, in the order written", () => {
  assert.deepEqual([isAsset("components.css"), isAsset("dist/x.iife.js"), isAsset("x.mjs"), isAsset("button"), isAsset(null)], [true, true, true, false, false]);
  assert.deepEqual(assetsOf([{ name: "a", subpath: "base.css" }, { name: "b", subpath: "x.iife.js" }, { name: "c", subpath: null }, { name: "a", subpath: "components.css" }]), {
    styles: ["a/base.css", "a/components.css"],
    scripts: ["b/x.iife.js"],
  });
});

test("the page loads the styles first, mounts the markup, then loads the scripts", () => {
  const text = entry("/f.html", "x", { assets: { styles: ["a/base.css"], scripts: ["b/x.iife.js", "b/y.iife.js"] } });
  assert.ok(text.indexOf('import "a/base.css"') < text.indexOf("root.innerHTML = markup"));
  assert.ok(text.indexOf("root.innerHTML = markup") < text.indexOf('await import("b/x.iife.js")'));
  assert.ok(text.indexOf('await import("b/x.iife.js")') < text.indexOf('await import("b/y.iife.js")'));
  assert.match(text, /document\.createElement\("script"\)/, "a script in the markup is made again so it runs");
});

test("a script that isn't in the package's exports fails before anything installs", async () => {
  const target = await resolveNpmTarget(await classifyTarget("npm:fake-html-css/components.css,fake-html-js/missing.js"), npmView);
  assert.equal(target.status, "failed");
  assert.match(target.reason, /fake-html-js/);
});

test("HTML: an authored snippet runs against the target's styles, and its script finds the markup", { skip, timeout: 240_000 }, async () => {
  const result = await run(
    ["audit", "site=npm:fake-html-css/base.css,fake-html-css/components.css,fake-html-js/init.iife.js", "--archetypes", "accordion", "--tiers", "rules,interactions"],
    { "fixtures/site/accordion.html": DISCLOSURE },
  );
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.flavor, target.npm.name], ["html", "fake-html-css"]);
  assert.deepEqual(target.npm.assets, { styles: ["fake-html-css/base.css", "fake-html-css/components.css"], scripts: ["fake-html-js/init.iife.js"] });
  assert.deepEqual(target.npm.companions.map((c) => c.name), ["fake-html-css", "fake-html-js"]);
  const accordion = target.archetypes.accordion;
  assert.deepEqual([accordion.status, accordion.fixture.source], ["ran", "authored"], accordion.reason ?? "");
  assert.deepEqual(accordion.configs.map((c) => c.state), ["collapsed", "expanded"], "the script wired the toggle, so the open state was reached");
  assert.match(result.report, /as plain HTML \(2 stylesheets, 1 script\)\./);
});

test("HTML: a package with no framework and no list runs an authored snippet, and other archetypes are gaps that say so", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "css=npm:fake-html-css", "--archetypes", "button,dialog", "--tiers", "rules"], {
    "fixtures/css/button.html": '<button type="button" data-a11y-trigger data-a11y-root>Save</button>',
  });
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.equal(target.npm.flavor, "html");
  assert.deepEqual([target.archetypes.button.status, target.archetypes.button.fixture.source], ["ran", "authored"]);
  assert.equal(target.archetypes.dialog.status, "gap");
  assert.match(target.archetypes.dialog.reason, /Plain HTML has no component to find[\s\S]*Write fixtures\/css\/dialog\.html/);
});

test("HTML: a script that throws is a gap with the reason, never a pass", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "site=npm:fake-html-css/components.css,fake-html-js/broken.iife.js", "--archetypes", "button", "--tiers", "rules"], {
    "fixtures/site/button.html": '<button type="button" data-a11y-trigger data-a11y-root>Save</button>',
  });
  const button = result.results.targets[0].archetypes.button;
  assert.equal(button.status, "gap");
  assert.match(button.reason, /This script can't start/);
});
