import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "valibot";
import { TargetResultSchema } from "../src/schema.js";
import { evaluateFailCheck, evaluateOutcome } from "../src/run/fail-check.js";

/**
 * Build a target result with the given findings per engine.
 * @typedef {{ status?: string, impacts?: string[] }} AxeSpec
 * @typedef {{ status?: string, levels?: number[] }} IbmSpec
 * @param {string} id
 * @param {{ axe?: AxeSpec, ibm?: IbmSpec, status?: string }} [spec]
 */
function target(id, { axe, ibm, status = "ran" } = {}) {
  const engines = {};
  if (axe) engines.axe = { status: axe.status ?? "ran", violations: (axe.impacts ?? []).map((impact, index) => ({ ...finding(`a${index}`), impact })) };
  if (ibm) engines.ibm = { status: ibm.status ?? "ran", violations: (ibm.levels ?? []).map((toolkitLevel, index) => ({ ...finding(`i${index}`), toolkitLevel })) };
  return parse(TargetResultSchema, { id, status, reason: null, summary: { engines: {}, gaps: [], notTestable: [] }, warnings: [], archetypes: { page: { status: "ran", configs: [{ libA11y: "n/a", tiers: { rules: { status: "ran", engines } } }] } } });
}

function finding(ruleId) {
  return { ruleId, impact: null, wcag: [], help: "Review", helpUrl: "", nodeCount: 0, nodes: [] };
}

const both = { axe: { impacts: ["serious"] }, ibm: { levels: [1] } };

test("no fail flags means no check", () => {
  assert.equal(evaluateFailCheck([target("a", both)], null), null);
});

test("--fail-on-axe alone counts axe violations at or above the impact", () => {
  const fail = (axe) => ({ mode: "any", axe, ibm: null });
  const t = [target("a", { axe: { impacts: ["minor", "serious"] }, ibm: { levels: [1, 1, 1] } })];
  assert.equal(evaluateFailCheck(t, fail("critical")).tripped, false);
  const serious = evaluateFailCheck(t, fail("serious"));
  assert.equal(serious.tripped, true);
  assert.equal(serious.axe.hits, 1);
  assert.equal(serious.ibm, null);
  assert.equal(evaluateFailCheck(t, fail("minor")).axe.hits, 2);
});

test("--fail-on-ibm alone counts IBM violations at or below the Toolkit level", () => {
  const fail = (ibm) => ({ mode: "any", axe: null, ibm });
  const t = [target("a", { axe: { impacts: ["critical"] }, ibm: { levels: [2, 3] } })];
  assert.equal(evaluateFailCheck(t, fail(1)).tripped, false);
  assert.equal(evaluateFailCheck(t, fail(2)).ibm.hits, 1);
  assert.equal(evaluateFailCheck(t, fail(3)).ibm.hits, 2);
  assert.equal(evaluateFailCheck(t, fail(3)).axe, null);
});

test("any: one engine tripping is enough", () => {
  const fail = { mode: "any", axe: "serious", ibm: 1 };
  assert.equal(evaluateFailCheck([target("a", { axe: { impacts: ["serious"] }, ibm: { levels: [] } })], fail).tripped, true);
  assert.equal(evaluateFailCheck([target("a", { axe: { impacts: [] }, ibm: { levels: [1] } })], fail).tripped, true);
  assert.equal(evaluateFailCheck([target("a", { axe: { impacts: ["minor"] }, ibm: { levels: [2] } })], fail).tripped, false);
});

test("all: every checked engine has to trip, on the same target", () => {
  const fail = { mode: "all", axe: "serious", ibm: 1 };
  assert.equal(evaluateFailCheck([target("a", both)], fail).tripped, true);
  assert.equal(evaluateFailCheck([target("a", { axe: { impacts: ["serious"] }, ibm: { levels: [] } })], fail).tripped, false);
  assert.equal(evaluateFailCheck([target("a", { axe: { impacts: [] }, ibm: { levels: [1] } })], fail).tripped, false);
  // Two targets that each trip one engine don't add up to "all".
  const split = [target("a", { axe: { impacts: ["serious"] }, ibm: { levels: [] } }), target("b", { axe: { impacts: [] }, ibm: { levels: [1] } })];
  const result = evaluateFailCheck(split, fail);
  assert.equal(result.tripped, false);
  assert.equal(result.axe.tripped, true);
  assert.equal(result.ibm.tripped, true);
});

test("all with a single checked engine behaves like that engine alone", () => {
  assert.equal(evaluateFailCheck([target("a", both)], { mode: "all", axe: "serious", ibm: null }).tripped, true);
  assert.equal(evaluateFailCheck([target("a", both)], { mode: "all", axe: "critical", ibm: null }).tripped, false);
});

test("an engine that failed, or a target that failed, counts as no hit", () => {
  const fail = { mode: "any", axe: "minor", ibm: 3 };
  assert.equal(evaluateFailCheck([target("a", { axe: { status: "failed", impacts: ["critical"] }, ibm: { status: "failed", levels: [1] } })], fail).tripped, false);
  assert.equal(evaluateFailCheck([target("a", { ...both, status: "failed" })], fail).tripped, false);
});

test("with compare, any target tripping trips the run, and each target is recorded", () => {
  const fail = { mode: "any", axe: "serious", ibm: null };
  const result = evaluateFailCheck([target("clean", { axe: { impacts: [] } }), target("bad", { axe: { impacts: ["critical"] } })], fail);
  assert.equal(result.tripped, true);
  assert.equal(result.targets.clean.tripped, false);
  assert.equal(result.targets.bad.tripped, true);
  assert.equal(result.axe.hits, 1);
});

test("counts never add across engines", () => {
  const result = evaluateFailCheck([target("a", { axe: { impacts: ["serious", "critical"] }, ibm: { levels: [1] } })], { mode: "any", axe: "serious", ibm: 1 });
  assert.equal(result.axe.hits, 2);
  assert.equal(result.ibm.hits, 1);
});

test("coverage gaps fail independently of engine all-mode", () => {
  const failed = target("broken", { status: "failed" });
  const options = { tiers: ["rules"], engines: ["axe"], policy: { incomplete: true } };
  assert.equal(evaluateOutcome([failed], options, null).status, "incomplete");
  const engineFailure = target("page", { axe: { status: "failed" } });
  engineFailure.archetypes.page.configs[0].tiers.rules.status = "ran";
  assert.equal(evaluateOutcome([engineFailure], options, { tripped: false }).status, "incomplete");
});

test("deliberately excluded tiers and genuinely inapplicable checks do not fail", () => {
  const clean = target("page", { axe: { impacts: [] } });
  clean.archetypes.page.configs[0].tiers.rules.status = "ran";
  const options = { tiers: ["rules"], engines: ["axe"], policy: { incomplete: true } };
  assert.equal(evaluateOutcome([clean], options, null).status, "passed");
  clean.archetypes.page.configs[0].tiers.rules = { status: "not-applicable" };
  assert.equal(evaluateOutcome([clean], options, null).status, "passed");
});

test("manual engine review findings are opt-in and not coverage gaps", () => {
  const clean = target("page", { axe: { impacts: [] } });
  clean.archetypes.page.configs[0].tiers.rules.status = "ran";
  clean.archetypes.page.configs[0].tiers.rules.engines.axe.incomplete = [finding("review")];
  const options = { tiers: ["rules"], engines: ["axe"], policy: { incomplete: true, review: false } };
  assert.equal(evaluateOutcome([clean], options, null).status, "passed");
  options.policy.review = true;
  assert.equal(evaluateOutcome([clean], options, null).status, "failed");
});

test("non-rule failures, undetermined checks, story failures and truncation have separate policies", () => {
  const result = target("page");
  result.archetypes.page.configs[0].tiers = { computed: { status: "ran", checks: [{ name: "contrast", result: "fail", detail: "Low contrast" }] } };
  const options = { tiers: ["computed"], engines: [], policy: { incomplete: true, checks: false } };
  assert.equal(evaluateOutcome([result], options, null).status, "passed");
  options.policy.checks = true;
  assert.equal(evaluateOutcome([result], options, null).status, "failed");
  result.archetypes.page.configs[0].tiers.computed.checks[0].result = "undetermined";
  assert.equal(evaluateOutcome([result], options, null).status, "incomplete");
  options.policy.incomplete = false;
  assert.equal(evaluateOutcome([result], options, null).status, "passed");
  result.storybook = { index: "index.json", total: 3, matched: 3, audited: 1, truncated: true, maxStories: 1, archetypeMatches: {}, failedStories: [{ id: "broken", reason: "didn't render" }] };
  const outcome = evaluateOutcome([result], options, null);
  assert.ok(outcome.coverage.some((reason) => reason.includes("truncated")));
  assert.ok(outcome.coverage.some((reason) => reason.includes("broken")));
});
