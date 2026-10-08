import { FINDINGS_NOTE, coverageMatrix, finish, failCheckSection, notTestableLines, reportFooter, reportHeader, targetSection } from "./parts.js";

/**
 * Render report.md for an audit. The text comes from results.json and nothing else.
 * @param {{ plan: any, results: any }} input
 */
export function renderSingleReport({ plan, results }) {
  const lines = reportHeader(plan, results, "Accessibility report.");
  lines.push("## Coverage.", "", coverageMatrix(plan, results), "");
  lines.push("A gap, a failed engine, or a target that wasn't testable is a finding. It never counts as a pass.", "");
  lines.push(...notTestableLines(results));
  lines.push("## Findings.", "", FINDINGS_NOTE, "");
  for (const target of results.targets) lines.push(targetSection(plan.targets.find((t) => t.id === target.id), target));
  lines.push(...reportFooter(results));
  return finish(lines);
}
