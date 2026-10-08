import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkEnvironment } from "../env/browser.js";
import { readToolVersions } from "../env/versions.js";
import { buildPlan, findDuplicateLabel } from "../plan/build-plan.js";
import { loadMappingFile } from "../plan/mapping.js";
import { runPlan } from "../run/run-plan.js";
import { ARCHETYPES, ENGINES, FAIL_MODES, IMPACTS, LEVELS, LIB_A11Y, TIERS, TOOLKIT_LEVELS, WCAG_VERSIONS, parsePlan } from "../schema.js";

export const EXIT = { OK: 0, FAIL_THRESHOLD: 1, USAGE: 2, ENVIRONMENT: 3, ALL_TARGETS_FAILED: 4 };

/** A bad command line. The CLI prints the message plus a usage hint and exits 2. */
export class UsageError extends Error {}

/**
 * @typedef {{ stdout: { write(text: string): unknown }, stderr: { write(text: string): unknown }, cwd: string, env: NodeJS.ProcessEnv, fetch?: import("../plan/classify.js").FetchLike, npmView?: (spec: string) => Promise<any>, installPackage?: Function, platform?: NodeJS.Platform }} Io
 */

const OPTION_DEFS = /** @type {const} */ ({
  wcag: { type: "string" },
  level: { type: "string" },
  tiers: { type: "string" },
  engine: { type: "string" },
  archetypes: { type: "string" },
  "lib-a11y": { type: "string" },
  mapping: { type: "string" },
  plan: { type: "boolean" },
  "no-generate": { type: "boolean" },
  out: { type: "string" },
  "max-stories": { type: "string" },
  "fail-on-axe": { type: "string" },
  "fail-on-ibm": { type: "string" },
  "fail-mode": { type: "string" },
  help: { type: "boolean", short: "h" },
});

/** Split a comma list and check every item against the allowed values. */
function parseList(flag, text, allowed) {
  const items = [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length === 0) throw new UsageError(`--${flag} needs at least one value. Choose from: ${allowed.join(", ")}.`);
  const bad = items.filter((item) => !allowed.includes(item));
  if (bad.length) throw new UsageError(`Unknown ${flag} value${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}. Choose from: ${allowed.join(", ")}.`);
  return items;
}

/** @param {string} flag @param {string} value @param {string[]} allowed */
function parseChoice(flag, value, allowed) {
  if (!allowed.includes(value)) throw new UsageError(`--${flag} must be one of: ${allowed.join(", ")}. Got "${value}".`);
  return value;
}

/**
 * Turn `audit` or `compare` arguments into plan options and raw targets. Throws UsageError on any problem.
 * @param {"audit" | "compare"} command
 * @param {string[]} argv
 */
export function parseRunArgs(command, argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTION_DEFS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.split(". ")[0] : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { help: true, targets: [], planOnly: false, options: null };

  if (command === "audit" && positionals.length !== 1) {
    throw new UsageError(positionals.length === 0 ? "audit needs one target." : "audit takes one target. Use compare for more than one.");
  }
  if (command === "compare" && positionals.length < 2) {
    throw new UsageError("compare needs at least two targets.");
  }
  if (positionals.some((target) => !target.trim())) throw new UsageError("A target can't be empty.");
  const duplicate = findDuplicateLabel(positionals);
  if (duplicate) throw new UsageError(`Two targets use the label "${duplicate}". Labels must be unique.`);

  const tiers = values.tiers ? parseList("tiers", values.tiers, TIERS) : [...TIERS];
  const engines = values.engine ? parseList("engine", values.engine, ENGINES) : [...ENGINES];
  const libA11y = values["lib-a11y"] ? parseList("lib-a11y", values["lib-a11y"], LIB_A11Y) : [...LIB_A11Y];
  const archetypes = values.archetypes ? parseList("archetypes", values.archetypes, ARCHETYPES) : null;

  let maxStories = 200;
  if (values["max-stories"] !== undefined) {
    maxStories = Number(values["max-stories"]);
    if (!Number.isInteger(maxStories) || maxStories < 1) throw new UsageError(`--max-stories must be a whole number of 1 or more. Got "${values["max-stories"]}".`);
  }

  const axeFlag = values["fail-on-axe"];
  const ibmFlag = values["fail-on-ibm"];
  const modeFlag = values["fail-mode"];
  /** @type {import("valibot").InferOutput<typeof import("../schema.js").FailConfigSchema> | null} */
  let fail = null;
  if (axeFlag === undefined && ibmFlag === undefined) {
    if (modeFlag !== undefined) throw new UsageError("--fail-mode needs --fail-on-axe, --fail-on-ibm, or both.");
  } else {
    if (!tiers.includes("rules")) throw new UsageError("The fail flags check the rules tier. Add rules to --tiers or drop the fail flags.");
    const axe = axeFlag === undefined ? null : parseChoice("fail-on-axe", axeFlag, IMPACTS);
    const ibm = ibmFlag === undefined ? null : Number(parseChoice("fail-on-ibm", ibmFlag, TOOLKIT_LEVELS.map(String)));
    if (axe && !engines.includes("axe")) throw new UsageError("--fail-on-axe needs the axe engine. Add axe to --engine or drop the flag.");
    if (ibm && !engines.includes("ibm")) throw new UsageError("--fail-on-ibm needs the ibm engine. Add ibm to --engine or drop the flag.");
    fail = { mode: /** @type {"any" | "all"} */ (modeFlag === undefined ? "any" : parseChoice("fail-mode", modeFlag, FAIL_MODES)), axe: /** @type {any} */ (axe), ibm: /** @type {any} */ (ibm) };
  }

  const options = {
    wcag: /** @type {any} */ (values.wcag === undefined ? "2.2" : parseChoice("wcag", values.wcag, WCAG_VERSIONS)),
    level: /** @type {any} */ (values.level === undefined ? "AA" : parseChoice("level", values.level, LEVELS)),
    tiers: /** @type {any} */ (tiers),
    engines: /** @type {any} */ (engines),
    libA11y: /** @type {any} */ (libA11y),
    archetypes: /** @type {any} */ (archetypes),
    mapping: values.mapping ?? null,
    maxStories,
    generate: !values["no-generate"],
    out: values.out ?? "./a11y-report",
    fail,
  };
  return { help: false, targets: positionals, planOnly: Boolean(values.plan), options };
}

/** One line describing what a target resolved to. */
export function describeTarget(target) {
  if (target.status === "failed") return `failed: ${target.reason}`;
  const r = target.resolved ?? {};
  if (target.kind?.startsWith("npm")) return `${r.name}@${r.version ?? r.requested ?? "latest"}${r.subpath ? `/${r.subpath}` : ""}${r.framework ? ` (${r.framework})` : ""}`;
  return r.url ?? r.path ?? "";
}

/** @param {ReturnType<typeof parsePlan>} plan @param {string} planPath @param {boolean} planOnly @param {Io} io */
function printSummary(plan, planPath, planOnly, io) {
  const o = plan.options;
  const lines = [
    `automatica11y ${plan.command} ${planOnly ? "plan" : "run"}`,
    `  WCAG ${o.wcag} level ${o.level}, tiers: ${o.tiers.join(", ")}, engines: ${o.engines.join(", ")}`,
  ];
  if (o.fail) lines.push(`  Fail checks (${o.fail.mode}): ${[o.fail.axe && `axe ${o.fail.axe}`, o.fail.ibm && `ibm level ${o.fail.ibm}`].filter(Boolean).join(", ")}`);
  lines.push("  Targets:");
  const width = Math.max(...plan.targets.map((t) => t.id.length));
  for (const t of plan.targets) {
    lines.push(`    ${t.id.padEnd(width)}  ${(t.kind ?? "-").padEnd(10)}  ${describeTarget(t)}${t.evidenceLevel ? `  (${t.evidenceLevel} evidence)` : ""}`);
  }
  lines.push(`  Wrote ${planPath}`);
  io.stdout.write(`${lines.join("\n")}\n`);
}

/** Warn when installed tool versions differ from the ones a saved plan recorded. */
function versionWarnings(plan) {
  const now = readToolVersions({ chromium: plan.tools.chromium });
  return Object.entries(plan.tools)
    .filter(([key, was]) => was && now[key] && now[key] !== was)
    .map(([key, was]) => `${key} was ${was} when this plan was made and is ${now[key]} now.`);
}

/**
 * Write plan.json, then stop (plan only) or run the plan.
 * @param {ReturnType<typeof parsePlan>} plan
 * @param {{ planOnly: boolean, savedPlanPath?: string }} mode
 * @param {Io} io
 */
export async function executePlan(plan, { planOnly, savedPlanPath }, io) {
  const outDir = resolve(io.cwd, plan.options.out);
  const planPath = resolve(outDir, "plan.json");
  if (!savedPlanPath || resolve(io.cwd, savedPlanPath) !== planPath) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  }
  printSummary(plan, planPath, planOnly, io);
  for (const warning of savedPlanPath ? versionWarnings(plan) : []) io.stderr.write(`Warning: ${warning}\n`);

  if (plan.targets.every((t) => t.status === "failed")) {
    io.stderr.write("Every target failed to resolve.\n");
    return EXIT.ALL_TARGETS_FAILED;
  }
  if (planOnly) return EXIT.OK;

  return runPlan(plan, io);
}

/**
 * Shared body of `audit` and `compare`.
 * @param {"audit" | "compare"} command
 * @param {string[]} argv
 * @param {Io} io
 */
export async function runCommand(command, argv, io) {
  const parsed = parseRunArgs(command, argv);
  if (parsed.help) {
    io.stdout.write(usage(command));
    return EXIT.OK;
  }
  const options = /** @type {NonNullable<typeof parsed.options>} */ (parsed.options);
  let browserVersion = null;
  if (!parsed.planOnly) {
    const env = await checkEnvironment({ env: io.env, platform: io.platform });
    browserVersion = env.browser?.version ?? null;
  }
  let mapping = null;
  if (options.mapping) {
    try {
      mapping = loadMappingFile(options.mapping, io.cwd);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
  const built = await buildPlan({ command, targets: parsed.targets, options, browserVersion, ctx: { cwd: io.cwd, fetch: io.fetch, npmView: io.npmView } });
  if (mapping) {
    const ids = new Set(built.targets.map((t) => t.id));
    const unknown = Object.keys(mapping).filter((id) => !ids.has(id));
    if (unknown.length) throw new UsageError(`The mapping has entries for ${unknown.join(", ")}, which ${unknown.length === 1 ? "isn't" : "aren't"} a target in this run. Targets here: ${[...ids].join(", ")}.`);
    for (const target of built.targets) target.mapping = mapping[target.id] ?? null;
  }
  const plan = parsePlan(built);
  return executePlan(plan, { planOnly: parsed.planOnly }, io);
}

/** `run --plan <file>`: re-run a saved plan. */
export async function runSavedPlan(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: { plan: { type: "string" }, help: { type: "boolean", short: "h" } }, allowPositionals: false, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.split(". ")[0] : String(error));
  }
  if (parsed.values.help) {
    io.stdout.write(usage("run"));
    return EXIT.OK;
  }
  const file = parsed.values.plan;
  if (!file) throw new UsageError("run needs --plan <plan.json>.");
  let plan;
  try {
    plan = parsePlan(JSON.parse(readFileSync(resolve(io.cwd, file), "utf8")));
  } catch (error) {
    throw new UsageError(`Can't read the plan ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return executePlan(plan, { planOnly: false, savedPlanPath: file }, io);
}

const FLAGS = `Options:
  --wcag <2.0|2.1|2.2>        WCAG version. Default 2.2.
  --level <A|AA|AAA>          Conformance level. Default AA.
  --tiers <list>              rules, interactions, computed, conditions, vsr. Default all five.
  --engine <list>             axe, ibm. Default both.
  --archetypes <list>         Limit npm and Storybook targets to these archetypes.
  --lib-a11y <list>           on, off. Default both.
  --mapping <file>            Archetype mapping file.
  --max-stories <n>           Storybook story cap. Default 200.
  --no-generate               Don't build fixtures for npm packages. Only authored fixtures and the button and link templates run.
  --plan                      Resolve and print the plan, then stop.
  --out <dir>                 Output directory. Default ./a11y-report.
  --fail-on-axe <impact>      minor, moderate, serious, or critical.
  --fail-on-ibm <level>       1, 2, or 3 (IBM Toolkit level).
  --fail-mode <any|all>       How to combine fail checks. Default any.
`;

/** @param {string} [command] */
export function usage(command) {
  const header = {
    audit: "Usage: automatica11y audit <target> [options]\n\nCheck how accessible one target is.\n\n",
    compare: "Usage: automatica11y compare <target> <target> [<target>...] [options]\n\nCompare two or more targets.\n\n",
    run: "Usage: automatica11y run --plan <plan.json>\n\nRe-run a saved plan.\n",
  }[command ?? ""];
  if (command === "run") return header;
  if (header) {
    return `${header}A target is [label=]<spec>. A spec is an http(s) URL, an npm package written npm:name, or a path. A path with no prefix is relative to the working folder, so "button" means the folder ./button.\n\n${FLAGS}`;
  }
  return `Usage:
  automatica11y audit <target> [options]
  automatica11y compare <target> <target> [<target>...] [options]
  automatica11y run --plan <plan.json>
  automatica11y doctor
  automatica11y guide [agents|skill|fixtures]
  automatica11y --version

Run a command with --help for its options.
`;
}
