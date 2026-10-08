import { ARCHETYPES } from "../schema.js";
import { num, plural } from "../text.js";
import {
  ENGINE_NAMES,
  FINDINGS_NOTE,
  GENERATED_NOTE,
  TIER_NAMES,
  cell,
  code,
  configLabel,
  finish,
  hasGenerated,
  notTestableLines,
  reportFooter,
  reportHeader,
  sentence,
  targetSection,
} from "./parts.js";

const TIER_ORDER = ["rules", "interactions", "computed", "conditions", "vsr"];

/** The archetype rows: component archetypes in a fixed order, then whole pages, then Storybook stories. */
function archetypeKeys(results) {
  const keys = new Set();
  for (const target of results.targets) {
    for (const key of Object.keys(target.archetypes)) if (!key.startsWith("story:")) keys.add(key);
    for (const key of Object.keys(target.storybook?.archetypeMatches ?? {})) keys.add(key);
  }
  return [...ARCHETYPES.filter((a) => keys.has(a)), ...[...keys].filter((k) => !ARCHETYPES.includes(k) && k !== "page"), ...(keys.has("page") ? ["page"] : [])];
}

/** Configs for one target and one archetype row, as labeled lines for the findings table. */
function rowsFor(planTarget, target, key) {
  // A target that failed outright has nothing per archetype. One whose archetypes were all gaps still says what each gap was.
  if (target.status !== "ran" && Object.keys(target.archetypes).length === 0) return [{ label: "-", note: `${target.status}: ${sentence(target.reason ?? "")}` }];
  if (target.storybook) {
    const ids = target.storybook.archetypeMatches[key] ?? [];
    const stories = ids.map((id) => target.archetypes[`story:${id}`]).filter(Boolean);
    if (key === "page") return [{ label: "-", note: "not-applicable: component evidence" }];
    if (stories.length === 0) return [{ label: "-", note: "gap: no story matched this archetype" }];
    const configs = stories.filter((s) => s.status === "ran").map((s) => s.configs[0]);
    if (configs.length === 0) return [{ label: `${plural(stories.length, "story", "stories")}`, note: "gap: none of the matching stories rendered" }];
    return [{ label: `${plural(configs.length, "story", "stories")} of ${num(stories.length)}`, configs, always: true }];
  }
  const archetype = target.archetypes[key];
  if (!archetype) return [{ label: "-", note: key === "page" ? "not-applicable: component evidence" : "not-applicable: page evidence" }];
  if (archetype.status === "gap") return [{ label: "-", note: `gap: ${sentence(archetype.reason ?? "no fixture")}` }];
  return archetype.configs.map((config) => ({ label: configLabel(config).replace(/^ \(|\)$/g, "") || "-", configs: [config] }));
}

/** A coverage cell for one tier: what happened to that tier for the target and archetype. */
function tierStatus(rows, tier) {
  const row = rows[0];
  if (row.note) return row.note.split(":")[0];
  const statuses = rows.flatMap((r) => r.configs.map((c) => c.tiers[tier]?.status).filter(Boolean));
  if (statuses.length === 0) return "-";
  if (statuses.every((s) => s === statuses[0])) return statuses[0];
  return statuses.includes("ran") ? "partly ran" : statuses[0];
}

function coverageTable(plan, results, tier, keys) {
  const head = ["Archetype", ...results.targets.map((t) => t.id)];
  const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const key of keys) {
    const cells = results.targets.map((target) => {
      const planTarget = plan.targets.find((t) => t.id === target.id);
      const rows = rowsFor(planTarget, target, key);
      const status = tierStatus(rows, tier);
      // Name the configuration only when there's more than one to tell apart, or the row stands for several stories.
      const withTier = rows.filter((r) => r.configs?.some((c) => c.tiers[tier]));
      const labels = withTier.length > 1 || withTier[0]?.always ? withTier.map((r) => r.label).filter((l) => l && l !== "-") : [];
      const generated = target.archetypes?.[key]?.fixture?.source === "generated" && String(status).startsWith("ran");
      const base = labels.length ? `${status} (${labels.join("; ")})` : status;
      return generated ? `${base} (generated fixture)` : base;
    });
    lines.push(`| ${key} | ${cells.join(" | ")} |`);
  }
  return lines;
}

/** Rule IDs for one engine across configs, with element counts, for a findings cell. */
function ruleCell(configs, engine) {
  const found = new Map();
  let review = 0;
  let statuses = [];
  for (const config of configs) {
    const result = config.tiers.rules?.engines?.[engine];
    if (!result) continue;
    statuses.push(result.status);
    if (result.status !== "ran") continue;
    for (const finding of result.violations) found.set(finding.ruleId, (found.get(finding.ruleId) ?? 0) + finding.nodeCount);
    review += result.incomplete.length;
  }
  if (statuses.length === 0) return "-";
  if (!statuses.includes("ran")) return statuses[0];
  const list = [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
  const shown = list.slice(0, 4).map(([id, n]) => `${code(id)} (${num(n)})`).join(", ");
  const text = list.length ? `${shown}${list.length > 4 ? `, and ${num(list.length - 4)} more` : ""}` : "none found";
  return `${text}${review ? `; ${num(review)} to review` : ""}`;
}

function interactionsCell(configs) {
  const checks = configs.flatMap((c) => c.tiers.interactions?.checks ?? []);
  if (checks.length === 0) return configs.map((c) => c.tiers.interactions?.status).find(Boolean) ?? "-";
  const failed = checks.filter((c) => c.result === "fail").map((c) => code(c.name));
  const errors = checks.filter((c) => c.result === "error").length;
  const parts = [failed.length ? `failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? `, and ${num(failed.length - 3)} more` : ""}` : "no failures", errors ? `${plural(errors, "error")}` : null];
  return parts.filter(Boolean).join("; ");
}

function measuredCell(configs, tier) {
  const checks = configs.flatMap((c) => c.tiers[tier]?.checks ?? []);
  if (checks.length === 0) return configs.map((c) => c.tiers[tier]?.status).find(Boolean) ?? "-";
  const failed = checks.filter((c) => c.result === "fail").map((c) => code(c.name));
  const unknown = checks.filter((c) => c.result === "undetermined").length;
  const errors = checks.filter((c) => c.result === "error").length;
  const parts = [failed.length ? `failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? `, and ${num(failed.length - 3)} more` : ""}` : "no failures", unknown ? `${num(unknown)} undetermined` : null, errors ? plural(errors, "error") : null];
  return parts.filter(Boolean).join("; ");
}

function vsrCell(configs) {
  const walks = configs.map((c) => c.tiers.vsr).filter((v) => v?.status === "ran");
  if (walks.length === 0) return configs.map((c) => c.tiers.vsr?.status).find(Boolean) ?? "-";
  const flags = walks.flatMap((v) => v.flags.map((f) => f.phrase));
  const unique = [...new Set(flags)];
  return flags.length ? `${plural(flags.length, "phrase")} flagged: ${unique.slice(0, 3).map(code).join(", ")}` : "none flagged";
}

function findingsTable(plan, results, key) {
  const head = ["Target", "Configuration", ENGINE_NAMES.axe, ENGINE_NAMES.ibm, "Interactions", "Computed checks", "Conditions", "Virtual screen reader (simulated)"];
  const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const target of results.targets) {
    const planTarget = plan.targets.find((t) => t.id === target.id);
    for (const row of rowsFor(planTarget, target, key)) {
      if (row.note) {
        lines.push(`| ${cell(target.id)} | ${cell(row.label)} | ${cell(row.note)} | | | | | |`);
        continue;
      }
      const c = row.configs;
      lines.push(`| ${cell(target.id)} | ${cell(row.label)} | ${cell(ruleCell(c, "axe"))} | ${cell(ruleCell(c, "ibm"))} | ${cell(interactionsCell(c))} | ${cell(measuredCell(c, "computed"))} | ${cell(measuredCell(c, "conditions"))} | ${cell(vsrCell(c))} |`);
    }
  }
  return lines;
}

/** Violations by axe impact and by IBM Toolkit level, in separate tables. Counts are never added across engines. */
function impactTables(results, engines) {
  const lines = [];
  if (engines.includes("axe")) {
    lines.push("### axe-core, violations by impact.", "", "| Target | Critical | Serious | Moderate | Minor | Needs review |", "| --- | --- | --- | --- | --- | --- |");
    for (const target of results.targets) {
      const s = target.summary.engines.axe;
      lines.push(s?.status === "ran" ? `| ${target.id} | ${["critical", "serious", "moderate", "minor"].map((k) => s.violationsByImpact[k]).join(" | ")} | ${s.needsReview} |` : `| ${target.id} | ${s?.status ?? target.status} | | | | |`);
    }
    lines.push("");
  }
  if (engines.includes("ibm")) {
    lines.push("### IBM Equal Access, violations by Toolkit level.", "", "| Target | Level 1 | Level 2 | Level 3 | Level 4 | Needs review |", "| --- | --- | --- | --- | --- | --- |");
    for (const target of results.targets) {
      const s = target.summary.engines.ibm;
      lines.push(s?.status === "ran" ? `| ${target.id} | ${["1", "2", "3", "4"].map((k) => s.violationsByToolkitLevel[k]).join(" | ")} | ${s.needsReview} |` : `| ${target.id} | ${s?.status ?? target.status} | | | | |`);
    }
    lines.push("");
  }
  return lines;
}

/**
 * Render report.md for a comparison of two or more targets.
 * Every target ran with the same settings, so the columns line up. A gap or a failure shows in its cell, and never reads as a pass.
 * @param {{ plan: any, results: any }} input
 */
export function renderComparison({ plan, results }) {
  const o = plan.options;
  const lines = reportHeader(plan, results, "Accessibility comparison.");
  lines.push(
    `Every target was checked with the same settings: WCAG ${o.wcag}, level ${o.level}, ${o.engines.map((e) => ENGINE_NAMES[e]).join(" and ")}, and the same archetypes${o.archetypes ? ` (${o.archetypes.join(", ")})` : ""}. A difference below comes from the targets and not from the settings.`,
    "",
  );
  const keys = archetypeKeys(results);

  lines.push("## Coverage.", "", "Each cell says what happened to that tier for that target and archetype: ran, gap, not-testable, not-applicable, skipped, or failed. A gap, a failure, or a target that wasn't testable is a finding. It never counts as a pass.", "");
  for (const tier of TIER_ORDER.filter((t) => o.tiers.includes(t))) {
    lines.push(`### ${TIER_NAMES[tier]}${tier === "vsr" ? " (simulated)" : ""}.`, "", ...coverageTable(plan, results, tier, keys), "");
  }
  lines.push(...notTestableLines(results));
  if (hasGenerated(results)) lines.push(GENERATED_NOTE, "");

  lines.push("## Findings.", "", FINDINGS_NOTE, "", ...(o.tiers.includes("rules") ? impactTables(results, o.engines) : []));
  for (const key of keys) {
    lines.push(`### ${key === "page" ? "Whole pages" : key}.`, "", ...findingsTable(plan, results, key), "");
  }

  lines.push("## Details by target.", "", "Every finding, with its elements, rule help, and logs, for each target in turn.", "");
  for (const target of results.targets) lines.push(targetSection(plan.targets.find((t) => t.id === target.id), target, { generatedNote: false }));
  lines.push(...reportFooter(results));
  return finish(lines);
}
