import { runAxe } from "./axe.js";
import { runIbm } from "./ibm.js";

const RUNNERS = { axe: runAxe, ibm: runIbm };

/**
 * Run each chosen engine against the page. Engines report separately, and one failing engine doesn't stop the other.
 * @param {import("playwright-core").Page} page
 * @param {{ engines: string[], wcag: string, level: string, maxNodes?: number, scope?: string | string[] | null }} options
 */
export async function runRules(page, { engines, wcag, level, maxNodes = 5, scope = null }) {
  /** @type {Record<string, any>} */
  const results = {};
  for (const engine of engines) {
    try {
      results[engine] = await RUNNERS[/** @type {keyof typeof RUNNERS} */ (engine)](page, { wcag, level, maxNodes, scope });
    } catch (error) {
      results[engine] = { status: "failed", reason: error instanceof Error ? error.message.split("\n")[0] : String(error) };
    }
  }
  const statuses = Object.values(results).map((r) => r.status);
  return {
    status: statuses.includes("ran") ? "ran" : "failed",
    reason: statuses.includes("ran") ? null : "Every rule engine failed.",
    engines: results,
  };
}

const SELF_TEST_HTML = `<!doctype html><html lang="en"><head><title>Self-test</title></head><body><main><h1>Self-test</h1>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<p style="color:#ccc;background:#fff">Low contrast text</p></main></body></html>`;

const EXPECTED = {
  axe: ["image-alt", "color-contrast"],
  ibm: ["img_alt_valid", "text_contrast_sufficient"],
};

/**
 * Audit a page with known problems and check that every chosen engine flags them.
 * A run that can't pass this must not report a clean result.
 * @param {import("playwright-core").Browser} browser
 * @param {string[]} engines
 * @param {Function} [run] Swap in a stand-in to test the failure path.
 */
export async function selfTest(browser, engines, run = runRules) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(SELF_TEST_HTML);
    const result = await run(page, { engines, wcag: "2.2", level: "AA", maxNodes: 1 });
    const problems = [];
    for (const engine of engines) {
      const engineResult = result.engines[engine];
      if (engineResult.status !== "ran") {
        problems.push(`${engine}: ${engineResult.reason}`);
        continue;
      }
      const found = new Set(engineResult.violations.map((v) => v.ruleId));
      const missing = EXPECTED[/** @type {keyof typeof EXPECTED} */ (engine)].filter((id) => !found.has(id));
      if (missing.length) problems.push(`${engine} missed ${missing.join(", ")}`);
    }
    return { passed: problems.length === 0, problems };
  } finally {
    await context.close();
  }
}
