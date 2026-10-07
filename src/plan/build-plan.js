import { classifyTarget, parseTargetInput } from "./classify.js";
import { readToolVersions } from "../env/versions.js";

/** @param {string} text */
function slug(text) {
  const out = text.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return out || "target";
}

/**
 * Classify every target and assemble plan.json. Nothing here installs a package or launches a browser.
 * @param {{
 *   command: "audit" | "compare",
 *   targets: string[],
 *   options: import("valibot").InferOutput<typeof import("../schema.js").PlanSchema>["options"],
 *   browserVersion?: string | null,
 *   ctx?: import("./classify.js").ClassifyContext,
 *   now?: Date,
 * }} input
 */
export async function buildPlan({ command, targets, options, browserVersion = null, ctx = {}, now = new Date() }) {
  const classified = await Promise.all(targets.map((raw) => classifyTarget(raw, ctx)));
  const seen = new Map();
  const planTargets = classified.map((target) => {
    const base = slug(target.label ?? target.name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      id: count === 1 ? base : `${base}-${count}`,
      input: target.input,
      label: target.label ?? target.name,
      status: target.status,
      reason: target.reason,
      kind: target.kind,
      evidenceLevel: target.evidenceLevel,
      resolved: target.resolved,
      mapping: null,
    };
  });
  return {
    schema: /** @type {const} */ (1),
    createdAt: now.toISOString(),
    command,
    options,
    tools: readToolVersions({ chromium: browserVersion }),
    targets: planTargets,
  };
}

/** Labels the user typed must be unique. Returns the first duplicate, or null. */
export function findDuplicateLabel(rawTargets) {
  const seen = new Set();
  for (const raw of rawTargets) {
    const { label } = parseTargetInput(raw.trim());
    if (!label) continue;
    if (seen.has(label)) return label;
    seen.add(label);
  }
  return null;
}
