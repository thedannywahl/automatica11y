import { VIEWPORT } from "./browser.js";
import { recordClosedShadowRoots, recordCustomElements } from "./shadow.js";

const NETWORK_IDLE_MS = 30_000;

/**
 * Open a page in its own browser context and wait for the network to go quiet.
 * The returned `warnings` hold anything the report should mention, such as a network that never went idle.
 * @param {import("playwright-core").Browser} browser
 * @param {string} url
 * @param {{ viewport?: { width: number, height: number }, forcedColors?: boolean, beforeGoto?: (page: import("playwright-core").Page) => void, waitUntil?: "load" | "networkidle" }} [options]
 *   `beforeGoto` runs before navigation, so a caller can attach console listeners that see the first messages.
 *   `waitUntil` defaults to `networkidle`. Local fixture pages don't need to wait for the network.
 */
export async function openPage(browser, url, { viewport = VIEWPORT, forcedColors = false, beforeGoto, waitUntil = "networkidle" } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, forcedColors: forcedColors ? "active" : "none" });
  await context.addInitScript(recordClosedShadowRoots);
  await context.addInitScript(recordCustomElements);
  /** @type {string[]} */
  const warnings = [];
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    beforeGoto?.(page);
    let response;
    try {
      response = await page.goto(url, { waitUntil, timeout: NETWORK_IDLE_MS });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError" && page.url() !== "about:blank") {
        warnings.push(`The network never went idle within ${NETWORK_IDLE_MS / 1000} seconds. The page was checked as it stood.`);
      } else {
        throw error;
      }
    }
    if (response && response.status() >= 400) throw new Error(`The page responded with HTTP ${response.status()}.`);
    return { context, page, warnings, close: () => context.close().catch(() => {}) };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
