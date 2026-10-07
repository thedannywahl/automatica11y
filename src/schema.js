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
