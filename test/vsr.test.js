import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { serveStatic } from "../src/harness/static-serve.js";
import { openPage } from "../src/harness/url.js";
import { parseResults } from "../src/schema.js";
import { flagPhrases, repeatLength, runVsr } from "../src/tiers/vsr.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

test("flagPhrases marks a bare role and a generic role, and nothing else", () => {
  const phrases = ["document", "main", "heading, Title, level 1", "button", "button, Save", "link", "image", "image, Logo", "textbox", "textbox, Name", "generic", "clickable div", "dialog", "dialog, Edit", "end of main"];
  assert.deepEqual(
    flagPhrases(phrases).map((f) => [f.type, f.phrase, f.index]),
    [["unnamed-control", "button", 3], ["unnamed-control", "link", 5], ["unnamed-control", "image", 6], ["unnamed-control", "textbox", 8], ["generic-role", "generic", 10], ["unnamed-control", "dialog", 12]],
  );
  assert.deepEqual(flagPhrases(["Button", " LINK "]).map((f) => f.phrase), ["Button", " LINK "]);
  assert.deepEqual(flagPhrases([]), []);
});

test("repeatLength finds where a wrapped walk starts over", () => {
  assert.equal(repeatLength(["a", "b", "c"]), 0, "no repeat yet");
  assert.equal(repeatLength(["a", "b", "a", "b"]), 0, "needs one phrase past a full repeat");
  assert.equal(repeatLength(["a", "b", "a", "b", "a"]), 2);
  assert.equal(repeatLength(["x", "x", "x"]), 1);
  assert.equal(repeatLength(["dialog", "dialog", "h", "p", "dialog", "h", "p", "dialog", "h"]), 4, "a stray first phrase doesn't hide the repeat");
  const long = Array.from({ length: 40 }, (_, i) => `p${i}`);
  assert.equal(repeatLength(long), 0, "a long document with no repeat is left alone");
});

/** @type {Awaited<ReturnType<typeof launchBrowser>> | undefined} */
let session;
/** @type {Awaited<ReturnType<typeof serveStatic>> | undefined} */
let server;
before(async () => {
  if (skip) return;
  session = await launchBrowser();
  server = await serveStatic(fixtures);
});
after(async () => {
  await session?.browser.close();
  await server?.close();
});

async function walk(path, options) {
  const opened = await openPage(session.browser, `${server.origin}/${path}`, { waitUntil: "load" });
  try {
    return await runVsr(opened.page, options);
  } finally {
    await opened.close();
  }
}

test("a clean page: the log reaches the end, the result says simulated, and nothing is flagged", { skip }, async () => {
  const result = await walk("clean.html");
  assert.equal(result.status, "ran");
  assert.equal(result.simulated, true);
  assert.match(result.version, /^\d+\.\d+\.\d+/);
  const [entry] = result.log;
  assert.equal(entry.reachedEnd, true);
  assert.equal(entry.truncated, false);
  assert.equal(entry.announcements[0], "document");
  assert.equal(entry.announcements.at(-1), "end of document");
  assert.ok(entry.announcements.includes("heading, Clean page, level 1"));
  assert.ok(entry.announcements.includes("textbox, Name"));
  assert.ok(entry.announcements.includes("button, Save"));
  assert.deepEqual(result.flags, []);
  assert.deepEqual(result.notTestable, []);
});

test("a control with no name is announced as only its role, and gets flagged", { skip }, async () => {
  const label = await walk("missing-label.html");
  assert.deepEqual(label.flags.map((f) => [f.type, f.phrase]), [["unnamed-control", "textbox"]]);
  const alt = await walk("missing-alt.html");
  assert.deepEqual(alt.flags.map((f) => [f.type, f.phrase]), [["unnamed-control", "image"]]);
});

test("a container that isn't the whole document wraps around, and the walk stops when it does", { skip }, async () => {
  const opened = await openPage(session.browser, `${server.origin}/clean.html`, { waitUntil: "load" });
  try {
    const result = await runVsr(opened.page, { scope: "main" });
    const [entry] = result.log;
    assert.equal(entry.reachedEnd, true);
    assert.equal(entry.announcements[0], "main");
    assert.equal(entry.announcements.at(-1), "end of main");
    assert.ok(entry.announcements.length < 40, "the walk didn't run to the cap");
  } finally {
    await opened.close();
  }
});

test("a long page is cut at the step cap, and the result says so", { skip }, async () => {
  const cwd = makeTree({ "long.html": `<!doctype html><html lang="en"><head><title>Long</title></head><body><main><h1>Long</h1><ul>${Array.from({ length: 120 }, (_, i) => `<li>Item ${i}</li>`).join("")}</ul></main></body></html>` });
  const long = await serveStatic(cwd);
  try {
    const opened = await openPage(session.browser, `${long.origin}/long.html`, { waitUntil: "load" });
    const result = await runVsr(opened.page, { maxSteps: 60 });
    await opened.close();
    const [entry] = result.log;
    assert.equal(entry.truncated, true);
    assert.equal(entry.reachedEnd, false);
    assert.ok(entry.announcements.length <= 61);
    assert.match(result.notes[0], /stopped after 60 steps/);
  } finally {
    await long.close();
  }
});

test("content inside an open shadow root isn't read, and the result says so", { skip }, async () => {
  const cwd = makeTree({
    "shadow.html": `<!doctype html><html lang="en"><head><title>Shadow</title></head><body><main><h1>Shadow</h1><x-box></x-box></main>
<script>customElements.define("x-box", class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML = '<button></button><p>Inside</p>'; } }); </script></body></html>`,
  });
  const shadow = await serveStatic(cwd);
  try {
    const opened = await openPage(session.browser, `${shadow.origin}/shadow.html`, { waitUntil: "load" });
    const result = await runVsr(opened.page);
    await opened.close();
    assert.deepEqual(result.notTestable, ["open shadow root in <x-box> (1): the virtual screen reader doesn't read inside it"]);
    assert.ok(!result.log[0].announcements.some((p) => p.includes("Inside")), "the shadow text isn't in the log");
    assert.deepEqual(result.flags, [], "the unnamed button inside the shadow root can't be flagged, because it isn't read");
  } finally {
    await shadow.close();
  }
});

async function audit(args, cwd = makeTree()) {
  const { io, out } = makeIo({ cwd, env: process.env });
  const code = await main(args, io);
  const read = (file) => parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", file), "utf8")));
  return { code, results: read("results.json"), report: readFileSync(join(cwd, "a11y-report", "report.md"), "utf8"), ...out };
}

test("audit: the tier shows in the results, the matrix, and the report", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}missing-label.html`]);
  const vsr = run.results.targets[0].archetypes.page.configs[0].tiers.vsr;
  assert.equal(vsr.status, "ran");
  assert.equal(vsr.simulated, true);
  assert.equal(run.results.targets[0].summary.vsr.flagged, 1);
  assert.match(run.report, /#### Virtual screen reader \(simulated\)\./);
  assert.match(run.report, /It isn't a real screen reader/);
  assert.match(run.report, /- `textbox` at position 5: announced as only its role, with no name\./);
  assert.match(run.report, /```text\ndocument\nmain/);
  assert.match(run.report, /\| missing-label\.html \|[^\n]*ran \(simulated\), one flagged \|/);
});

test("audit: a Storybook walks each story inside its root, and the report groups the flags", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}storybook-static`]);
  const target = run.results.targets[0];
  const phrases = (id) => target.archetypes[`story:${id}`].configs[0].tiers.vsr.log[0].announcements;
  assert.deepEqual(phrases("button--primary"), ["button, Save"]);
  assert.deepEqual(phrases("button--icon-only"), ["button"]);
  assert.equal(target.archetypes["story:dialog-modal--open"].configs[0].tiers.vsr.log[0].reachedEnd, true);
  assert.deepEqual(target.summary.vsr, { walks: 6, flagged: 2 });
  assert.match(run.report, /\| `button` \| announced as only its role, with no name \| 1 \| button--icon-only \|/);
});

test("audit: --tiers without vsr leaves the tier out", { skip }, async () => {
  const run = await audit(["audit", `${fixtures}clean.html`, "--tiers", "rules"]);
  assert.equal(run.results.targets[0].archetypes.page.configs[0].tiers.vsr, undefined);
  assert.equal(run.results.targets[0].summary.vsr, undefined);
});
