import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { findBrowser } from "../src/env/browser.js";
import { launchBrowser } from "../src/harness/browser.js";
import { settleAnimations } from "../src/harness/settle.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** @type {Awaited<ReturnType<typeof launchBrowser>> | undefined} */
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

test("fast settling finishes transitions and delivers completion events without stopping timers", { skip }, async () => {
  const page = await session.browser.newPage();
  try {
    await page.setContent('<style>#fade { opacity: 0; transition: opacity 30s linear; } #fade.on { opacity: 1; }</style><div id="fade">Saved</div>');
    await page.evaluate(() => {
      const fade = document.querySelector("#fade");
      fade.addEventListener("transitionend", () => fade.setAttribute("data-completed", "true"));
      getComputedStyle(fade).opacity;
      fade.classList.add("on");
      setTimeout(() => fade.setAttribute("data-timer", "true"), 100);
    });
    await settleAnimations(page, { finishFinite: true });
    assert.equal(await page.locator("#fade").evaluate((element) => getComputedStyle(element).opacity), "1");
    await page.waitForFunction(() => document.querySelector("#fade").getAttribute("data-completed") === "true");
    await page.waitForFunction(() => document.querySelector("#fade").getAttribute("data-timer") === "true");
  } finally {
    await page.close();
  }
});

test("fast settling finishes filled animations and leaves infinite animations running", { skip }, async () => {
  const page = await session.browser.newPage();
  try {
    await page.setContent('<div id="finite">Finite</div><div id="infinite">Infinite</div>');
    await page.evaluate(() => {
      const finite = document.querySelector("#finite");
      const animation = finite.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 30_000, fill: "forwards" });
      animation.addEventListener("finish", () => finite.setAttribute("data-completed", "true"));
      document.querySelector("#infinite").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, iterations: Infinity });
    });
    await settleAnimations(page, { finishFinite: true });
    assert.equal(await page.locator("#finite").getAttribute("data-completed"), "true");
    assert.deepEqual(await page.evaluate(() => document.getAnimations().map((animation) => animation.playState).sort()), ["finished", "running"]);
  } finally {
    await page.close();
  }
});

test("fast settling bounds its fallback when an animation cannot finish", { skip }, async () => {
  const page = await session.browser.newPage();
  try {
    await page.setContent('<div id="paused">Paused</div>');
    await page.evaluate(() => {
      const animation = document.querySelector("#paused").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 30_000 });
      animation.playbackRate = 0;
    });
    await settleAnimations(page, { finishFinite: true, maxWaitMs: 50 });
    assert.equal(await page.evaluate(() => document.getAnimations()[0].playbackRate), 0);
    assert.notEqual(await page.evaluate(() => document.getAnimations()[0].playState), "finished");
  } finally {
    await page.close();
  }
});
