import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { configArgs, loadConfig } from "../src/commands/config.js";
import { parseRunArgs } from "../src/commands/common.js";
import { main } from "../src/cli.js";
import { makeIo } from "./helpers/fixtures.js";
import { makeTree } from "./helpers/fixtures.js";

test("YAML config preserves explicit disabling values and arrays", () => {
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\ntargets: [./dist]\noptions:\n  wcag: '2.2'\n  engines: [axe]\n  generate: false\nfail:\n  axe: null\n  incomplete: false\n" });
  const config = loadConfig(undefined, cwd);
  assert.deepEqual(config.targets, ["./dist"]);
  assert.deepEqual(configArgs(config), ["--wcag", "2.2", "--engine", "axe", "--no-generate", "--fail-on-axe", "none", "--fail-on-incomplete", "false"]);
});

test("annotated screenshot option defaults off and config/CLI values override in order", () => {
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\ntargets: [./dist]\noptions:\n  screenshots: true\n" });
  const config = loadConfig(undefined, cwd);
  assert.deepEqual(configArgs(config), ["--screenshots"]);
  assert.equal(parseRunArgs("audit", ["./dist"], { cwd }).options.screenshots, true);
  assert.equal(parseRunArgs("audit", ["./dist", "--no-screenshots"], { cwd }).options.screenshots, false);
  assert.equal(parseRunArgs("audit", ["./dist", "--no-screenshots", "--screenshots"], { cwd }).options.screenshots, true);
  assert.equal(parseRunArgs("audit", ["./dist"]).options.screenshots, false);
  assert.equal(parseRunArgs("audit", ["./dist", "--screenshots"]).options.screenshots, true);
});

test("configured output stays exact and CLI output overrides it", () => {
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\noptions:\n  out: ./configured-report\n" });
  assert.equal(parseRunArgs("audit", ["./page.html"], { cwd }).options.out, "./configured-report");
  assert.equal(parseRunArgs("audit", ["./page.html", "--out", "./custom-report"], { cwd }).options.out, "./custom-report");
});

test("local package mappings work in YAML and as repeatable CLI options", () => {
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\nlocalPackages:\n  fake-ui: ./packages/ui\n" });
  const config = loadConfig(undefined, cwd);
  assert.deepEqual(configArgs(config), ["--local-package", "fake-ui=./packages/ui"]);
  assert.deepEqual(parseRunArgs("audit", ["npm:fake-ui", "--local-package", "fake-ui=./override"], { cwd }).options.localPackages, {
    "fake-ui": join(cwd, "override"),
  });
});

test("missing implicit config is allowed; explicit missing config is an error", () => {
  const cwd = makeTree();
  assert.deepEqual(loadConfig(undefined, cwd), {});
  assert.throws(() => loadConfig("missing.yml", cwd), /ENOENT/);
});

test("invalid YAML, duplicate keys, unknown options and wrong scalar types fail", () => {
  for (const content of ["version: [", "version: 1\nversion: 1", "version: 1\nbogus: true", "version: 1\noptions:\n  wcag: 2.2", "version: 1\nfail:\n  incomplete: 'false'", "version: 1\nserver:\n  command: npm start\n  url: https://example.com"]) {
    const cwd = makeTree({ "config.yml": content });
    assert.throws(() => loadConfig("config.yml", cwd));
  }
});

test("CI defaults, YAML overrides and explicit argument precedence", () => {
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\ntargets: [./dist]\noptions:\n  engines: [axe]\n  generate: false\nfail:\n  axe: minor\n  incomplete: false\n" });
  const parsed = parseRunArgs("ci", ["--fail-on-axe", "none", "--generate"], { cwd });
  assert.deepEqual(parsed.targets, ["./dist"]);
  assert.deepEqual(parsed.options.fail, { axe: null, ibm: null, mode: "any" });
  assert.equal(parsed.options.generate, true);
  assert.equal(parsed.options.policy.incomplete, false);
  const defaults = parseRunArgs("ci", ["./dist"]);
  assert.deepEqual(defaults.options.fail, { axe: "serious", ibm: 1, mode: "any" });
  assert.equal(defaults.options.policy.incomplete, true);
});

test("ci plan mode needs no browser and infers comparison", async () => {
  const cwd = makeTree({ "one.html": "<h1>One</h1>", "two.html": "<h1>Two</h1>", ".automatica11y.yml": "version: 1\ntargets: [./one.html, ./two.html]\n" });
  const { io, out } = makeIo({ cwd });
  assert.equal(await main(["ci", "--plan"], io), 0, out.stderr);
  assert.match(out.stdout, /automatica11y compare plan/);
});