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

/** @param {string} name @param {{ fastFixture?: boolean, interactionConcurrency?: number, archetypes?: string }} [options] */
async function run(name, { fastFixture = false, interactionConcurrency = 1, archetypes = "button,dialog,menu,live-region" } = {}) {
  const cwd = makeTree();
  /** @type {Array<{ target: string, phase: string, elapsedMs: number }>} */
  const phases = [];
  const { io, out } = makeIo({ cwd, env: process.env, fastFixture, interactionConcurrency, onFixturePhase: (event) => phases.push(event) });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(["audit", `lib=npm:${name}`, "--archetypes", archetypes, "--tiers", "rules,interactions,conditions"], io);
  const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
  return { code, results, phases, ...out };
}

test("Angular: fastFixture preserves Zone package measurements and generated states", { skip, timeout: 400_000 }, async () => {
  const normal = await run("fake-ng-zone", { archetypes: "button,menu" });
  const fast = await run("fake-ng-zone", { archetypes: "button,menu", fastFixture: true });
  assert.equal(normal.code, 0, normal.stderr);
  assert.equal(fast.code, normal.code, fast.stderr);
  assert.deepEqual(fast.results.targets, normal.results.targets);
  assert.ok(fast.phases.some((event) => event.phase === "discover"));
  assert.ok(fast.phases.some((event) => event.phase === "audit:menu"));
  assert.ok(fast.phases.every((event) => event.elapsedMs >= 0));
});

test("Angular: interaction pool preserves Zone and zoneless package results", { skip, timeout: 400_000 }, async () => {
  for (const name of ["fake-ng-zone", "fake-ng-ui"]) {
    const options = { archetypes: "dialog,menu", fastFixture: true };
    const serial = await run(name, options);
    const concurrent = await run(name, { ...options, interactionConcurrency: 2 });
    assert.equal(serial.code, 0, serial.stderr);
    assert.equal(concurrent.code, serial.code, concurrent.stderr);
    assert.deepEqual(concurrent.results.targets, serial.results.targets, name);
  }
});

test("Angular: a library that peers on zone.js runs with it, and gives the same results as the same library without it", { skip, timeout: 400_000 }, async (context) => {
  const withZone = await run("fake-ng-zone", { fastFixture: true, interactionConcurrency: 2 });
  context.diagnostic(`With Zone phases: ${withZone.phases.map((event) => `${event.phase}=${Math.round(event.elapsedMs)}ms`).join(", ")}`);
  const without = await run("fake-ng-ui", { fastFixture: true, interactionConcurrency: 2 });
  context.diagnostic(`Without Zone phases: ${without.phases.map((event) => `${event.phase}=${Math.round(event.elapsedMs)}ms`).join(", ")}`);
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