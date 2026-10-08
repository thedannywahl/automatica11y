import { installHelpers } from "../interactions/helpers.js";
import { runCheck } from "../interactions/index.js";
import { COMPUTED_CHECKS } from "./checks.js";
import { installMeasure } from "./measure-kit.js";

/**
 * Run the computed checks for one archetype against its fixture page. Each check gets a fresh page.
 * A check that can't finish reports `error`, and one that can't reduce the page to colors reports `undetermined`.
 * Neither counts as a pass.
 * @param {import("playwright-core").Browser} browser
 * @param {string} url
 * @param {string} archetype
 */
export async function runComputed(browser, url, archetype) {
  if (archetype === "chart") return { status: "not-applicable", reason: "The chart archetype has no trigger to measure." };
  const results = [];
  for (const check of COMPUTED_CHECKS) results.push(await runCheck(browser, url, check, { kits: [installHelpers, installMeasure] }));
  return { status: "ran", checks: results };
}

/** What a page or Storybook target says about this tier. */
export const COMPUTED_NOT_APPLICABLE_FOR_PAGES = {
  status: "not-applicable",
  reason: "Computed checks need an archetype fixture with a trigger hook. Page and Storybook targets don't have one.",
};
