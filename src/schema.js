import * as v from "valibot";

export const WCAG_VERSIONS = ["2.0", "2.1", "2.2"];
export const LEVELS = ["A", "AA", "AAA"];
export const TIERS = ["rules", "interactions", "vsr"];
export const ENGINES = ["axe", "ibm"];
export const LIB_A11Y = ["on", "off"];
export const IMPACTS = ["minor", "moderate", "serious", "critical"];
export const TOOLKIT_LEVELS = [1, 2, 3];
export const FAIL_MODES = ["any", "all"];
export const ARCHETYPES = ["button", "link", "dialog", "menu", "tabs", "combobox", "form-field", "accordion", "tooltip", "chart"];
export const TARGET_KINDS = ["npm", "npm-react", "npm-wc", "npm-unsupported", "npm-non-ui", "storybook", "url", "html-file", "static-dir"];

const nullableString = v.nullable(v.string());

export const TargetSchema = v.object({
  id: v.string(),
  input: v.string(),
  label: v.string(),
  status: v.picklist(["ok", "failed"]),
  reason: nullableString,
  kind: v.nullable(v.picklist(TARGET_KINDS)),
  evidenceLevel: v.nullable(v.picklist(["component", "page"])),
  resolved: v.nullable(v.record(v.string(), nullableString)),
  mapping: v.nullable(v.record(v.string(), v.unknown())),
});

export const FailConfigSchema = v.object({
  mode: v.picklist(FAIL_MODES),
  axe: v.nullable(v.picklist(IMPACTS)),
  ibm: v.nullable(v.picklist(TOOLKIT_LEVELS)),
});

export const PlanSchema = v.object({
  schema: v.literal(1),
  createdAt: v.string(),
  command: v.picklist(["audit", "compare"]),
  options: v.object({
    wcag: v.picklist(WCAG_VERSIONS),
    level: v.picklist(LEVELS),
    tiers: v.array(v.picklist(TIERS)),
    engines: v.array(v.picklist(ENGINES)),
    libA11y: v.array(v.picklist(LIB_A11Y)),
    archetypes: v.nullable(v.array(v.picklist(ARCHETYPES))),
    mapping: nullableString,
    maxStories: v.pipe(v.number(), v.integer(), v.minValue(1)),
    out: v.string(),
    fail: v.nullable(FailConfigSchema),
  }),
  tools: v.record(v.string(), nullableString),
  targets: v.array(TargetSchema),
});

/**
 * Parse a plan. Throws an Error with a readable summary when the plan is invalid.
 * @param {unknown} input
 */
export function parsePlan(input) {
  const result = v.safeParse(PlanSchema, input);
  if (!result.success) throw new Error(`Invalid plan:\n${v.summarize(result.issues)}`);
  return result.output;
}

// ---- Results ----

const TIER_STATUS = ["ran", "skipped", "not-applicable", "not-testable", "failed"];
const IMPACT_COUNTS = v.object({ critical: v.number(), serious: v.number(), moderate: v.number(), minor: v.number() });

const NodeSchema = v.object({ selector: v.string(), html: v.string() });

/** One finding from one engine. `impact` belongs to axe. `toolkitLevel` belongs to IBM. Neither converts to the other. */
const FindingSchema = v.object({
  ruleId: v.string(),
  impact: v.nullable(v.picklist(IMPACTS)),
  toolkitLevel: v.optional(v.nullable(v.number())),
  kind: v.optional(v.picklist(["potential", "manual", "recommendation"])),
  wcag: v.array(v.string()),
  tags: v.optional(v.array(v.string())),
  help: v.string(),
  helpUrl: v.string(),
  nodeCount: v.number(),
  nodes: v.array(NodeSchema),
});

const EngineResultSchema = v.object({
  status: v.picklist(TIER_STATUS),
  reason: v.optional(v.nullable(v.string())),
  version: v.optional(v.nullable(v.string())),
  config: v.optional(v.record(v.string(), v.unknown())),
  violations: v.optional(v.array(FindingSchema)),
  incomplete: v.optional(v.array(FindingSchema)),
  /** Rules that passed. Both engines count rules, not elements. */
  passesCount: v.optional(v.number()),
  notes: v.optional(v.array(v.string())),
});

const TierResultSchema = v.object({
  status: v.picklist(TIER_STATUS),
  reason: v.optional(v.nullable(v.string())),
  engines: v.optional(v.record(v.string(), EngineResultSchema)),
  checks: v.optional(v.array(v.unknown())),
  simulated: v.optional(v.boolean()),
  log: v.optional(v.array(v.unknown())),
});

const EngineSummarySchema = v.object({
  status: v.picklist(TIER_STATUS),
  violations: v.number(),
  needsReview: v.number(),
  /** axe only. IBM findings have no impact. */
  violationsByImpact: v.optional(IMPACT_COUNTS),
  /** IBM only. Keys are Toolkit levels 1 to 4. */
  violationsByToolkitLevel: v.optional(v.record(v.string(), v.number())),
});

const StorybookInfoSchema = v.object({
  index: v.string(),
  /** Stories in the index, before any filtering. */
  total: v.number(),
  /** Stories left after the archetype filter. */
  matched: v.number(),
  audited: v.number(),
  /** True when the story cap cut the list short. */
  truncated: v.boolean(),
  maxStories: v.number(),
  archetypeMatches: v.record(v.string(), v.array(v.string())),
  /** Stories that didn't render. They count as failures, never as passes. */
  failedStories: v.array(v.object({ id: v.string(), reason: v.string() })),
});

export const TargetResultSchema = v.object({
  id: v.string(),
  status: v.picklist(["ran", "failed"]),
  reason: nullableString,
  archetypes: v.record(
    v.string(),
    v.object({
      status: v.picklist(["ran", "gap"]),
      configs: v.array(v.object({ libA11y: v.picklist(["on", "off", "n/a"]), tiers: v.record(v.string(), TierResultSchema) })),
    }),
  ),
  storybook: v.optional(StorybookInfoSchema),
  summary: v.object({
    engines: v.record(v.string(), EngineSummarySchema),
    gaps: v.array(v.string()),
    notTestable: v.array(v.string()),
  }),
  warnings: v.array(v.string()),
});

const FailEngineSchema = v.object({ threshold: v.union([v.string(), v.number()]), hits: v.number(), tripped: v.boolean() });

export const FailCheckSchema = v.object({
  mode: v.picklist(FAIL_MODES),
  axe: v.nullable(FailEngineSchema),
  ibm: v.nullable(FailEngineSchema),
  /** Per target, because the combined mode decides one target at a time. */
  targets: v.record(v.string(), v.object({ axe: v.nullable(FailEngineSchema), ibm: v.nullable(FailEngineSchema), tripped: v.boolean() })),
  tripped: v.boolean(),
});

export const ResultsSchema = v.object({
  schema: v.literal(1),
  planRef: v.string(),
  runAt: v.string(),
  tools: v.record(v.string(), nullableString),
  targets: v.array(TargetResultSchema),
  failCheck: v.nullable(FailCheckSchema),
  warnings: v.array(v.string()),
});

/**
 * Parse a results object. Throws an Error with a readable summary when it's invalid.
 * @param {unknown} input
 */
export function parseResults(input) {
  const result = v.safeParse(ResultsSchema, input);
  if (!result.success) throw new Error(`Invalid results:\n${v.summarize(result.issues)}`);
  return result.output;
}
