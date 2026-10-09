import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { ARCHETYPE_CHECKS, COMMON } from "../src/tiers/interactions/archetypes.js";
import { runCheck, runInteractions } from "../src/tiers/interactions/index.js";
import { ARCHETYPES } from "../src/schema.js";

const dir = new URL("./fixtures/interactions/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @type {Awaited<ReturnType<typeof launchBrowser>> | undefined} */
let session;
/** @type {Awaited<ReturnType<typeof serveStatic>> | undefined} */
let server;
before(async () => {
  if (skip) return;
  session = await launchBrowser();
  server = await serveStatic(dir);
});
after(async () => {
  await session?.browser.close();
  await server?.close();
});

const P = "pass";
const F = "fail";
const N = "not-applicable";
/** The common checks come first, then the archetype's own. */
const common = (reach, focus, trap) => ({ "trigger-reachable-by-tab": reach, "focus-indicator-visible": focus, "no-focus-trap": trap });

/** The live-region checks, in table order. */
const live = (inRegion, text, before, politeness, focus, dismiss, kept) => ({
  "message-in-live-region": inRegion,
  "message-has-text": text,
  "region-exists-before-message": before,
  "live-politeness-fits-role": politeness,
  "focus-stays-on-trigger": focus,
  "dismiss-works-by-keyboard": dismiss,
  "focus-kept-after-removal": kept,
});

/** One page per row, with the result every check should give. Good pages pass. Bad pages fail in a known way. */
/** @type {Record<string, [string, Record<string, string>]>} */
const PAGES = {
  "button-good": ["button", { ...common(P, P, P), "enter-activates": P, "space-activates": P }],
  "button-bad": ["button", { ...common(P, F, P), "enter-activates": F, "space-activates": F }],
  "button-trap-bad": ["button", { ...common(P, P, F), "enter-activates": P, "space-activates": P }],
  "link-good": ["link", { ...common(P, P, P), "enter-activates": P, "space-activates": N }],
  "link-bad": ["link", { ...common(P, F, P), "enter-activates": F, "space-activates": N }],
  "dialog-good": ["dialog", { ...common(P, P, P), "focus-moves-into-dialog": P, "tab-stays-inside-dialog": P, "escape-closes": P, "focus-returns-to-trigger": P }],
  "dialog-bad": ["dialog", { ...common(P, P, P), "focus-moves-into-dialog": F, "tab-stays-inside-dialog": F, "escape-closes": F, "focus-returns-to-trigger": N }],
  "menu-good": ["menu", { ...common(P, P, P), "opens-with-enter-or-arrow": P, "arrow-keys-move-between-items": P, "escape-closes-and-returns-focus": P }],
  "menu-bad": ["menu", { ...common(P, P, P), "opens-with-enter-or-arrow": P, "arrow-keys-move-between-items": F, "escape-closes-and-returns-focus": F }],
  "menu-bad-open": ["menu", { ...common(P, P, P), "opens-with-enter-or-arrow": F, "arrow-keys-move-between-items": N, "escape-closes-and-returns-focus": N }],
  "tabs-good": ["tabs", { ...common(P, P, P), "arrow-keys-move-between-tabs": P, "home-and-end-work": P, "selected-state-exposed": P }],
  "tabs-bad": ["tabs", { ...common(P, P, P), "arrow-keys-move-between-tabs": F, "home-and-end-work": F, "selected-state-exposed": F }],
  "combobox-good": ["combobox", { ...common(P, P, P), "arrow-down-opens-list": P, "arrow-keys-change-active-option": P, "enter-selects": P, "escape-closes": P }],
  "combobox-bad": ["combobox", { ...common(P, P, P), "arrow-down-opens-list": F, "arrow-keys-change-active-option": N, "enter-selects": N, "escape-closes": N }],
  "combobox-bad-keys": ["combobox", { ...common(P, P, P), "arrow-down-opens-list": P, "arrow-keys-change-active-option": F, "enter-selects": F, "escape-closes": F }],
  "form-field-good": ["form-field", { ...common(P, P, P), "label-associated": P, "error-associated-on-invalid": P }],
  "form-field-bad": ["form-field", { ...common(P, P, P), "label-associated": F, "error-associated-on-invalid": F }],
  "form-field-plain": ["form-field", { ...common(P, P, P), "label-associated": P, "error-associated-on-invalid": N }],
  "accordion-good": ["accordion", { ...common(P, P, P), "expanded-state-exposed": P, "enter-toggles": P, "space-toggles": P }],
  "accordion-bad": ["accordion", { ...common(P, P, P), "expanded-state-exposed": F, "enter-toggles": F, "space-toggles": F }],
  "tooltip-good": ["tooltip", { ...common(P, P, P), "appears-on-focus": P, "escape-dismisses": P, "content-reachable-on-hover": P }],
  "tooltip-bad": ["tooltip", { ...common(P, P, P), "appears-on-focus": F, "escape-dismisses": N, "content-reachable-on-hover": F }],
  "live-region-good": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, N, N) }],
  "live-region-good-alert": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, P, P) }],
  "live-region-bad-plain": ["live-region", { ...common(P, P, P), ...live(F, P, N, N, P, N, N) }],
  "live-region-bad-insert": ["live-region", { ...common(P, P, P), ...live(P, P, F, P, P, N, N) }],
  "live-region-bad-focus": ["live-region", { ...common(P, P, P), ...live(P, P, P, F, F, N, N) }],
  "live-region-good-inner-root": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, N, N) }],
  "live-region-good-shadow": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, N, N) }],
  "live-region-bad-late-live": ["live-region", { ...common(P, P, P), ...live(P, P, F, P, P, N, N) }],
  "live-region-bad-dismiss-keys": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, F, N) }],
  "live-region-bad-dismiss-focus": ["live-region", { ...common(P, P, P), ...live(P, P, P, P, P, P, F) }],
};

for (const [page, [archetype, expected]] of Object.entries(PAGES)) {
  test(`${page}: every check gives its known result`, { skip, timeout: 120_000 }, async () => {
    const result = await runInteractions(session.browser, `${server.origin}/${page}.html`, archetype);
    assert.equal(result.status, "ran");
    const actual = Object.fromEntries(result.checks.map((c) => [c.name, c.result]));
    assert.deepEqual(actual, expected, JSON.stringify(result.checks.map((c) => `${c.name}: ${c.detail}`), null, 1));
    for (const check of result.checks) {
      assert.ok(check.detail.length > 10, `${check.name} explains itself`);
      assert.ok(Array.isArray(check.criteria) && check.criteria.length > 0, `${check.name} names its WCAG criteria`);
    }
  });
}

test("every archetype with checks has a good page and a bad page", () => {
  const withChecks = Object.keys(ARCHETYPE_CHECKS);
  for (const archetype of withChecks) {
    const pages = Object.entries(PAGES).filter(([, [a]]) => a === archetype).map(([name]) => name);
    assert.ok(pages.some((n) => n.endsWith("-good")), `${archetype} has a good page`);
    assert.ok(pages.some((n) => n.includes("-bad")), `${archetype} has a bad page`);
  }
  // Every check in every table appears in the expectations, so a new check can't ship untested.
  for (const [archetype, checks] of Object.entries(ARCHETYPE_CHECKS)) {
    const covered = new Set(Object.entries(PAGES).filter(([, [a]]) => a === archetype).flatMap(([, [, expected]]) => Object.keys(expected)));
    for (const check of [...COMMON, ...checks]) assert.ok(covered.has(check.name), `${archetype}: ${check.name} is exercised`);
  }
  assert.ok(ARCHETYPES.every((a) => a === "chart" || withChecks.includes(a)), "every archetype but chart has checks");
});

test("a check that throws reports an error, never a pass or a fail", { skip }, async () => {
  const boom = { name: "boom", criteria: ["2.1.1"], run: async () => { throw new Error("something broke\nwith a stack"); } };
  const result = await runCheck(session.browser, `${server.origin}/button-good.html`, boom);
  assert.deepEqual([result.name, result.result], ["boom", "error"]);
  assert.match(result.detail, /The check couldn't finish: something broke/);
  assert.doesNotMatch(result.detail, /stack/);
});

test("a check that hangs times out as an error", { skip }, async () => {
  const hang = { name: "hang", criteria: [], run: () => new Promise(() => {}) };
  const result = await runCheck(session.browser, `${server.origin}/button-good.html`, hang, { timeoutMs: 400 });
  assert.equal(result.result, "error");
  assert.match(result.detail, /took longer than 0\.4 seconds/);
});

test("a page that is missing, or has no trigger, makes the check error rather than throw", { skip }, async () => {
  const missing = await runCheck(session.browser, `${server.origin}/nope.html`, COMMON[0]);
  assert.equal(missing.result, "error");
  assert.match(missing.detail, /HTTP 404/);
  const noTrigger = await runCheck(session.browser, `${server.origin}/no-trigger.html`, COMMON[0], { timeoutMs: 8000 });
  assert.equal(noTrigger.result, "error");
});

test("the chart archetype has no interaction checks", { skip }, async () => {
  const result = await runInteractions(session.browser, `${server.origin}/button-good.html`, "chart");
  assert.equal(result.status, "not-applicable");
  assert.match(result.reason, /chart/);
});

test("the focus indicator check says which method found the change", { skip }, async () => {
  const good = await runInteractions(session.browser, `${server.origin}/button-good.html`, "button");
  assert.equal(good.checks.find((c) => c.name === "focus-indicator-visible").method, "computed-style");
  const bad = await runInteractions(session.browser, `${server.origin}/button-bad.html`, "button");
  const focus = bad.checks.find((c) => c.name === "focus-indicator-visible");
  assert.equal(focus.result, "fail");
  assert.equal(focus.method, "screenshot");
  assert.match(focus.detail, /computed styles first, then a screenshot/);
});

test("focus indicator: only changes a person could see count", async () => {
  const { focusIndicatorChanges } = await import("../src/tiers/interactions/focus-indicator.js");
  const base = { outlineStyle: "none", outlineWidth: "0px", outlineColor: "rgb(0, 0, 0)", boxShadow: "none", borderTopStyle: "none", borderTopColor: "rgb(0, 0, 0)", borderTopWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)", color: "rgb(0, 0, 0)", textDecorationLine: "none", rendered: true };
  const parts = (over, extra = {}) => ({ "the element": { ...base, ...over }, ...extra });
  assert.deepEqual(focusIndicatorChanges(parts({}), parts({})), []);
  assert.deepEqual(focusIndicatorChanges(parts({ outlineStyle: "solid", outlineWidth: "2px" }), parts({})), ["the element: outline"]);
  // An outline offset alone, or an outline with no width or no color, shows nothing.
  assert.deepEqual(focusIndicatorChanges(parts({ outlineWidth: "2px" }), parts({})), []);
  assert.deepEqual(focusIndicatorChanges(parts({ outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgba(0, 0, 0, 0)" }), parts({})), []);
  assert.deepEqual(focusIndicatorChanges(parts({ boxShadow: "rgb(0, 0, 255) 0px 0px 0px 3px" }), parts({})), ["the element: box-shadow"]);
  assert.deepEqual(focusIndicatorChanges(parts({ backgroundColor: "rgb(200, 200, 200)" }), parts({})), ["the element: background color"]);
  // A ring drawn on a child or a pseudo-element counts, and so does an element that appears inside.
  const ring = { ...base, boxShadow: "rgb(0, 0, 255) 0px 0px 0px 3px" };
  assert.deepEqual(focusIndicatorChanges(parts({}, { "its ::after": ring }), parts({}, { "its ::after": base })), ["its ::after: box-shadow"]);
  assert.deepEqual(focusIndicatorChanges(parts({}, { "inner element 1 (span)": base }), parts({})), ["inner element 1 (span): appeared on focus"]);
  assert.deepEqual(focusIndicatorChanges(parts({}, { "inner element 1 (span)": { ...base, rendered: false } }), parts({})), []);
  // A ripple that stays in the page but only renders while focused.
  assert.deepEqual(focusIndicatorChanges(parts({}, { "inner element 3 (span)": base }), parts({}, { "inner element 3 (span)": { ...base, rendered: false } })), ["inner element 3 (span): appeared on focus"]);
});
