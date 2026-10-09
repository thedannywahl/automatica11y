import * as v from "valibot";

export const WCAG_VERSIONS = ["2.0", "2.1", "2.2"];
export const LEVELS = ["A", "AA", "AAA"];
export const TIERS = ["rules", "interactions", "computed", "conditions", "vsr"];
export const ENGINES = ["axe", "ibm"];
export const LIB_A11Y = ["on", "off"];
export const IMPACTS = ["minor", "moderate", "serious", "critical"];
export const TOOLKIT_LEVELS = [1, 2, 3];
export const FAIL_MODES = ["any", "all"];
export const ARCHETYPES = ["button", "link", "dialog", "menu", "tabs", "combobox", "form-field", "accordion", "tooltip", "live-region", "chart"];
export const FLAVORS = ["react", "vue", "angular", "html", "wc"];
export const MAPPING_STATUSES = ["template", "authored", "generated", "needs-fixture", "no-match"];

/** What a candidate mapping says about one archetype of one npm target. */
export const MappingEntrySchema = v.object({
  flavor: v.optional(v.picklist(FLAVORS)),
  /** Export name (React or Vue) the fixture or template uses. */
  export: v.optional(v.string()),
  /** Custom element tag (web components) the fixture or template uses. */
  tag: v.optional(v.string()),
  /** Path to an authored fixture, relative to where the command runs. */
  fixture: v.optional(v.nullable(v.string())),
  /** The library ships opt-in accessibility features. The fixture gets `libA11y` (true or false) and `--lib-a11y` runs it both ways. */
  libA11y: v.optional(v.boolean()),
  /** Other packages to install beside the target, such as the token stylesheet or theme the library asks for. A fixture can then import them. */
  install: v.optional(v.array(v.string())),
  status: v.optional(v.picklist(MAPPING_STATUSES)),
  /** For a generated fixture: which recipe worked, what it was, which parts it used, and where its source was written. */
  recipe: v.optional(v.string()),
  summary: v.optional(v.string()),
  used: v.optional(v.array(v.string())),
  generatedFile: v.optional(v.string()),
  candidates: v.optional(v.array(v.string())),
  parts: v.optional(v.array(v.string())),
  reason: v.optional(v.string()),
});

/** The file `--mapping` points to: target id, then archetype. */
export const MappingFileSchema = v.record(v.string(), v.record(v.picklist(ARCHETYPES), MappingEntrySchema));

/**
 * Parse a mapping file. Throws an Error with a readable summary when it's invalid.
 * @param {unknown} input
 */
export function parseMappingFile(input) {
  const result = v.safeParse(MappingFileSchema, input);
  if (!result.success) throw new Error(`Invalid mapping:\n${v.summarize(result.issues)}`);
  return result.output;
}

export const TARGET_KINDS = ["npm", "npm-react", "npm-vue", "npm-angular", "npm-html", "npm-wc", "npm-unsupported", "npm-non-ui", "storybook", "url", "html-file", "static-dir"];

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
  /** The other packages of an npm list target (`npm:a,b`), which install beside the primary one. */
  companions: v.optional(v.array(v.object({ name: v.string(), requested: nullableString, version: nullableString, subpath: nullableString }))),
  mapping: v.nullable(v.record(v.string(), MappingEntrySchema)),
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
    /** Build fixtures from a package's parts when none is authored. A plan saved before this existed generates. */
    generate: v.optional(v.boolean(), true),
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
  checks: v.optional(
    v.array(
      v.object({
        name: v.string(),
        criteria: v.optional(v.array(v.string())),
        result: v.picklist(["pass", "fail", "undetermined", "not-applicable", "error"]),
        detail: v.string(),
        /** How the focus indicator was detected: computed-style or screenshot. */
        method: v.optional(v.string()),
        /** The numbers behind a computed check, for example contrast ratios by state. */
        measurements: v.optional(v.array(v.record(v.string(), v.unknown()))),
      }),
    ),
  ),
  simulated: v.optional(v.boolean()),
  version: v.optional(v.nullable(v.string())),
  log: v.optional(
    v.array(
      v.object({
        state: v.nullable(v.optional(v.string())),
        announcements: v.array(v.string()),
        reachedEnd: v.boolean(),
        truncated: v.boolean(),
      }),
    ),
  ),
  /** Phrases a person should look at: a control announced as only its role, or a role announced as generic. */
  flags: v.optional(v.array(v.object({ type: v.string(), phrase: v.string(), index: v.number(), state: v.nullable(v.optional(v.string())) }))),
  notTestable: v.optional(v.array(v.string())),
  notes: v.optional(v.array(v.string())),
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
  /** True when --archetypes limited which stories were audited. */
  filtered: v.optional(v.boolean()),
  /** Every archetype each story's title, name, and tags suggest, for all stories in the index. */
  archetypeMatches: v.record(v.string(), v.array(v.string())),
  /** Stories that didn't render. They count as failures, never as passes. */
  failedStories: v.array(v.object({ id: v.string(), reason: v.string() })),
});

export const TargetResultSchema = v.object({
  id: v.string(),
  status: v.picklist(["ran", "failed", "unsupported", "not-applicable"]),
  reason: nullableString,
  archetypes: v.record(
    v.string(),
    v.object({
      status: v.picklist(["ran", "gap"]),
      reason: v.optional(v.nullable(v.string())),
      /** Where the fixture came from, and for a generated one what was tried. */
      fixture: v.optional(
        v.object({
          source: v.picklist(["template", "authored", "generated", "none"]),
          recipe: v.optional(v.string()),
          summary: v.optional(v.string()),
          used: v.optional(v.array(v.string())),
          file: v.optional(v.nullable(v.string())),
          attempts: v.optional(v.array(v.object({ recipe: v.string(), summary: v.string(), ok: v.boolean(), reason: v.nullable(v.string()) }))),
        }),
      ),
      configs: v.array(v.object({ libA11y: v.picklist(["on", "off", "n/a"]), state: v.optional(v.string()), tiers: v.record(v.string(), TierResultSchema) })),
    }),
  ),
  storybook: v.optional(StorybookInfoSchema),
  npm: v.optional(
    v.object({
      name: v.string(),
      /** The sub-path of the package that was tested, such as `button/v2`, or null for the package itself. */
      subpath: v.optional(nullableString),
      version: nullableString,
      /** The other packages of a list target (`npm:a,b`), installed beside the primary one. */
      companions: v.optional(v.array(v.object({ name: v.string(), subpath: nullableString, version: nullableString }))),
      flavor: v.picklist(FLAVORS),
      framework: nullableString,
      react: nullableString,
      reactDom: nullableString,
      vue: v.optional(nullableString),
      angular: v.optional(nullableString),
      /** For plain HTML, the stylesheets and scripts the page loaded, as `package/sub-path`. */
      assets: v.optional(v.object({ styles: v.array(v.string()), scripts: v.array(v.string()) })),
      tags: v.array(v.string()),
    }),
  ),
  summary: v.object({
    engines: v.record(v.string(), EngineSummarySchema),
    gaps: v.array(v.string()),
    notTestable: v.array(v.string()),
    interactions: v.optional(v.object({ pass: v.number(), fail: v.number(), notApplicable: v.number(), error: v.number() })),
    computed: v.optional(v.object({ pass: v.number(), fail: v.number(), undetermined: v.number(), notApplicable: v.number(), error: v.number() })),
    conditions: v.optional(v.object({ pass: v.number(), fail: v.number(), undetermined: v.number(), notApplicable: v.number(), error: v.number() })),
    vsr: v.optional(v.object({ walks: v.number(), flagged: v.number() })),
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
