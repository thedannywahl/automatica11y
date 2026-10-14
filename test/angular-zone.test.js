import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @param {string} name */
async function run(name) {
  const cwd = makeTree();
  const { io, out } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(["audit", `lib=npm:${name}`, "--archetypes", "button,dialog,menu,live-region", "--tiers", "rules,interactions,conditions"], io);
  const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
  return { code, results, ...out };
}

test("Angular: a library that peers on zone.js runs with it, and gives the same results as the same library without it", { skip, timeout: 400_000 }, async () => {
  const withZone = await run("fake-ng-zone");
  const without = await run("fake-ng-ui");
  assert.equal(withZone.code, 0, withZone.stderr);
  assert.equal(without.code, 0, without.stderr);
  /** @param {Awaited<ReturnType<typeof run>>} result */
  const summarize = (result) => Object.fromEntries(Object.entries(result.results.targets[0].archetypes).map(([name, found]) => [name, {
    status: found.status,
    source: found.fixture?.source,
    states: found.configs.map((config) => config.state),
    checks: found.configs.flatMap((config) => (config.tiers.interactions?.checks ?? []).map((check) => `${check.name}:${check.result}`)).sort(),
    conditions: found.configs.flatMap((config) => (config.tiers.conditions?.checks ?? []).map((check) => `${check.name}:${check.result}`)).sort(),
  }]));
  const summary = summarize(withZone);
  assert.ok(Object.values(summary).every((result) => result.status === "ran" && result.checks.length > 0 && result.conditions.length > 0), JSON.stringify(summary));
  assert.deepEqual(summary, summarize(without));
});