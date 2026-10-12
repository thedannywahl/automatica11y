import { IMPACTS } from "../schema.js";

/**
 * @typedef {{ impact?: string | null, toolkitLevel?: number | null }} FailFinding
 * @typedef {{ status?: string, violations?: FailFinding[] }} FailEngineResult
 * @typedef {{ tiers: { rules?: { engines?: Record<string, FailEngineResult> } } }} FailConfigResult
 * @typedef {{ configs: FailConfigResult[] }} FailArchetypeResult
 * @typedef {{ id: string, status: string, archetypes: Record<string, FailArchetypeResult> }} FailTarget
 */

const RANK = Object.fromEntries(IMPACTS.map((impact, index) => [impact, index]));

/**
 * All findings an engine reported for one target, across every archetype and configuration.
 * @param {FailTarget} target
 * @param {string} engine
 */
function violationsFor(target, engine) {
  /** @type {FailFinding[]} */
  const found = [];
  for (const archetype of Object.values(target.archetypes)) {
    for (const config of archetype.configs) {
      const result = config.tiers.rules?.engines?.[engine];
      if (result?.status === "ran") found.push(...(result.violations ?? []));
    }
  }
  return found;
}

/**
 * Count axe violations at or above the impact threshold.
 * @param {FailTarget} target
 * @param {string | number} threshold
 */
export function countAxeHits(target, threshold) {
  return violationsFor(target, "axe").filter((finding) => finding.impact && RANK[finding.impact] >= RANK[threshold]).length;
}

/**
 * Count IBM violations whose Toolkit level is at or below the threshold.
 * @param {FailTarget} target
 * @param {number} threshold
 */
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
  const perTarget = /** @type {NonNullable<import("../types.js").Results["failCheck"]>["targets"]} */ ({});
  let tripped = false;
  for (const target of targets) {
    /** @type {NonNullable<import("../types.js").Results["failCheck"]>["targets"][string]} */
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

/**
 * @param {import("../types.js").TargetResult[]} targets
 * @param {Pick<import("../types.js").PlanOptions, "tiers" | "engines"> & { policy?: Partial<import("../types.js").PlanOptions["policy"]> }} options
 * @param {Pick<import("../types.js").FailCheck, "tripped"> | null} failCheck
 */
export function evaluateOutcome(targets, options, failCheck) {
  /** @type {Set<string>} */
  const coverage = new Set();
  /** @type {Set<string>} */
  const review = new Set();
  /** @type {Set<string>} */
  const checks = new Set();
  for (const target of targets) {
    const id = target.id;
    if (target.status !== "ran") coverage.add(`${id}: ${target.status}: ${target.reason ?? "no audit results"}`);
    for (const reason of target.summary?.gaps ?? []) coverage.add(`${id}: ${reason}`);
    for (const reason of target.summary?.notTestable ?? []) coverage.add(`${id}: ${reason}`);
    if (target.storybook?.truncated) coverage.add(`${id}: Storybook story cap truncated coverage`);
    for (const story of target.storybook?.failedStories ?? []) coverage.add(`${id}: story ${story.id} failed: ${story.reason}`);
    if (target.status === "ran" && !Object.values(target.archetypes).some((archetype) => archetype.configs.length)) coverage.add(`${id}: no executable configurations`);
    for (const [name, archetype] of Object.entries(target.archetypes)) {
      if (archetype.status === "gap") coverage.add(`${id}/${name}: ${archetype.reason ?? "fixture gap"}`);
      for (const [index, config] of archetype.configs.entries()) {
        const location = `${id}/${name}/${index}`;
        for (const tierName of options.tiers) {
          const tier = config.tiers[tierName];
          if (!tier || ["failed", "not-testable", "skipped"].includes(tier.status)) {
            coverage.add(`${location}/${tierName}: ${tier?.reason ?? tier?.status ?? "missing requested tier"}`);
            continue;
          }
          if (tier.status === "not-applicable") continue;
          for (const reason of tier.notTestable ?? []) coverage.add(`${location}/${tierName}: ${reason}`);
          for (const check of tier.checks ?? []) {
            if (["error", "undetermined"].includes(check.result)) coverage.add(`${location}/${tierName}/${check.name}: ${check.result}: ${check.detail}`);
            if (check.result === "fail") checks.add(`${location}/${tierName}/${check.name}: ${check.detail}`);
          }
          for (const flag of tier.flags ?? []) review.add(`${location}/${tierName}: ${flag.phrase}`);
          if (tierName === "rules") for (const engine of options.engines) {
            const result = tier.engines?.[engine];
            if (!result || result.status !== "ran") coverage.add(`${location}/${engine}: ${result?.reason ?? result?.status ?? "missing requested engine"}`);
            for (const finding of result?.incomplete ?? []) review.add(`${location}/${engine}: ${finding.ruleId}`);
          }
        }
      }
    }
  }
  /** @type {Partial<import("../types.js").PlanOptions["policy"]>} */
  const policy = options.policy ?? {};
  const status = policy.incomplete && coverage.size ? "incomplete" : failCheck?.tripped || (policy.review && review.size) || (policy.checks && checks.size) ? "failed" : "passed";
  return { status, coverage: [...coverage], review: [...review], checks: [...checks] };
}
