import { renderComparison } from "./comparison.js";
import { renderSingleReport } from "./single.js";
import { code } from "./parts.js";

/**
 * Render report.md. A comparison of two or more targets gets the side-by-side report. Anything else gets the single report.
 * @param {{ plan: ReturnType<typeof import("../schema.js").parsePlan>, results: ReturnType<typeof import("../schema.js").parseResults> }} input
 */
export function renderReport(input) {
  const report = input.plan.command === "compare" && input.results.targets.length > 1 ? renderComparison(input) : renderSingleReport(input);
  const outcome = input.results.outcome;
  if (!outcome || (!input.plan.options.fail && !Object.values(input.plan.options.policy).some(Boolean))) return report;
  const lines = ["## CI outcome.", "", `Configured policy outcome: **${outcome.status}**. This is a CI gate, not an accessibility assessment.`, ""];
  for (const { title, reasons } of [{ title: "Coverage gaps", reasons: outcome.coverage }, { title: "Needs review", reasons: outcome.review }, { title: "Non-rule check failures", reasons: outcome.checks }]) {
    lines.push(`### ${title}.`, "", ...(reasons.length ? reasons.map((reason) => `- ${code(reason.replace(/[\r\n]/g, " "))}`) : ["None recorded."]), "");
  }
  return report + "\n" + lines.join("\n");
}
