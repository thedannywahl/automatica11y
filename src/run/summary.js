/** Roll the engine results up into counts. Impact counts belong to axe and Toolkit-level counts belong to IBM. */
export function summarize(archetypes, engines, gaps = []) {
  /** @type {any} */
  const summary = { engines: {}, gaps, notTestable: [] };
  for (const engine of engines) {
    const results = Object.values(archetypes).flatMap((a) => a.configs.map((c) => c.tiers.rules?.engines?.[engine]).filter(Boolean));
    if (results.length === 0) continue;
    const ran = results.filter((r) => r.status === "ran");
    const entry = {
      status: ran.length ? "ran" : results[0].status,
      violations: ran.reduce((n, r) => n + r.violations.length, 0),
      needsReview: ran.reduce((n, r) => n + r.incomplete.length, 0),
    };
    if (engine === "axe") {
      entry.violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const r of ran) for (const f of r.violations) if (f.impact) entry.violationsByImpact[f.impact] += 1;
    }
    if (engine === "ibm") {
      entry.violationsByToolkitLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const r of ran) for (const f of r.violations) if (f.toolkitLevel != null) entry.violationsByToolkitLevel[f.toolkitLevel] += 1;
    }
    summary.engines[engine] = entry;
  }
  const checks = Object.values(archetypes).flatMap((a) => a.configs.flatMap((c) => c.tiers.interactions?.checks ?? []));
  if (checks.length) {
    summary.interactions = { pass: 0, fail: 0, notApplicable: 0, error: 0 };
    for (const check of checks) summary.interactions[check.result === "not-applicable" ? "notApplicable" : check.result] += 1;
  }
  return summary;
}

export function failedTarget(id, reason) {
  return { id, status: "failed", reason, archetypes: {}, summary: { engines: {}, gaps: [], notTestable: [] }, warnings: [] };
}
