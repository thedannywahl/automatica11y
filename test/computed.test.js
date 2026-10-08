import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { composite, contrastOver, contrastRatio, formatRatio, textThreshold } from "../src/tiers/computed/color.js";
import { runComputed } from "../src/tiers/computed/index.js";

const dir = new URL("./fixtures/computed/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @type {any} */
let session;
/** @type {any} */
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
const U = "undetermined";

/** One page per row: the archetype, then the result of text contrast, boundary contrast, and focus indicator contrast. */
/** @type {Record<string, [string, string, string, string]>} */
const PAGES = {
  good: ["button", P, P, P],
  "text-low": ["button", F, P, P],
  "hover-low": ["button", F, P, P],
  "focus-weak": ["button", P, P, F],
  "focus-none": ["button", P, P, N],
  "focus-ring-child": ["button", P, P, P],
  "focus-tint-child": ["button", P, P, F],
  gradient: ["button", U, U, P],
  "label-pale-border": ["button", P, N, P],
  "field-good": ["form-field", N, P, P],
  "field-weak": ["form-field", N, F, P],
  "icon-good": ["button", N, P, P],
  "icon-weak": ["button", N, F, P],
};

for (const [page, [archetype, text, boundary, focus]] of Object.entries(PAGES)) {
  test(`${page}: each computed check gives its known result`, { skip, timeout: 120_000 }, async () => {
    const result = await runComputed(session.browser, `${server.origin}/${page}.html`, archetype);
    assert.equal(result.status, "ran");
    const actual = Object.fromEntries(result.checks.map((c) => [c.name, c.result]));
    assert.deepEqual(actual, { "text-contrast-by-state": text, "boundary-contrast": boundary, "focus-indicator-contrast": focus }, JSON.stringify(result.checks.map((c) => `${c.name}: ${c.detail}`), null, 1));
    for (const check of result.checks) {
      assert.ok(check.detail.length > 10, `${check.name} explains itself`);
      assert.ok(check.criteria.length > 0, `${check.name} names its WCAG criteria`);
    }
  });
}

/** Live-region pages: the computed tier measures the message that appears, not the trigger. */
/** @type {Record<string, string>} */
const MESSAGES = {
  "message-good": "pass",
  "message-low": "fail",
  "message-visually-hidden-copy": "pass",
  "message-gradient": "undetermined",
  "message-shadow-slot": "pass",
};
for (const [page, expected] of Object.entries(MESSAGES)) {
  test(`${page}: the message's text contrast is ${expected}`, { skip, timeout: 60_000 }, async () => {
    const result = await runComputed(session.browser, `${server.origin}/${page}.html`, "live-region");
    assert.deepEqual(result.checks.map((c) => c.name), ["message-text-contrast"]);
    assert.equal(result.checks[0].result, expected, result.checks[0].detail);
  });
}

test("a state-dependent failure names the state that failed", { skip, timeout: 60_000 }, async () => {
  const result = await runComputed(session.browser, `${server.origin}/hover-low.html`, "button");
  const text = result.checks.find((c) => c.name === "text-contrast-by-state");
  assert.match(text.detail, /In hover, "Save" has \d/);
  assert.deepEqual([...new Set(text.measurements.map((m) => m.state))], ["rest", "hover", "keyboard focus", "pressed"]);
});

test("the focus check says how it measured: styles for a ring on the control, pixels for anything else", { skip, timeout: 60_000 }, async () => {
  const method = async (page) => (await runComputed(session.browser, `${server.origin}/${page}.html`, "button")).checks.find((c) => c.name === "focus-indicator-contrast").method;
  assert.equal(await method("good"), "computed-style");
  assert.equal(await method("focus-ring-child"), "pixels");
});

test("the chart archetype has no trigger to measure", async () => {
  assert.equal((await runComputed(null, "http://x/", "chart")).status, "not-applicable");
});

test("contrast math follows WCAG", () => {
  assert.equal(formatRatio(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])), "21:1");
  assert.equal(formatRatio(contrastRatio([119, 119, 119, 1], [255, 255, 255, 1])), "4.47:1");
  assert.equal(formatRatio(2.999), "2.99:1", "a ratio just under the threshold never rounds up to it");
  assert.deepEqual(composite([0, 0, 0, 0.5], [255, 255, 255, 1]).map(Math.round), [128, 128, 128, 1]);
  assert.ok(contrastOver([0, 0, 0, 0.5], [255, 255, 255, 1]) < 4);
  assert.equal(textThreshold(16, "400"), 4.5);
  assert.equal(textThreshold(24, "400"), 3);
  assert.equal(textThreshold(19, "700"), 3);
  assert.equal(textThreshold(19, "400"), 4.5);
});
