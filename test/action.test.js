import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { inputArgs, runAudit, writeOutputs } from "../src/action/runner.js";
import { findBrowser } from "../src/env/browser.js";
import { makeTree } from "./helpers/fixtures.js";

test("Action inputs preserve argument boundaries without shell evaluation", () => {
  const args = inputArgs({ targets: "label=./path with spaces\n--dangerous\nnpm:one,two", out: "$(touch nope)", "local-packages": "@scope/components=./packages/components/dist\n@scope/interactions=./packages/interactions/dist\n", generate: "false" });
  assert.deepEqual(args, ["--out", "$(touch nope)", "--local-package", "@scope/components=./packages/components/dist", "--local-package", "@scope/interactions=./packages/interactions/dist", "--no-generate", "--", "label=./path with spaces", "--dangerous", "npm:one,two"]);
  assert.throws(() => inputArgs({ generate: "maybe" }), /true or false/);
});

test("Action output uses delimiter-safe multiline records", () => {
  const cwd = makeTree();
  const path = join(cwd, "outputs");
  writeOutputs({ "report-path": "first\n::error::second" }, path);
  assert.match(readFileSync(path, "utf8"), /^report-path<<automatica11y_[^\n]+\nfirst\n::error::second\nautomatica11y_/);
});

test("Action keeps reports and original failing exit for artifact upload", async () => {
  const cwd = makeTree({ "page.html": "<h1>Test</h1>", ".automatica11y.yml": "version: 1\ntargets: [./page.html]\nartifacts:\n  name: custom-report\n  retentionDays: 3\nsummary: false\n" });
  /** @type {{ file: string, args: string[], options: import("node:child_process").SpawnOptions }[]} */
  const commands = [];
  const outputs = await runAudit({ "upload-artifact": "true" }, { GITHUB_WORKSPACE: cwd }, { installBrowser: false, run: async (file, args, options) => {
    commands.push({ file, args, options });
    if (args[1] === "ci") {
      writeFileSync(join(cwd, "a11y-report/report.md"), "Report");
      writeFileSync(join(cwd, "a11y-report/results.json"), "{}");
      return 5;
    }
    return 0;
  } });
  assert.equal(outputs["exit-code"], 5);
  assert.equal(outputs.outcome, "incomplete");
  assert.equal(outputs["artifact-name"], "custom-report");
  assert.equal(outputs["artifact-retention-days"], "3");
  assert.equal(outputs["report-path"], join(cwd, "a11y-report/report.md"));
  assert.equal(commands[0].args[1], "doctor");
  assert.equal(commands[1].args[1], "ci");
  assert.equal(commands[1].options.cwd, cwd);
});

test("Action rejects stale output instead of uploading existing reports", async () => {
  const cwd = makeTree({ "page.html": "<h1>Test</h1>", "a11y-report/report.md": "Stale" });
  const outputs = await runAudit({ targets: "./page.html", summary: "false" }, { GITHUB_WORKSPACE: cwd }, { installBrowser: false, run: async () => { throw new Error("must not run"); } });
  assert.equal(outputs["exit-code"], 2);
  assert.equal(outputs["artifact-path"], "");
  assert.equal(outputs["report-path"], "");
});

test("Action metadata pins dependencies and uploads before propagating failure", () => {
  const action = parse(readFileSync(new URL("../action.yml", import.meta.url), "utf8"));
  assert.equal(action.runs.using, "composite");
  /** @type {{ id?: string, name?: string, uses?: string }[]} */
  const steps = action.runs.steps;
  for (const step of steps.filter((step) => step.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.ok(steps.findIndex((step) => step.id === "artifact") < steps.findIndex((step) => step.name === "Propagate CI outcome"));
  assert.equal(action.inputs["fail-on-axe"].default, undefined);
  assert.equal(action.inputs["fail-on-incomplete"].default, undefined);
  assert.match(action.inputs["local-packages"].description, /one package-name=path mapping per line/);
});

test("Marketplace releases are separate immutable semantic-version tags", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/action-release.yml", import.meta.url), "utf8"));
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  assert.equal(workflow.jobs.release.needs, "test");
  assert.equal(workflow.jobs.release.permissions.contents, "write");
  assert.equal(workflow.jobs.test.permissions, undefined);
  assert.match(workflow.jobs.release.steps[0].run, /gh release create/);
});

test("Action wrapper runs the real CLI and preserves failing browser results", async (context) => {
  const { browser } = await findBrowser();
  if (!browser) return context.skip("No Chrome or Chromium found");
  const cwd = makeTree();
  const target = new URL("./fixtures/missing-label.html", import.meta.url).pathname;
  const outputs = await runAudit({ targets: target, tiers: "rules", engine: "axe" }, { ...process.env, GITHUB_WORKSPACE: cwd, GITHUB_STEP_SUMMARY: join(cwd, "summary.md") }, { installBrowser: false });
  assert.equal(outputs["exit-code"], 1);
  assert.equal(outputs.outcome, "failed");
  assert.equal(JSON.parse(readFileSync(outputs["results-path"], "utf8")).failCheck.tripped, true);
  assert.match(readFileSync(outputs["report-path"], "utf8"), /CI outcome/);
  assert.match(readFileSync(join(cwd, "summary.md"), "utf8"), /axe: \d+ automated violations/);
});