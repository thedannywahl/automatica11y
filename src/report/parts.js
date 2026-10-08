import { adapterFor } from "../frameworks/index.js";
import { criterion, criterionName, wcagAttribution } from "../wcag/index.js";
import { cap, num, plural } from "../text.js";

/** Markdown helpers. */
export const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
export const code = (text) => `\`${String(text).replace(/`/g, "'")}\``;
/** Keep a reason from ending in two periods. */
export const sentence = (text) => String(text).replace(/\.+$/, "");
/** Escape angle brackets so rule text like <input> doesn't turn into HTML. */
export const esc = (text) => String(text ?? "").replace(/</g, "\\<");
export const ENGINE_NAMES = { axe: "axe-core", ibm: "IBM Equal Access" };
export const TIER_NAMES = { rules: "Rules", interactions: "Interactions", computed: "Computed checks", conditions: "Conditions", vsr: "Virtual screen reader" };

export function toolLines(tools) {
  return Object.entries(tools)
    .filter(([, version]) => version)
    .map(([name, version]) => `- ${name}: ${version}`);
}

/** The text for one coverage-matrix cell. */
export function engineCell(summary, engine) {
  const s = summary?.engines?.[engine];
  if (!s) return "-";
  if (s.status !== "ran") return s.status;
  return `ran, ${plural(s.violations, "violation")}`;
}

export function tierCell(target, tier) {
  const counts = target.summary?.interactions;
  const vsr = target.summary?.vsr;
  const measured = target.summary?.[tier];
  if ((tier === "computed" || tier === "conditions") && measured) {
    const parts = [measured.fail && `${num(measured.fail)} failed`, measured.undetermined && `${num(measured.undetermined)} undetermined`, measured.error && plural(measured.error, "error"), measured.pass && `${num(measured.pass)} passed`, measured.notApplicable && `${num(measured.notApplicable)} not applicable`].filter(Boolean);
    return `ran, ${parts.join(", ")}`;
  }
  if (tier === "vsr" && vsr) return `ran (simulated), ${vsr.flagged ? `${num(vsr.flagged)} flagged` : "none flagged"}`;
  if (tier === "interactions" && counts) {
    const parts = [counts.fail && plural(counts.fail, "failed", "failed"), counts.error && plural(counts.error, "error"), counts.pass && `${num(counts.pass)} passed`, counts.notApplicable && `${num(counts.notApplicable)} not applicable`].filter(Boolean);
    return `ran, ${parts.join(", ")}`;
  }
  const configs = Object.values(target.archetypes).flatMap((a) => a.configs);
  const status = configs.map((c) => c.tiers[tier]?.status).find(Boolean);
  return status ?? "-";
}

export function coverageMatrix(plan, results) {
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

export function findingBlock(finding, { showImpact, showToolkit }) {
  const meta = [
    showImpact && finding.impact ? `impact: ${finding.impact}` : null,
    showToolkit && finding.toolkitLevel != null ? `IBM Toolkit level ${finding.toolkitLevel}` : null,
    finding.kind ? `kind: ${finding.kind}` : null,
    finding.wcag.length ? `WCAG ${finding.wcag.map(criterionName).join(", ")}` : null,
    plural(finding.nodeCount, "element"),
  ].filter(Boolean);
  const lines = [`- ${code(finding.ruleId)} (${meta.join("; ")}). ${esc(finding.help)} [Rule help](${finding.helpUrl})`];
  for (const node of finding.nodes) lines.push(`  - ${code(node.selector)} ${node.html ? code(node.html) : ""}`.trimEnd());
  if (finding.nodeCount > finding.nodes.length) lines.push(`  - and ${num(finding.nodeCount - finding.nodes.length)} more`);
  return lines.join("\n");
}

export function engineSection(engine, result, nested = false) {
  const title = `${nested ? "#####" : "####"} ${ENGINE_NAMES[engine] ?? engine}${result.version ? ` ${result.version}` : ""}.`;
  if (result.status === "not-testable") return `${title}\n\nNot testable: ${sentence(result.reason)}. Treat this as a coverage gap, not a pass.\n`;
  if (result.status !== "ran") return `${title}\n\nThis engine didn't run: ${sentence(result.reason ?? result.status)}. Treat this as a coverage gap, not a pass.\n`;
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
export function aggregate(target, engine, listName) {
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

export function ruleTable(rows, engine) {
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

export function storybookSection(planTarget, target) {
  const sb = target.storybook;
  const lines = [`### ${planTarget.label}.`, "", `Storybook ${code(planTarget.input)}, component evidence. Each story ran as its own unit, and rules were scoped to the story's root element.`, ""];
  const filtered = sb.filtered ?? sb.matched !== sb.total;
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
  const walks = Object.entries(target.archetypes).map(([key, a]) => ({ id: key.replace(/^story:/, ""), vsr: a.configs[0]?.tiers.vsr })).filter((w) => w.vsr?.status === "ran");
  if (walks.length) {
    /** @type {Map<string, { flag: any, stories: string[] }>} */
    const byFlag = new Map();
    for (const { id, vsr } of walks) for (const flag of vsr.flags) {
      const key = `${flag.type}|${flag.phrase}`;
      const entry = byFlag.get(key) ?? { flag, stories: [] };
      entry.stories.push(id);
      byFlag.set(key, entry);
    }
    lines.push("#### Virtual screen reader (simulated).", "", `Simulated output from @guidepup/virtual-screen-reader${walks[0].vsr.version ? ` ${walks[0].vsr.version}` : ""}. It isn't a real screen reader. ${cap(num(walks.length))} ${walks.length === 1 ? "story was" : "stories were"} walked. The flags only mark a phrase that is a bare role or a generic role, for a person to check. Full announcement logs are in results.json.`, "");
    if (byFlag.size === 0) lines.push("No phrases flagged.", "");
    else {
      lines.push("| Phrase | Why it's flagged | Stories | Examples |", "| --- | --- | --- | --- |");
      for (const { flag, stories } of [...byFlag.values()].sort((a, b) => b.stories.length - a.stories.length)) {
        lines.push(`| ${cell(code(flag.phrase))} | ${FLAG_TEXT[flag.type] ?? flag.type} | ${stories.length} | ${cell(stories.slice(0, 3).join(", "))}${stories.length > 3 ? ", and more" : ""} |`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export const FLAG_TEXT = {
  "unnamed-control": "announced as only its role, with no name",
  "generic-role": "announced with a generic role",
};

export function vsrSection(result, nested) {
  const lines = [`${nested ? "#####" : "####"} Virtual screen reader (simulated).`, ""];
  lines.push(`Simulated output from @guidepup/virtual-screen-reader${result.version ? ` ${result.version}` : ""}. It isn't a real screen reader, and real ones announce things differently. The log is data. The flags only mark a phrase that is a bare role or a generic role, for a person to check.`, "");
  for (const note of result.notes ?? []) lines.push(`Note: ${note}`, "");
  for (const entry of result.notTestable ?? []) lines.push(`Not testable: ${entry}.`, "");
  lines.push("**Flagged phrases.**", "");
  if (result.flags.length === 0) lines.push("None.");
  else for (const flag of result.flags) lines.push(`- ${code(flag.phrase)} at position ${flag.index + 1}: ${FLAG_TEXT[flag.type] ?? flag.type}.`);
  for (const entry of result.log) {
    const shown = entry.announcements.slice(0, 40);
    lines.push("", `**Announcement log${entry.state ? ` (${entry.state} state)` : ""}.**`, "", "```text", ...shown, ...(entry.announcements.length > shown.length ? [`... and ${num(entry.announcements.length - shown.length)} more in results.json`] : []), "```");
  }
  return lines.join("\n");
}

export function interactionsSection(result, nested) {
  const lines = [`${nested ? "#####" : "####"} Interactions.`, "", "Each check ran on a fresh page, using only the trigger and root hooks and ARIA roles. A check that couldn't finish is an error, which counts as a gap and never as a pass.", ""];
  lines.push("| Check | Result | WCAG | Detail |", "| --- | --- | --- | --- |");
  for (const check of result.checks) {
    lines.push(`| ${code(check.name)} | ${check.result} | ${cell(criteriaCell(check.criteria))} | ${cell(check.detail)}${check.method ? cell(` (method: ${check.method})`) : ""} |`);
  }
  return lines.join("\n");
}

/** Criterion numbers as links to the W3C text, with the W3C's name for each. Unknown numbers stay plain. */
export function criteriaCell(list) {
  if (!list || list.length === 0) return "-";
  return list.map((num) => {
    const c = criterion(num);
    return c ? `[${c.num} ${c.handle}](${c.url})` : num;
  }).join(", ");
}

const MEASURED_INTRO = {
  computed: ["Computed checks", "automatica11y's own measurements from resolved styles in the browser, with the numbers WCAG gives. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't reduce the page to colors (a gradient, an image, transparency) is undetermined, which counts as a gap and never as a pass."],
  conditions: ["Conditions", "automatica11y's own checks of how the page holds up under a user's settings (reduced motion, dark mode, more or less contrast, reduced transparency, forced colors) and environment (a 320 pixel window, wider text spacing). Each check opens fresh copies of the page. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't tell is undetermined, which counts as a gap and never as a pass. \"Not applicable\" means the page doesn't use the feature, which isn't a failure."],
};

export function measuredSection(tier, result, nested) {
  const [title, intro] = MEASURED_INTRO[tier];
  const lines = [`${nested ? "#####" : "####"} ${title}.`, "", intro, ""];
  lines.push("| Check | Result | WCAG | Detail |", "| --- | --- | --- | --- |");
  for (const check of result.checks) {
    lines.push(`| ${code(check.name)} | ${check.result} | ${cell(criteriaCell(check.criteria))} | ${cell(check.detail)}${check.method ? cell(` (method: ${check.method})`) : ""} |`);
  }
  return lines.join("\n");
}

/** " (open state, library accessibility on)" for a config. */
export function configLabel(config) {
  const parts = [config.state ? `${config.state} state` : null, config.libA11y && config.libA11y !== "n/a" ? `library accessibility ${config.libA11y}` : null].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** What the Fixture column says about where a fixture came from. */
function fixtureLabel(archetype) {
  const f = archetype.fixture;
  if (!f || f.source === "none") return "-";
  return f.source === "generated" ? `generated (${f.recipe})` : f.source;
}

export function archetypeTable(target) {
  const rows = Object.entries(target.archetypes).map(([name, archetype]) => {
    if (archetype.status === "gap") return `| ${name} | gap | ${fixtureLabel(archetype)} | - | ${cell(sentence(archetype.reason ?? "No fixture."))} |`;
    const states = [...new Set(archetype.configs.map((c) => c.state).filter(Boolean))].join(", ") || "-";
    const libs = [...new Set(archetype.configs.map((c) => c.libA11y).filter((l) => l && l !== "n/a"))];
    const notes = [libs.length ? `library accessibility ${libs.join(" and ")}` : "", archetype.fixture?.source === "generated" ? `${sentence(archetype.fixture.summary ?? "")}, from ${(archetype.fixture.used ?? []).join(", ")}. Source: ${archetype.fixture.file}` : ""].filter(Boolean);
    return `| ${name} | ran | ${fixtureLabel(archetype)} | ${states} | ${cell(notes.join(". "))} |`;
  });
  return ["| Archetype | Status | Fixture | States | Note |", "| --- | --- | --- | --- | --- |", ...rows];
}

/** True when any archetype in the results ran from a fixture the tool generated. */
export function hasGenerated(results) {
  return results.targets.some((t) => Object.values(t.archetypes ?? {}).some((a) => a.fixture?.source === "generated"));
}

/** What "generated" means, for any report that has one. */
export const GENERATED_NOTE = "**Generated fixtures.** Where no fixture was written, the tool built one from the parts the package exports (or from what a custom element says about itself) and ran it only after it checked that the trigger and root behaved. A generated fixture is a guess about how the library is meant to be assembled, so a failure may come from how it was wired and not from the library. Treat generated results as lower evidence than an authored fixture. The source of each is in the `generated` folder beside this report. Copy one to `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) and edit it to make it an authored fixture.";

export function targetSection(planTarget, target, { generatedNote = true } = {}) {
  if (target.status === "ran" && target.storybook) return storybookSection(planTarget, target);
  const lines = [`### ${planTarget.label}.`, ""];
  lines.push(`Target ${code(planTarget.input)}, ${planTarget.kind ?? "unclassified"}${planTarget.evidenceLevel ? `, ${planTarget.evidenceLevel} evidence` : ""}.`, "");
  if (target.status !== "ran" && target.status !== "failed") {
    lines.push(`This target is ${target.status}: ${sentence(target.reason)}. That's a gap in coverage. It isn't a pass.`, "");
    return lines.join("\n");
  }
  if (target.npm) {
    const n = target.npm;
    lines.push(`Installed ${code(`${n.name}@${n.version}`)} on its own, as ${adapterFor(n.flavor).describe(n)}.`, "");
  }
  for (const warning of target.warnings) lines.push(`Warning: ${warning}`, "");
  if (target.status === "failed") {
    lines.push(`This target failed: ${sentence(target.reason)}. A failed target is a gap in coverage. It isn't a pass.`, "");
  }
  if (target.npm) lines.push("**Archetypes.** A gap means the archetype wasn't tested, so it counts against coverage and never as a pass.", "", ...archetypeTable(target), "");
  if (generatedNote && target.npm && hasGenerated({ targets: [target] })) lines.push(GENERATED_NOTE, "");
  /** @type {Set<string>} */
  const skipped = new Set();
  for (const [name, archetype] of Object.entries(target.archetypes)) {
    for (const config of archetype.configs) {
      if (name !== "page") lines.push(`#### ${name}${configLabel(config)}.`, "");
      for (const [tier, result] of Object.entries(config.tiers)) {
        if (tier === "rules") {
          for (const [engine, engineResult] of Object.entries(result.engines ?? {})) lines.push(engineSection(engine, engineResult, name !== "page"), "");
        } else if (tier === "vsr" && result.status === "ran") {
          lines.push(vsrSection(result, name !== "page"), "");
        } else if (tier === "interactions" && result.status === "ran") {
          lines.push(interactionsSection(result, name !== "page"), "");
        } else if ((tier === "computed" || tier === "conditions") && result.status === "ran") {
          lines.push(measuredSection(tier, result, name !== "page"), "");
        } else if (result.status !== "ran") {
          skipped.add(`${TIER_NAMES[tier] ?? tier}: ${sentence(result.reason ?? result.status)}.`);
        }
      }
    }
  }
  if (skipped.size) lines.push("**Not run.**", "", ...[...skipped].map((item) => `- ${item}`), "");
  return lines.join("\n");
}

export function failCheckSection(fail) {
  if (!fail) return "";
  const lines = ["## Fail check.", "", `Mode: ${fail.mode}. Each engine counts against its own threshold, and the counts aren't added together.`, ""];
  if (fail.axe) lines.push(`- axe-core, impact ${fail.axe.threshold} or higher: ${plural(fail.axe.hits, "violation")}${fail.axe.tripped ? " (tripped)" : ""}.`);
  if (fail.ibm) lines.push(`- IBM Equal Access, Toolkit level ${fail.ibm.threshold} or lower: ${plural(fail.ibm.hits, "violation")}${fail.ibm.tripped ? " (tripped)" : ""}.`);
  lines.push("", `Result: ${fail.tripped ? "the fail check tripped." : "the fail check didn't trip."}`, "");
  return lines.join("\n");
}


/** Top of every report: date, settings, tool versions, targets, and the warnings that apply to the whole run. */
export function reportHeader(plan, results, title) {
  const o = plan.options;
  const lines = [
    `# ${title}`,
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
  return lines;
}

/** What each target couldn't test, listed under the coverage section. */
export function notTestableLines(results) {
  const lines = [];
  for (const target of results.targets) {
    const items = target.summary.notTestable;
    if (!items.length) continue;
    lines.push(`**Not testable in ${target.id}.**`, "", ...items.slice(0, 20).map((item) => `- ${item}`), ...(items.length > 20 ? [`- and ${num(items.length - 20)} more`] : []), "");
  }
  return lines;
}

export const FINDINGS_NOTE = "Findings from different engines are listed separately. The engines overlap, and each catches things the other misses, so don't add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (level 1 is essential requirements with high user impact). The two scales aren't comparable.";

/** The fail check and the method note that close every report. */
export function reportFooter(results) {
  const lines = [];
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
    `**WCAG data.** ${wcagAttribution()}`,
    "",
  );
  return lines;
}

/** Join lines into the final document. */
export const finish = (lines) => `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
