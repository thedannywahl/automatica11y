import { findBrowser } from "../env/browser.js";

export const VIEWPORT = { width: 1280, height: 800 };

/**
 * Launch the browser we found. Playwright loads here and nowhere else, so commands that never launch a browser never pay for it.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform }} [options]
 */
export async function launchBrowser({ env, platform } = {}) {
  const { browser: found, problem } = await findBrowser({ env, platform });
  if (!found) throw new Error(problem?.message ?? "No browser found.");
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("playwright-core isn't installed. Run: npm install playwright-core");
  }
  const browser = await chromium.launch({ executablePath: found.path, args: process.env.CI ? ["--no-sandbox"] : [] });
  return { browser, found, version: browser.version() };
}
