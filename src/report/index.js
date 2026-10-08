import { renderComparison } from "./comparison.js";
import { renderSingleReport } from "./single.js";

/**
 * Render report.md. A comparison of two or more targets gets the side-by-side report. Anything else gets the single report.
 * @param {{ plan: any, results: any }} input
 */
export function renderReport(input) {
  return input.plan.command === "compare" && input.results.targets.length > 1 ? renderComparison(input) : renderSingleReport(input);
}
