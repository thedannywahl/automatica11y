import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { findBrowser, INSTALL_COMMAND, minChromeMajor } from "../src/env/browser.js";
import { checkEnvironment } from "../src/env/check.js";
import { checkNode, MIN_NODE_MAJOR } from "../src/env/node.js";
import { readPackageVersion, readToolVersions } from "../src/env/versions.js";
import { makeFakeBrowser, makeTree } from "./helpers/fixtures.js";

const onUnix = process.platform !== "win32";

test("checkNode: reports a problem only below the minimum major", () => {
  assert.equal(checkNode(`${MIN_NODE_MAJOR}.0.0`).length, 0);
  assert.equal(checkNode(`${MIN_NODE_MAJOR - 1}.9.0`)[0].id, "node");
  assert.deepEqual(checkNode(), checkNode(process.versions.node));
});

test("Node 21 fails the environment check; Node 22 passes that part", async () => {
  const env = { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" };
  const old = await checkEnvironment({ env, nodeVersion: "21.9.0" });
  assert.ok(old.problems.some((p) => p.id === "node"));
  const fine = await checkEnvironment({ env, nodeVersion: "22.0.0" });
  assert.ok(!fine.problems.some((p) => p.id === "node"));
});

test("a browser older than the minimum fails the environment check; a newer or unversioned one passes", { skip: !onUnix }, async () => {
  /** @param {string} version */
  const check = (version) => checkEnvironment({ env: { PATH: "", AUTOMATICA11Y_CHROME: makeFakeBrowser(version) } });
  const min = minChromeMajor();
  assert.ok(min > 100, "the floor is read from the installed playwright-core");
  const old = await check(`${min - 1}.0.0.0`);
  const problem = old.problems.find((p) => p.id === "browser-old");
  assert.ok(problem);
  assert.match(problem.fix, /--allow-old-browser/);
  assert.match(problem.fix, /doctor --install-browser/);
  assert.equal(old.ok, false);
  const fine = await check(`${min}.0.0.0`);
  assert.ok(!fine.problems.some((p) => p.id === "browser-old"));
});

test("allowOldBrowser accepts only an outdated browser and preserves its warning", { skip: !onUnix }, async () => {
  const env = { PATH: "", AUTOMATICA11Y_CHROME: makeFakeBrowser(`${minChromeMajor() - 1}.0.0.0`) };
  const result = await checkEnvironment({ env, allowOldBrowser: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.warnings[0].id, "browser-old");
  const oldNode = await checkEnvironment({ env, allowOldBrowser: true, nodeVersion: "21.0.0" });
  assert.equal(oldNode.ok, false);
  assert.equal(oldNode.problems[0].id, "node");
  const missing = await checkEnvironment({ env: { AUTOMATICA11Y_CHROME: "/does/not/exist" }, allowOldBrowser: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.problems[0].id, "browser");
});

test("a system browser that is too old gives way to a downloaded headless shell", { skip: !onUnix }, async () => {
  const bin = makeTree();
  const chrome = join(bin, "google-chrome");
  writeFileSync(chrome, '#!/bin/sh\necho "Google Chrome 100.0.0.0"\n');
  chmodSync(chrome, 0o755);
  const cache = makeTree();
  const dir = join(cache, "chromium_headless_shell-1248", "chrome-headless-shell-mac-arm64");
  mkdirSync(dir, { recursive: true });
  const shell = join(dir, "chrome-headless-shell");
  writeFileSync(shell, `#!/bin/sh\necho "Chromium ${minChromeMajor()}.0.0.0"\n`);
  chmodSync(shell, 0o755);
  const env = { PATH: bin, PLAYWRIGHT_BROWSERS_PATH: cache, HOME: bin };
  const { browser } = await findBrowser({ platform: "linux", env });
  assert.equal(browser.kind, "headless-shell");
  const old = await checkEnvironment({ platform: "linux", env: { PATH: bin, PLAYWRIGHT_BROWSERS_PATH: makeTree(), HOME: bin } });
  assert.ok(old.problems.some((p) => p.id === "browser-old"), "with no shell to fall back to, the old browser is reported");
});

test("an override that points nowhere is a problem that names the variable", async () => {
  const { browser, problem } = await findBrowser({ env: { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" } });
  assert.equal(browser, null);
  assert.match(problem.message, /AUTOMATICA11Y_CHROME/);
  assert.match(problem.fix, new RegExp(INSTALL_COMMAND));
});

test("an override that exists is used and its version is read", { skip: !onUnix }, async () => {
  const path = makeFakeBrowser("131.0.6778.69");
  const { browser, problem } = await findBrowser({ env: { PATH: "", AUTOMATICA11Y_CHROME: path } });
  assert.equal(problem, null);
  assert.deepEqual(browser, { kind: "custom", path, version: "131.0.6778.69" });
});

test("finds chrome on PATH on Linux", { skip: !onUnix }, async () => {
  const bin = makeTree();
  const path = join(bin, "google-chrome");
  writeFileSync(path, '#!/bin/sh\necho "Google Chrome 120.0.0.1"\n');
  chmodSync(path, 0o755);
  const { browser } = await findBrowser({ platform: "linux", env: { PATH: bin, HOME: bin } });
  assert.equal(browser.kind, "chrome");
  assert.equal(browser.version, "120.0.0.1");
});

test("finds a Playwright headless shell in its cache", { skip: !onUnix }, async () => {
  const cache = makeTree();
  const dir = join(cache, "chromium_headless_shell-1243", "chrome-headless-shell-mac-arm64");
  mkdirSync(dir, { recursive: true });
  const shell = join(dir, "chrome-headless-shell");
  writeFileSync(shell, '#!/bin/sh\necho "Chromium 140.0.1.2"\n');
  chmodSync(shell, 0o755);
  const { browser } = await findBrowser({ platform: "linux", env: { PATH: "", PLAYWRIGHT_BROWSERS_PATH: cache } });
  assert.equal(browser.kind, "headless-shell");
  assert.equal(browser.version, "140.0.1.2");
});

test("reports no browser when nothing is installed", async () => {
  const empty = makeTree();
  const { browser, problem } = await findBrowser({ platform: "linux", env: { PATH: empty, PLAYWRIGHT_BROWSERS_PATH: empty } });
  assert.equal(browser, null);
  assert.match(problem.fix, /playwright-core install --only-shell chromium/);
});

test("tool versions: installed tools report a version, and missing ones are null", () => {
  const tools = readToolVersions({ chromium: "1.2.3.4" });
  assert.equal(tools.node, process.versions.node);
  assert.match(tools.automatica11y, /^\d+\.\d+\.\d+/);
  assert.equal(tools.chromium, "1.2.3.4");
  for (const key of ["axe-core", "ibm-checker-engine", "playwright-core", "esbuild", "guidepup-vsr"]) assert.match(tools[key], /^\d+\.\d+\.\d+/, key);
  assert.equal(readPackageVersion("valibot")?.split(".")[0], "1");
  assert.equal(readPackageVersion("not-a-real-package-xyz"), null);
});
