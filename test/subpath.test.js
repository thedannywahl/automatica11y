import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { classifyTarget } from "../src/plan/classify.js";
import { checkExports, cleanSubpath, notExportedMessage, subpathProblem } from "../src/plan/subpath.js";
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
  return { code, ...out, cwd, results: results && parseResults(JSON.parse(results)), plan: read("plan.json") && JSON.parse(read("plan.json")), mapping: read("mapping.json") && JSON.parse(read("mapping.json")), report: read("report.md"), file: read };
}

// ---- reading the spec ----

test("an npm spec can carry a version and a sub-path, in that order", async () => {
  const cases = [
    ["npm:react-dom/client", "react-dom", null, "client", "react-dom-client"],
    ["npm:@scope/pkg/button", "@scope/pkg", null, "button", "scope-pkg-button"],
    ["npm:@scope/pkg/button/v2", "@scope/pkg", null, "button/v2", "scope-pkg-button-v2"],
    ["npm:@scope/pkg@1.2.3/button/v2", "@scope/pkg", "1.2.3", "button/v2", null],
    ["npm:@scope/pkg@^11/closeButton", "@scope/pkg", "^11", "closeButton", null],
    ["npm:pkg@latest/a/b/c", "pkg", "latest", "a/b/c", null],
    ["npm:pkg/es/Button/index.js", "pkg", null, "es/Button/index.js", null],
    ["npm:@scope/pkg/button/", "@scope/pkg", null, "button", null],
    ["npm:@scope/pkg", "@scope/pkg", null, null, "scope-pkg"],
  ];
  for (const [input, name, requested, subpath, label] of cases) {
    const target = await classifyTarget(input, { cwd: makeTree() });
    assert.equal(target.status, "ok", input);
    assert.deepEqual([target.resolved.name, target.resolved.requested, target.resolved.subpath], [name, requested, subpath], input);
  }
  const named = await classifyTarget("buttons=npm:@scope/pkg/button/v2", { cwd: makeTree() });
  assert.deepEqual([named.label, named.resolved.subpath], ["buttons", "button/v2"]);
});

test("a sub-path that could point outside the package, or isn't a path, is refused", async () => {
  for (const input of ["npm:pkg/../other", "npm:pkg/./x", "npm:pkg/a//b", "npm:@scope/pkg/a\\b", "npm:pkg@1.0.0/.."]) {
    const target = await classifyTarget(input, { cwd: makeTree() });
    assert.equal(target.status, "failed", input);
    assert.match(target.reason, /isn't a valid sub-path/, input);
  }
  assert.deepEqual(cleanSubpath("a/b/"), { ok: true, subpath: "a/b" });
  assert.equal(cleanSubpath("").ok, false);
  const noVersion = await classifyTarget("npm:pkg@/button", { cwd: makeTree() });
  assert.match(noVersion.reason, /ends with @ but has no version/);
});

// ---- the exports map ----

test("exports: exact keys, patterns, null entries, and a root-only package", () => {
  const exportsField = { ".": "./i.js", "./button": "./b.js", "./button/v2": "./b2.js", "./es/*": "./es/*", "./feat/*.js": "./feat/*.js", "./internal/*": null, "./package.json": "./package.json" };
  const ok = (subpath) => checkExports(exportsField, subpath).ok;
  assert.ok(ok("button") && ok("button/v2") && ok("es/Button.js") && ok("es/a/b.js") && ok("feat/x.js") && ok("package.json"));
  assert.ok(!ok("button/v3") && !ok("feat/x.css") && !ok("internal/secret") && !ok("lib/x.js"));
  assert.deepEqual(checkExports(exportsField, "nope").exact, ["./button", "./button/v2"], "package.json is never offered, null entries are left out");
  assert.deepEqual(checkExports(exportsField, "nope").patterns, ["./es/*", "./feat/*.js"]);
  assert.deepEqual(checkExports("./index.js", "button"), { checked: true, ok: false, exact: [], patterns: [] }, "a string exports field is the root only");
  assert.equal(checkExports({ import: "./a.js", default: "./b.js" }, "x").ok, false, "conditions with no sub-paths are the root only");
  assert.equal(checkExports(undefined, "x").checked, false, "no field says nothing");
});

test("the message for a wrong sub-path names the package, suggests close matches, and lists what's offered", () => {
  const message = notExportedMessage({ name: "@scope/ui-buttons", version: "11.7.8", subpath: "closeButon", exact: ["./button", "./closeButton", "./v11_7"], patterns: ["./es/*"] });
  assert.match(message, /^"@scope\/ui-buttons\/closeButon" isn't something @scope\/ui-buttons@11\.7\.8 exports\./);
  assert.match(message, /It exports @scope\/ui-buttons\/button, @scope\/ui-buttons\/closeButton, @scope\/ui-buttons\/v11_7\./);
  assert.match(message, /It also exports files by pattern: @scope\/ui-buttons\/es\/\*\./);
  const close = notExportedMessage({ name: "p", version: null, subpath: "button/v3", exact: ["./button/v2", "./dialog"], patterns: [] });
  assert.match(close, /Did you mean p\/button\/v2 or p\/dialog\?|Did you mean p\/button\/v2\?/, "a shared start is suggested");
  assert.match(notExportedMessage({ name: "p", version: null, subpath: "x", exact: [], patterns: [] }), /It exports only its main entry\./);
  assert.match(notExportedMessage({ name: "p", version: "1.0.0", subpath: "x", exact: Array.from({ length: 20 }, (_, i) => `./a${i}`), patterns: [] }), /, and 8 more\./);
});

test("--plan checks the sub-path against the registry's exports, before anything is installed", async () => {
  const good = await run(["audit", "npm:fake-subpaths/button/v2", "--plan"]);
  assert.equal(good.code, 0, good.stderr);
  assert.deepEqual([good.plan.targets[0].status, good.plan.targets[0].resolved.subpath, good.plan.targets[0].id], ["ok", "button/v2", "fake-subpaths-button-v2"]);
  assert.match(good.stdout, /fake-subpaths@2\.0\.0\/button\/v2 \(React\)/);
  const bad = await run(["audit", "npm:fake-subpaths/buton", "--plan"]);
  assert.equal(bad.plan.targets[0].status, "failed");
  assert.match(bad.plan.targets[0].reason, /"fake-subpaths\/buton" isn't something fake-subpaths@2\.0\.0 exports\. Did you mean fake-subpaths\/button/);
  const hidden = await run(["audit", "npm:fake-subpaths/internal/secret", "--plan"]);
  assert.equal(hidden.plan.targets[0].status, "failed", "a null export is not exported");
});

test("after install, a package with no exports map is checked against its files", () => {
  const dir = makeTree({ "node_modules/legacy/package.json": JSON.stringify({ name: "legacy" }), "node_modules/legacy/lib/widgets.js": "export const a = 1;", "node_modules/legacy/lib/deep/index.js": "export const b = 1;" });
  assert.equal(subpathProblem(dir, "legacy", "lib/widgets", "1.0.0"), null, "an extension can be left off");
  assert.equal(subpathProblem(dir, "legacy", "lib/widgets.js", "1.0.0"), null);
  assert.equal(subpathProblem(dir, "legacy", "lib/deep", "1.0.0"), null, "a folder with an index file");
  assert.match(subpathProblem(dir, "legacy", "lib/missing", "1.0.0"), /"legacy\/lib\/missing" isn't a file in legacy@1\.0\.0, and the package has no exports map/);
  assert.match(subpathProblem(makeTree(), "ghost", "x", null), /ghost was installed, but its package\.json couldn't be read/);
});

// ---- audits in a real browser ----

test("the sub-path is what's tested: its button, not the package root's", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "npm:fake-subpaths/button", "--archetypes", "button", "--tiers", "rules,vsr"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.name, target.npm.subpath, target.id], ["fake-subpaths", "button", "fake-subpaths-button"]);
  assert.match(result.report, /Installed `fake-subpaths@2\.0\.0` on its own and tested its `fake-subpaths\/button` entry, as React/);
  assert.match(result.mapping["fake-subpaths-button"].button.export, /^Button$/);
  const log = target.archetypes.button.configs[0].tiers.vsr.log[0].announcements.join(" ");
  assert.match(log, /button, Save/);
});

test("two versions of a component, side by side, show different results", { skip, timeout: 300_000 }, async () => {
  const result = await run(["compare", "v1=npm:fake-subpaths/button", "v2=npm:fake-subpaths/button/v2", "--archetypes", "button", "--tiers", "interactions"]);
  assert.equal(result.code, 0, result.stderr);
  const checks = (id) => Object.fromEntries(result.results.targets.find((t) => t.id === id).archetypes.button.configs[0].tiers.interactions.checks.map((c) => [c.name, c.result]));
  assert.equal(checks("v1")["trigger-reachable-by-tab"], "pass");
  assert.equal(checks("v2")["trigger-reachable-by-tab"], "fail", "the second version can't be reached with Tab");
  assert.deepEqual(result.results.targets.map((t) => t.npm.subpath), ["button", "button/v2"]);
});

test("a sub-path is a package name for generation: a dialog family is found and built from it", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "npm:fake-subpaths/dialog", "--archetypes", "dialog", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const dialog = result.results.targets[0].archetypes.dialog;
  assert.deepEqual([dialog.status, dialog.fixture.recipe], ["ran", "dialog-compound"]);
  assert.match(result.file("generated/fake-subpaths-dialog/dialog.jsx"), /import \* as Lib from "fake-subpaths\/dialog"/);
});

test("a pattern export, and a package with no exports map, can be tested by file", { skip, timeout: 300_000 }, async () => {
  const pattern = await run(["audit", "npm:fake-subpaths/es/extra.js", "--archetypes", "link", "--tiers", "rules"]);
  assert.equal(pattern.code, 0, pattern.stderr);
  assert.equal(pattern.results.targets[0].archetypes.link.status, "ran");
  const legacy = await run(["audit", "npm:fake-legacy/lib/widgets", "--archetypes", "button", "--tiers", "rules"]);
  assert.equal(legacy.code, 0, legacy.stderr);
  assert.equal(legacy.results.targets[0].archetypes.button.status, "ran");
  const missing = await run(["audit", "npm:fake-legacy/lib/nope", "--tiers", "rules"]);
  assert.equal(missing.code, 4);
  assert.match(missing.results.targets[0].reason, /"fake-legacy\/lib\/nope" isn't a file in fake-legacy@1\.0\.0/);
});
