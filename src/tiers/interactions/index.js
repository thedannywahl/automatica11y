import { VIEWPORT } from "../../harness/browser.js";
import { openPage } from "../../harness/url.js";
import { settleAnimations } from "../../harness/settle.js";
import { mapPool } from "../../run/pool.js";
import { ARCHETYPE_CHECKS, COMMON } from "./archetypes.js";
import { installHelpers } from "./helpers.js";

const CHECK_TIMEOUT_MS = 25_000;
/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Everything a check can do, bound to one fresh page.
 * fastFixture is only for reviewed repository fixtures. Explicit observation windows always retain their duration.
 * @param {import("../../types.js").Page} page
 * @param {{ fastFixture?: boolean }} [options]
 * @returns {import("../../types.js").CheckContext}
 */
export function makeContext(page, { fastFixture = false } = {}) {
  /** @type {import("../../types.js").CheckContext} */
  const ctx = {
    page,
    trigger: page.locator("[data-a11y-trigger]").first(),
    snap: () => page.evaluate(() => window.__a11y.snapshot()),
    items: (selector) => page.evaluate((s) => window.__a11y.items(s), selector),
    async settle(ms = 60) {
      if (fastFixture) {
        await settleAnimations(page, { finishFinite: true });
        return;
      }
      await ctx.observe(ms);
    },
    async observe(ms) {
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await sleep(ms);
    },
    async press(key) {
      await page.keyboard.press(key);
      await ctx.settle();
    },
    async focus() {
      await ctx.trigger.focus();
      await ctx.settle();
    },
    /** Poll the snapshot until `predicate` holds. Returns that snapshot, or null on timeout. */
    async waitFor(predicate, ms = 1000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const s = await ctx.snap();
        if (predicate(s)) return s;
        if (Date.now() > deadline) return null;
        await sleep(50);
      }
    },
    /** Press Tab from the top of the page until focus lands on the trigger. Returns the presses, or null. */
    async tabToTrigger(max = 12) {
      await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur?.());
      for (let presses = 1; presses <= max; presses += 1) {
        await page.keyboard.press("Tab");
        await ctx.settle(30);
        if ((await ctx.snap()).activeIsTrigger) return presses;
      }
      return null;
    },
    async openCombo() {
      await ctx.focus();
      await ctx.press("ArrowDown");
      for (let i = 0; i < 16; i += 1) {
        const s = await ctx.snap();
        if (s.expanded === "true" || (await ctx.items('[role="option"]')).some((o) => o.visible)) return true;
        await sleep(50);
      }
      return false;
    },
    /** A screenshot region around an element, kept inside the viewport. */
    clipAround(box, margin = 8) {
      const x = Math.max(0, Math.floor(box.x - margin));
      const y = Math.max(0, Math.floor(box.y - margin));
      return { x, y, width: Math.max(1, Math.min(VIEWPORT.width - x, Math.ceil(box.width + margin * 2))), height: Math.max(1, Math.min(VIEWPORT.height - y, Math.ceil(box.height + margin * 2))) };
    },
  };
  return ctx;
}

/**
 * Run one check on a fresh page, so no check inherits another's state.
 * @param {import("../../types.js").Browser} browser
 * @param {string} url
 * @param {import("../../types.js").Check} check
 * @param {{ timeoutMs?: number, kits?: Array<() => void>, needsTrigger?: boolean, waitUntil?: "load" | "networkidle", fastFixture?: boolean }} [options]
 * @returns {Promise<import("../../types.js").CheckResult>}
 */
export async function runCheck(browser, url, check, { timeoutMs = CHECK_TIMEOUT_MS, kits = [installHelpers], needsTrigger = true, waitUntil = /** @type {"load" | "networkidle"} */ ("load"), fastFixture = false } = {}) {
  /** @type {Awaited<ReturnType<typeof openPage>> | null} */
  let opened = null;
  /** @type {Array<Awaited<ReturnType<typeof openPage>>>} */
  const variants = [];
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  let finished = false;
  /** @param {import("../../types.js").Page} page */
  const beforeGoto = async (page) => { for (const kit of kits) await page.addInitScript(kit); };
  try {
    opened = await openPage(browser, url, { beforeGoto, waitUntil });
    const ctx = makeContext(opened.page, { fastFixture });
    /**
     * Open the same page again with other browser settings (reduced motion, dark mode, a narrow window), and get a context for it.
     * It closes with the check.
     */
    ctx.variant = async (options) => {
      if (finished) throw new Error("The check finished before its variant could open.");
      const other = await openPage(browser, url, { ...options, beforeGoto, waitUntil });
      if (finished) {
        await other.close();
        throw new Error("The check finished while its variant was opening.");
      }
      variants.push(other);
      return makeContext(other.page, { fastFixture });
    };
    if (needsTrigger) await ctx.trigger.waitFor({ state: "attached", timeout: 3000 });
    const outcome = await Promise.race([
      check.run(ctx),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`The check took longer than ${timeoutMs / 1000} seconds.`)), timeoutMs); }),
    ]);
    return { name: check.name, criteria: check.criteria, ...outcome };
  } catch (error) {
    return { name: check.name, criteria: check.criteria, result: "error", detail: `The check couldn't finish: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}` };
  } finally {
    finished = true;
    clearTimeout(timeout);
    await opened?.close();
    for (const other of variants) await other.close();
  }
}

/**
 * Run the interaction checks for one archetype against its fixture page.
 * Each check gets a fresh page. A check that can't finish reports `error`, which counts as a gap, never as a pass.
 * @param {import("playwright-core").Browser} browser
 * @param {string} url
 * @param {string} archetype
 * @param {{ fastFixture?: boolean, interactionConcurrency?: number }} [options]
 */
export async function runInteractions(browser, url, archetype, { fastFixture = false, interactionConcurrency = 1 } = {}) {
  if (![1, 2].includes(interactionConcurrency)) throw new Error("interactionConcurrency must be 1 or 2.");
  if (archetype === "chart") return { status: "not-applicable", reason: "No interaction checks are defined for the chart archetype." };
  const checks = [...COMMON, ...(ARCHETYPE_CHECKS[archetype] ?? [])];
  const results = await mapPool(checks, interactionConcurrency, (check) => runCheck(browser, url, check, { fastFixture }));
  return { status: "ran", checks: results };
}

/** What a page or Storybook target says about this tier. */
export const NOT_APPLICABLE_FOR_PAGES = {
  status: "not-applicable",
  reason: "Interaction checks need an archetype fixture with trigger and root hooks. Page and Storybook targets don't have them.",
};
