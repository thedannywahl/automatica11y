import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { settleAnimations } from "../src/harness/settle.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @type {any} */
let session;
before(async () => {
  if (!skip) session = await launchBrowser();
});
after(async () => {
  await session?.browser.close();
});

const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>t</title>
<style>
#fade { opacity: 0; transition: opacity 600ms linear; }
#fade.on { opacity: 1; }
#spin { width: 10px; height: 10px; background: #000; animation: turn 1s linear infinite; }
@keyframes turn { to { transform: rotate(360deg); } }
</style>
<div id="fade">Saved.</div><div id="spin"></div>
<script>setTimeout(() => document.getElementById('fade').classList.add('on'), 50);</script>`)}`;

test("a state is scanned after its fade finishes, and an endless animation doesn't hold it up", { skip, timeout: 30_000 }, async () => {
  const page = await session.browser.newPage();
  await page.goto(PAGE);
  await page.waitForTimeout(100);
  const midway = await page.evaluate(() => Number(getComputedStyle(document.getElementById("fade")).opacity));
  assert.ok(midway < 1, `the page starts mid-fade (opacity ${midway})`);
  const started = Date.now();
  await settleAnimations(page);
  assert.equal(await page.evaluate(() => Number(getComputedStyle(document.getElementById("fade")).opacity)), 1);
  assert.ok(Date.now() - started < 1900, "the infinite spinner didn't make it wait for the full limit");
  await page.close();
});
