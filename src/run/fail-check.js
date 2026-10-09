import { IMPACTS } from "../schema.js";

/**
 * @typedef {{ impact?: string | null, toolkitLevel?: number | null }} FailFinding
 * @typedef {{ status?: string, violations?: FailFinding[] }} FailEngineResult
 * @typedef {{ tiers: { rules?: { engines?: Record<string, FailEngineResult> } } }} FailConfigResult
 * @typedef {{ configs: FailConfigResult[] }} FailArchetypeResult
 * @typedef {{ id: string, status: string, archetypes: Record<string, FailArchetypeResult> }} FailTarget
 */

const RANK = Object.fromEntries(IMPACTS.map((impact, index) => [impact, index]));

/** All findings an engine reported for one target, across every archetype and configuration. */
function violationsFor(target, engine) {
  const found = [];
  for (const archetype of Object.values(target.archetypes)) {
    for (const config of archetype.configs) {
      const result = config.tiers.rules?.engines?.[engine];
      if (result?.status === "ran") found.push(...(result.violations ?? []));
    }
  }
  return found;
}

/** Count axe violations at or above the impact threshold. */
export function countAxeHits(target, threshold) {
  return violationsFor(target, "axe").filter((finding) => finding.impact && RANK[finding.impact] >= RANK[threshold]).length;
}

/** Count IBM violations whose Toolkit level is at or below the threshold. */
export function countIbmHits(target, threshold) {
  return violationsFor(target, "ibm").filter((finding) => finding.toolkitLevel != null && finding.toolkitLevel <= threshold).length;
}

/**
 * Decide whether the run trips its fail check. Each engine has its own threshold, and counts are never added across engines.
 * `any` trips a target when any checked engine hits. `all` trips it only when every checked engine hits.
 * A target that failed, or an engine that failed, counts as no hit.
 * @param {FailTarget[]} targets Target results.
 * @param {ReturnType<typeof import("../schema.js").parsePlan>["options"]["fail"]} fail
 */
export function evaluateFailCheck(targets, fail) {
  if (!fail) return null;
  const checked = [fail.axe ? "axe" : null, fail.ibm ? "ibm" : null].filter(Boolean);
  const totals = { axe: fail.axe ? { threshold: fail.axe, hits: 0, tripped: false } : null, ibm: fail.ibm ? { threshold: fail.ibm, hits: 0, tripped: false } : null };
  const perTarget = {};
  let tripped = false;
  for (const target of targets) {
    const entry = { axe: null, ibm: null, tripped: false };
    if (target.status === "ran") {
      if (fail.axe && totals.axe) {
        const hits = countAxeHits(target, fail.axe);
        entry.axe = { threshold: fail.axe, hits, tripped: hits > 0 };
        totals.axe.hits += hits;
        totals.axe.tripped ||= hits > 0;
      }
      if (fail.ibm && totals.ibm) {
        const hits = countIbmHits(target, fail.ibm);
        entry.ibm = { threshold: fail.ibm, hits, tripped: hits > 0 };
        totals.ibm.hits += hits;
        totals.ibm.tripped ||= hits > 0;
      }
      const flags = checked.map((engine) => entry[/** @type {"axe" | "ibm"} */ (engine)]?.tripped === true);
      entry.tripped = fail.mode === "all" ? flags.every(Boolean) : flags.some(Boolean);
    }
    perTarget[target.id] = entry;
    tripped ||= entry.tripped;
  }
  return { mode: fail.mode, axe: totals.axe, ibm: totals.ibm, targets: perTarget, tripped };
}
