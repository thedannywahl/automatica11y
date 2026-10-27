import { cell, code, targetSection, reportHeader, reportFooter, FINDINGS_NOTE, finish } from "./parts.js";

/**
 * @param {{ plan: import("../types.js").Plan, results: import("../types.js").Results }} input
 */
export function renderSite({ plan, results }) {
  const discovery = results.discovery;
  const lines = reportHeader(plan, results, "Site accessibility report.");
  lines.push("## Discovery.", "", `Root: ${code(discovery.root)}. Scope: ${code(discovery.scope)}.`, "",
    `Crawlee request limit: ${plan.options.discovery.maxPages}; depth: ${plan.options.discovery.maxDepth}; same-domain delay: ${plan.options.discovery.delay}s. Robots: ${plan.options.discovery.ignoreRobots ? "explicitly ignored" : "respected"}.`, "",
    "Native Crawlee statistics describe request processing, not accessibility passes. Retries, sitemap fetching, subresources, and secondary audit navigations are not additional unique queued pages.", "",
    "| Native metric | Value |", "| --- | --- |");
  for (const [key, value] of Object.entries(discovery.statistics)) lines.push(`| ${code(key)} | ${code(JSON.stringify(value))} |`);
  for (const [key, value] of Object.entries(discovery.queue)) lines.push(`| ${code(key)} | ${value} |`);
  lines.push("", "These figures do not establish coverage of the entire website. Queue exhaustion means no more queued links within the configured discovery rules, not that every site page or application state was found.", "",
    "### Discovery gaps.", "", ...(discovery.gaps.length ? discovery.gaps.map((gap) => `- ${code(gap)}`) : ["No discovery gaps recorded."]), "",
    "### Discovery events.", "", ...(discovery.events.length ? discovery.events.map((event) => `- ${code(event.url)}: ${code(event.reason)}`) : ["None recorded."]), "",
    "## Page inventory.", "", "| Requested URL | Final URL | Audit status |", "| --- | --- | --- |");
  for (const target of results.targets) lines.push(`| ${cell(code(target.page.url))} | ${cell(code(target.page.finalUrl))} | ${code(target.status)} |`);
  lines.push("", "## Findings by engine.", "", FINDINGS_NOTE, "");
  for (const engine of plan.options.engines) {
    const counts = results.targets.map((target) => target.summary.engines[engine]);
    lines.push(`### ${engine}.`, "", `Page-level violation occurrences: ${counts.reduce((total, summary) => total + (summary?.violations ?? 0), 0)}. Failed or missing engine results are not passes.`, "");
    /** @type {Map<string, Set<string>>} */
    const recurring = new Map();
    for (const target of results.targets) for (const archetype of Object.values(target.archetypes)) for (const config of archetype.configs) {
      for (const finding of config.tiers.rules?.engines?.[engine]?.violations ?? []) {
        if (!recurring.has(finding.ruleId)) recurring.set(finding.ruleId, new Set());
        recurring.get(finding.ruleId).add(target.page.url);
      }
    }
    lines.push(`Unique violation rule IDs: ${recurring.size}.`, "");
    for (const [rule, pages] of recurring) lines.push(`- ${code(rule)} (${pages.size} affected pages): ${[...pages].map(code).join(", ")}`);
    lines.push("");
  }
  lines.push("## Per-page evidence.", "");
  for (const target of results.targets) {
    const source = plan.targets.find((item) => item.id === target.page.siteId);
    lines.push(targetSection({ ...source, id: target.id, label: target.page.url, kind: "url", resolved: { url: target.page.finalUrl } }, target));
  }
  lines.push(...reportFooter(results));
  return finish(lines);
}
