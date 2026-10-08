import { cap, num, plural } from "../text.js";

/** Markdown helpers. */
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (text) => `\`${String(text).replace(/`/g, "'")}\``;
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
  const counts = target.summary?.interactions;
  if (tier === "interactions" && counts) {
    const parts = [counts.fail && plural(counts.fail, "failed", "failed"), counts.error && plural(counts.error, "error"), counts.pass && `${num(counts.pass)} passed`, counts.notApplicable && `${num(counts.notApplicable)} not applicable`].filter(Boolean);
    return `ran, ${parts.join(", ")}`;
  }
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

function engineSection(engine, result, nested = false) {
  const title = `${nested ? "#####" : "####"} ${ENGINE_NAMES[engine] ?? engine}${result.version ? ` ${result.version}` : ""}.`;
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


/** Group one engine's findings across every story, so a long Storybook reads as rules, not as hundreds of repeats. */
function aggregate(target, engine, listName) {
  const byRule = new Map();
  let version = null;
  let ranStories = 0;
  for (const [key, archetype] of Object.entries(target.archetypes)) {
    const result = archetype.configs[0]?.tiers.rules?.engines?.[engine];
    if (!result || result.status !== "ran") continue;
    version ??= result.version;
    ranStories += 1;
    for (const finding of result[listName]) {
      const id = `${finding.ruleId}|${finding.kind ?? ""}`;
      const entry = byRule.get(id) ?? { finding, stories: [] };
      entry.stories.push(key.replace(/^story:/, ""));
      byRule.set(id, entry);
    }
  }
  return { rows: [...byRule.values()].sort((a, b) => b.stories.length - a.stories.length || a.finding.ruleId.localeCompare(b.finding.ruleId)), version, ranStories };
}

function ruleTable(rows, engine) {
  if (rows.length === 0) return ["None."];
  const head = engine === "axe" ? "Impact" : "Toolkit level";
  const lines = [`| Rule | ${head} | WCAG | Stories | Examples |`, "| --- | --- | --- | --- | --- |"];
  for (const { finding, stories } of rows) {
    const level = engine === "axe" ? finding.impact ?? "-" : finding.toolkitLevel ?? "-";
    const rule = finding.kind ? `${finding.ruleId} (${finding.kind})` : finding.ruleId;
    lines.push(`| ${cell(code(rule))} | ${level} | ${cell(finding.wcag.join(", ") || "-")} | ${stories.length} | ${cell(stories.slice(0, 3).join(", "))}${stories.length > 3 ? ", and more" : ""} |`);
  }
  return lines;
}

function storybookSection(planTarget, target) {
  const sb = target.storybook;
  const lines = [`### ${planTarget.label}.`, "", `Storybook ${code(planTarget.input)}, component evidence. Each story ran as its own unit, and rules were scoped to the story's root element.`, ""];
  const filtered = Object.keys(sb.archetypeMatches).length > 0 || sb.matched !== sb.total;
  lines.push(
    `The index lists ${plural(sb.total, "story", "stories")}. ${filtered ? `${cap(num(sb.matched))} matched the archetype filter. ` : ""}${cap(num(sb.audited))} ${sb.audited === 1 ? "was" : "were"} audited, with a cap of ${num(sb.maxStories)}.`,
    "",
  );
  for (const warning of target.warnings) lines.push(`Warning: ${warning}`, "");
  const matches = Object.entries(sb.archetypeMatches);
  if (matches.length) {
    lines.push("**Archetype matches.** Matches come from story titles, names, and tags, so check them.", "");
    for (const [archetype, ids] of matches) lines.push(`- ${archetype}: ${ids.slice(0, 8).map(code).join(", ")}${ids.length > 8 ? `, and ${num(ids.length - 8)} more` : ""}`);
    lines.push("");
  }
  if (sb.failedStories.length) {
    lines.push("**Stories that didn't render.** Each one is a gap in coverage, not a pass.", "");
    for (const failure of sb.failedStories) lines.push(`- ${code(failure.id)}: ${sentence(failure.reason)}.`);
    lines.push("");
  }
  for (const engine of Object.keys(target.summary.engines)) {
    const violations = aggregate(target, engine, "violations");
    const review = aggregate(target, engine, "incomplete");
    lines.push(`#### ${ENGINE_NAMES[engine] ?? engine}${violations.version ? ` ${violations.version}` : ""}.`, "");
    if (violations.ranStories === 0) {
      lines.push("This engine didn't run on any story. Treat that as a coverage gap, not a pass.", "");
      continue;
    }
    lines.push("**Violations by rule.**", "");
    if (violations.rows.length === 0) lines.push(`No automated violations found by ${ENGINE_NAMES[engine]} across ${plural(violations.ranStories, "story", "stories")}.`);
    else lines.push(...ruleTable(violations.rows, engine));
    lines.push("", "**Needs review by rule.**", "", ...ruleTable(review.rows, engine));
    lines.push("", "Element-level detail for every story is in results.json.", "");
  }
  return lines.join("\n");
}

function interactionsSection(result, nested) {
  const lines = [`${nested ? "#####" : "####"} Interactions.`, "", "Each check ran on a fresh page, using only the trigger and root hooks and ARIA roles. A check that couldn't finish is an error, which counts as a gap and never as a pass.", ""];
  lines.push("| Check | Result | WCAG | Detail |", "| --- | --- | --- | --- |");
  for (const check of result.checks) {
    lines.push(`| ${code(check.name)} | ${check.result} | ${cell((check.criteria ?? []).join(", ") || "-")} | ${cell(check.detail)}${check.method ? cell(` (method: ${check.method})`) : ""} |`);
  }
  return lines.join("\n");
}

function archetypeTable(target) {
  const rows = Object.entries(target.archetypes).map(([name, archetype]) => {
    if (archetype.status === "gap") return `| ${name} | gap | - | ${cell(sentence(archetype.reason ?? "No fixture."))} |`;
    const states = archetype.configs.map((c) => c.state).filter(Boolean).join(", ") || "-";
    return `| ${name} | ran | ${states} | |`;
  });
  return ["| Archetype | Status | States | Note |", "| --- | --- | --- | --- |", ...rows];
}

function targetSection(planTarget, target) {
  if (target.status === "ran" && target.storybook) return storybookSection(planTarget, target);
  const lines = [`### ${planTarget.label}.`, ""];
  lines.push(`Target ${code(planTarget.input)}, ${planTarget.kind ?? "unclassified"}${planTarget.evidenceLevel ? `, ${planTarget.evidenceLevel} evidence` : ""}.`, "");
  if (target.status !== "ran" && target.status !== "failed") {
    lines.push(`This target is ${target.status}: ${sentence(target.reason)}. That's a gap in coverage. It isn't a pass.`, "");
    return lines.join("\n");
  }
  if (target.npm) {
    const n = target.npm;
    lines.push(`Installed ${code(`${n.name}@${n.version}`)} on its own, as ${n.flavor === "react" ? `React${n.react ? ` (react ${n.react})` : ""}` : `web components (${n.tags.length ? n.tags.slice(0, 6).join(", ") : "no tags found"})`}.`, "");
  }
  for (const warning of target.warnings) lines.push(`Warning: ${warning}`, "");
  if (target.status === "failed") {
    lines.push(`This target failed: ${sentence(target.reason)}. A failed target is a gap in coverage. It isn't a pass.`, "");
  }
  if (target.npm) lines.push("**Archetypes.** A gap means the archetype wasn't tested, so it counts against coverage and never as a pass.", "", ...archetypeTable(target), "");
  /** @type {Set<string>} */
  const skipped = new Set();
  for (const [name, archetype] of Object.entries(target.archetypes)) {
    for (const config of archetype.configs) {
      if (name !== "page") lines.push(`#### ${name}${config.state ? ` (${config.state} state)` : ""}.`, "");
      for (const [tier, result] of Object.entries(config.tiers)) {
        if (tier === "rules") {
          for (const [engine, engineResult] of Object.entries(result.engines ?? {})) lines.push(engineSection(engine, engineResult, name !== "page"), "");
        } else if (tier === "interactions" && result.status === "ran") {
          lines.push(interactionsSection(result, name !== "page"), "");
        } else if (result.status !== "ran") {
          skipped.add(`${TIER_NAMES[tier] ?? tier}: ${sentence(result.reason ?? result.status)}.`);
        }
      }
    }
  }
  if (skipped.size) lines.push("**Not run.**", "", ...[...skipped].map((item) => `- ${item}`), "");
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
  for (const target of results.targets) {
    const items = target.summary.notTestable;
    if (!items.length) continue;
    lines.push(`**Not testable in ${target.id}.**`, "", ...items.slice(0, 20).map((item) => `- ${item}`), ...(items.length > 20 ? [`- and ${num(items.length - 20)} more`] : []), "");
  }
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
