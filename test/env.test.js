import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkEnvironment, findBrowser, INSTALL_COMMAND } from "../src/env/browser.js";
import { readPackageVersion, readToolVersions } from "../src/env/versions.js";
import { makeFakeBrowser, makeTree } from "./helpers/fixtures.js";

const onUnix = process.platform !== "win32";

test("Node 19 fails the environment check; Node 20 passes that part", async () => {
  const env = { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" };
  const old = await checkEnvironment({ env, nodeVersion: "19.9.0" });
  assert.ok(old.problems.some((p) => p.id === "node"));
  const fine = await checkEnvironment({ env, nodeVersion: "20.0.0" });
  assert.ok(!fine.problems.some((p) => p.id === "node"));
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
  for (const key of ["axe-core", "ibm-checker-engine", "playwright-core"]) assert.match(tools[key], /^\d+\.\d+\.\d+/, key);
  assert.equal(tools.esbuild, null);
  assert.equal(tools["guidepup-vsr"], null);
  assert.equal(readPackageVersion("valibot")?.split(".")[0], "1");
  assert.equal(readPackageVersion("not-a-real-package-xyz"), null);
});
