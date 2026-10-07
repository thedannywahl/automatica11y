/** Markdown helpers. */
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (text) => `\`${String(text).replace(/`/g, "'")}\``;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** Spell out zero through nine and use numerals from 10, as the house style asks. */
const num = (n) => (Number.isInteger(n) && n >= 0 && n <= 9 ? WORDS[n] : String(n));
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** Keep a reason from ending in two periods. */
const sentence = (text) => String(text).replace(/\.+$/, "");
/** Escape angle brackets so rule text like <input> doesn't turn into HTML. */
const esc = (text) => String(text ?? "").replace(/</g, "\\<");
const ENGINE_NAMES = { axe: "axe-core", ibm: "IBM Equal Access" };
const TIER_NAMES = { rules: "Rules", interactions: "Interactions", vsr: "Virtual screen reader" };

function toolLines(tools) {
  return Object.entries(tools)
    .filter(([, version]) => version)
    .map(([name, version]) => `- ${name}: ${version}`);
}

/** The text for one coverage-matrix cell. */
function engineCell(summary, engine) {
  const s = summary?.engines?.[engine];
  if (!s) return "-";
  if (s.status !== "ran") return s.status;
  return `ran, ${plural(s.violations, "violation")}`;
}

function tierCell(target, tier) {
  const configs = Object.values(target.archetypes).flatMap((a) => a.configs);
  const status = configs.map((c) => c.tiers[tier]?.status).find(Boolean);
  return status ?? "-";
}

function coverageMatrix(plan, results) {
  const engines = plan.options.engines;
  const tiers = plan.options.tiers.filter((t) => t !== "rules");
  const rulesRequested = plan.options.tiers.includes("rules");
  const head = ["Target", ...(rulesRequested ? engines.map((e) => ENGINE_NAMES[e]) : []), ...tiers.map((t) => TIER_NAMES[t])];
  const rows = results.targets.map((target) => {
    if (target.status === "failed") return [cell(target.id), ...head.slice(1).map(() => "failed")];
    return [
      cell(target.id),
      ...(rulesRequested ? engines.map((e) => engineCell(target.summary, e)) : []),
      ...tiers.map((t) => tierCell(target, t)),
    ];
  });
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

function findingBlock(finding, { showImpact, showToolkit }) {
  const meta = [
    showImpact && finding.impact ? `impact: ${finding.impact}` : null,
    showToolkit && finding.toolkitLevel != null ? `IBM Toolkit level ${finding.toolkitLevel}` : null,
    finding.kind ? `kind: ${finding.kind}` : null,
    finding.wcag.length ? `WCAG ${finding.wcag.join(", ")}` : null,
    plural(finding.nodeCount, "element"),
  ].filter(Boolean);
  const lines = [`- ${code(finding.ruleId)} (${meta.join("; ")}). ${esc(finding.help)} [Rule help](${finding.helpUrl})`];
  for (const node of finding.nodes) lines.push(`  - ${code(node.selector)} ${node.html ? code(node.html) : ""}`.trimEnd());
  if (finding.nodeCount > finding.nodes.length) lines.push(`  - and ${num(finding.nodeCount - finding.nodes.length)} more`);
  return lines.join("\n");
}

function engineSection(engine, result) {
  const title = `#### ${ENGINE_NAMES[engine] ?? engine}${result.version ? ` ${result.version}` : ""}.`;
  if (result.status !== "ran") return `${title}\n\nThis engine didn't run: ${result.reason ?? result.status}. Treat this as a coverage gap, not a pass.\n`;
  const showImpact = engine === "axe";
  const showToolkit = engine === "ibm";
  const cfg = result.config ? `Configuration: ${code(JSON.stringify(result.config))}.` : "";
  const out = [title, "", cfg, ""];
  out.push("**Violations.**", "");
  if (result.violations.length === 0) out.push(`No automated violations found by ${ENGINE_NAMES[engine]}.`);
  else out.push(...result.violations.map((f) => findingBlock(f, { showImpact, showToolkit })));
  out.push("", "**Needs review.**", "");
  if (result.incomplete.length === 0) out.push("Nothing flagged for review.");
  else out.push(...result.incomplete.map((f) => findingBlock(f, { showImpact, showToolkit })));
  out.push("", "**Passes.**", "", `${cap(plural(result.passesCount, "rule"))} passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.`);
  for (const note of result.notes ?? []) out.push("", `Note: ${note}`);
  return out.join("\n");
}

function targetSection(planTarget, target) {
  const lines = [`### ${planTarget.label}.`, ""];
  lines.push(`Target ${code(planTarget.input)}, ${planTarget.kind ?? "unclassified"}${planTarget.evidenceLevel ? `, ${planTarget.evidenceLevel} evidence` : ""}.`, "");
  if (target.status === "failed") {
    lines.push(`This target failed: ${sentence(target.reason)}. A failed target is a gap in coverage. It isn't a pass.`, "");
    return lines.join("\n");
  }
  for (const warning of target.warnings) lines.push(`Warning: ${warning}`, "");
  for (const [name, archetype] of Object.entries(target.archetypes)) {
    for (const config of archetype.configs) {
      if (name !== "page") lines.push(`#### ${name}.`, "");
      for (const [tier, result] of Object.entries(config.tiers)) {
        if (tier === "rules") {
          for (const [engine, engineResult] of Object.entries(result.engines ?? {})) lines.push(engineSection(engine, engineResult), "");
        } else if (result.status !== "ran") {
          lines.push(`#### ${TIER_NAMES[tier] ?? tier}.`, "", `Not run: ${sentence(result.reason ?? result.status)}.`, "");
        }
      }
    }
  }
  return lines.join("\n");
}

function failCheckSection(fail) {
  if (!fail) return "";
  const lines = ["## Fail check.", "", `Mode: ${fail.mode}. Each engine counts against its own threshold, and the counts aren't added together.`, ""];
  if (fail.axe) lines.push(`- axe-core, impact ${fail.axe.threshold} or higher: ${plural(fail.axe.hits, "violation")}${fail.axe.tripped ? " (tripped)" : ""}.`);
  if (fail.ibm) lines.push(`- IBM Equal Access, Toolkit level ${fail.ibm.threshold} or lower: ${plural(fail.ibm.hits, "violation")}${fail.ibm.tripped ? " (tripped)" : ""}.`);
  lines.push("", `Result: ${fail.tripped ? "the fail check tripped." : "the fail check didn't trip."}`, "");
  return lines.join("\n");
}

/**
 * Render report.md from a plan and its results. The text comes from results.json and nothing else.
 * @param {{ plan: any, results: any }} input
 */
export function renderReport({ plan, results }) {
  const o = plan.options;
  const lines = [
    "# Accessibility report.",
    "",
    `Run date: ${results.runAt}.`,
    "",
    `Command: ${plan.command}. WCAG ${o.wcag}, level ${o.level}. Tiers: ${o.tiers.join(", ")}. Engines: ${o.engines.join(", ")}.`,
    "",
    "These results are a snapshot. The tools ran at their latest versions on this date, and a later run can differ.",
    "",
    "**Tool versions.**",
    "",
    ...toolLines(results.tools),
    "",
    "**Targets.**",
    "",
    ...plan.targets.map((t) => `- ${t.label}: ${t.resolved ? Object.values(t.resolved).filter(Boolean).join(" ") : t.input}${t.status === "failed" ? ` (failed: ${sentence(t.reason)})` : ""}`),
    "",
  ];
  const evidence = new Set(plan.targets.filter((t) => t.evidenceLevel).map((t) => t.evidenceLevel));
  if (evidence.size > 1) {
    lines.push("**Warning.** This comparison mixes component evidence and page evidence. They test different things, so the results aren't equivalent.", "");
  }
  for (const warning of results.warnings) lines.push(`Warning: ${warning}`, "");
  lines.push("## Coverage.", "", coverageMatrix(plan, results), "");
  lines.push("A gap, a failed engine, or a target that wasn't testable is a finding. It never counts as a pass.", "");
  lines.push("## Findings.", "");
  lines.push("Findings from different engines are listed separately. The engines overlap, and each catches things the other misses, so don't add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (level 1 is essential requirements with high user impact). The two scales aren't comparable.", "");
  for (const target of results.targets) lines.push(targetSection(plan.targets.find((t) => t.id === target.id), target));
  const fail = failCheckSection(results.failCheck);
  if (fail) lines.push(fail);
  lines.push(
    "## Method note.",
    "",
    "Automated rules cover only part of WCAG. A result of no automated violations found doesn't show that a page conforms to WCAG or works for everyone.",
    "",
    "A person has to check what these tools can't judge: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, reading order and focus order in real use, and how real screen readers behave.",
    "",
    "Contrast results depend on how the browser rendered the page, so the browser version is recorded above.",
    "",
  );
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
