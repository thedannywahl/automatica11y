import { installMeasure } from "../computed/measure-kit.js";
import { installHelpers } from "../interactions/helpers.js";
import { runCheck } from "../interactions/index.js";
import { conditionChecksFor } from "./checks.js";
import { installConditions } from "./kit.js";

/** These checks open each page twice, and sometimes press keys, so they get longer than the others. */
const TIMEOUT_MS = 60_000;

/**
 * Run the conditions checks against a fixture page or a whole page. Each check opens its own fresh pages.
 * A check that can't finish reports `error`, and one that can't reduce the page to colors reports `undetermined`.
 * Neither counts as a pass.
 * @param {import("playwright-core").Browser} browser
 * @param {string} url
 * @param {string} archetype An archetype name for a fixture, or "page" for a whole page.
 */
export async function runConditions(browser, url, archetype) {
  const results = [];
  for (const check of conditionChecksFor(archetype)) {
    results.push(await runCheck(browser, url, check, { kits: [installHelpers, installMeasure, installConditions], needsTrigger: archetype !== "page", timeoutMs: TIMEOUT_MS, waitUntil: archetype === "page" ? "networkidle" : "load" }));
  }
  return { status: "ran", checks: results };
}

/** What a Storybook target says about this tier. */
export const CONDITIONS_NOT_APPLICABLE_FOR_STORIES = {
  status: "not-applicable",
  reason: "Conditions checks open the whole page again with other settings. Storybook stories are audited inside their own frame, so this version doesn't run them.",
};
