import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { classifyTarget } from "../src/plan/classify.js";
import { resolveNpmTarget } from "../src/plan/resolve-npm.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

test("a comma-separated list is one target: the first package is primary and the rest are companions", async () => {
  const target = await classifyTarget("pan=npm:@pantoken/components@1.2.0/dist,@pantoken/interactions,plain-utils@3");
  assert.equal(target.status, "ok");
  assert.equal(target.label, "pan");
  assert.deepEqual(target.resolved, { name: "@pantoken/components", requested: "1.2.0", version: null, subpath: "dist" });
  assert.deepEqual(target.companions, [
    { name: "@pantoken/interactions", requested: null, version: null, subpath: null },
    { name: "plain-utils", requested: "3", version: null, subpath: null },
  ]);
  assert.equal((await classifyTarget("npm:a,b")).name, "a", "the primary names the target");
  assert.equal((await classifyTarget("npm:a")).companions, undefined, "one package has no companions");
});

test("a list with a space, an empty entry, a repeat, or a bad name fails and says which", async () => {
  assert.match((await classifyTarget("npm:a,")).reason, /empty entry[\s\S]*no spaces/);
  assert.match((await classifyTarget("npm:a,,b")).reason, /empty entry/);
  assert.match((await classifyTarget("npm:a,a@2")).reason, /"a" is in the list more than once/);
  assert.match((await classifyTarget("npm:a,B")).reason, /isn't a valid package name/);
  assert.match((await classifyTarget("npm:a,b@")).reason, /ends with @/);
});

test("each companion is looked up, so a missing version or a wrong sub-path fails before anything installs", async () => {
  const good = await resolveNpmTarget(await classifyTarget("npm:fake-ui,plain-utils"), npmView);
  assert.equal(good.status, "ok");
  assert.deepEqual(good.companions?.map((c) => [c.name, c.version]), [["plain-utils", "3.0.0"]]);
  const bad = await resolveNpmTarget(await classifyTarget("npm:fake-ui,nothing-here"), npmView);
  assert.equal(bad.status, "failed");
  assert.match(bad.reason, /nothing-here/);
  const path = await resolveNpmTarget(await classifyTarget("npm:fake-ui,fake-subpaths/nope"), npmView);
  assert.equal(path.status, "failed");
  assert.match(path.reason, /fake-subpaths@2\.0\.0 exports|isn't something/);
});

test("a list installs every package into one folder, and the report and results name them", { skip, timeout: 240_000 }, async () => {
  const cwd = makeTree({});
  const { io, out } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  const installs = [];
  io.installPackage = async (options) => {
    installs.push([options.name, options.dir]);
    return installPackage(options);
  };
  const code = await main(["audit", "ui=npm:fake-ui,plain-utils", "--archetypes", "button", "--tiers", "rules"], io);
  assert.equal(code, 0, out.stderr);
  assert.deepEqual(installs.map(([name]) => name), ["fake-ui", "plain-utils"]);
  assert.equal(new Set(installs.map(([, dir]) => dir)).size, 1, "one folder");
  const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
  const npm = results.targets[0].npm;
  assert.deepEqual([npm.name, npm.flavor], ["fake-ui", "react"]);
  assert.deepEqual(npm.companions, [{ name: "plain-utils", subpath: null, version: "3.0.0" }]);
  const plan = JSON.parse(readFileSync(join(cwd, "a11y-report", "plan.json"), "utf8"));
  assert.equal(plan.targets[0].companions[0].name, "plain-utils");
  assert.match(readFileSync(join(cwd, "a11y-report", "report.md"), "utf8"), /Installed beside it, in the same folder: `plain-utils@3\.0\.0`\./);
  assert.match(out.stdout, /fake-ui@1\.0\.0 with plain-utils@3\.0\.0/);
});
