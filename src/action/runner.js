import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FLAGS = ["config", "wcag", "level", "tiers", "engine", "archetypes", "lib-a11y", "mapping", "max-stories", "out", "fail-on-axe", "fail-on-ibm", "fail-mode", "fail-on-incomplete", "fail-on-review", "fail-on-checks", "server-command", "server-url", "server-timeout", "server-working-directory"];

/**
 * @param {Record<string, string | undefined>} inputs
 * @returns {string[]}
 */
export function inputArgs(inputs) {
  const args = [];
  for (const flag of FLAGS) if (inputs[flag]?.trim()) args.push(`--${flag}`, inputs[flag].trim());
  for (const source of (inputs["local-packages"] ?? "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) args.push("--local-package", source);
  if (inputs.generate?.trim()) {
    if (!["true", "false"].includes(inputs.generate)) throw new Error("generate must be true or false.");
    args.push(inputs.generate === "true" ? "--generate" : "--no-generate");
  }
    if (inputs.screenshots?.trim()) {
      if (!["true", "false"].includes(inputs.screenshots)) throw new Error("screenshots must be true or false.");
      args.push(inputs.screenshots === "true" ? "--screenshots" : "--no-screenshots");
    }
  const targets = (inputs.targets ?? "").split(/\r?\n/).map((target) => target.trim()).filter(Boolean);
  return [...args, "--", ...targets];
}

/**
 * @param {Record<string, unknown>} values
 * @param {string | undefined} file
 */
export function writeOutputs(values, file) {
  if (!file) return;
  for (const [key, value] of Object.entries(values)) {
    const delimiter = `automatica11y_${randomUUID()}`;
    appendFileSync(file, `${key}<<${delimiter}\n${String(value)}\n${delimiter}\n`);
  }
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {import("node:child_process").SpawnOptions} options
 * @returns {Promise<number>}
 */
export function execute(file, args, options) {
  return new Promise((done, reject) => {
    const child = spawn(file, args, { ...options, shell: false, stdio: "inherit" });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const cleanup = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code, signal) => { cleanup(); done(code ?? (signal === "SIGINT" ? 130 : 143)); });
  });
}

export async function installTool(env = process.env) {
  if (env.RUNNER_OS !== "Linux" || !/^ID=ubuntu$/m.test(readFileSync("/etc/os-release", "utf8"))) throw new Error("The automatica11y Action currently supports Ubuntu runners only.");
  const root = env.GITHUB_ACTION_PATH;
  if (!root || !env.RUNNER_TEMP) throw new Error("Missing GitHub Action runtime paths.");
  const tool = mkdtempSync(join(env.RUNNER_TEMP, "automatica11y-"));
  for (const path of ["package.json", "package-lock.json", "bin", "src"]) cpSync(join(root, path), join(tool, path), { recursive: true });
  const code = await execute("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tool, env });
  if (code !== 0) throw new Error(`Action dependency installation exited ${code}.`);
  writeOutputs({ "tool-path": tool }, env.GITHUB_OUTPUT);
  return tool;
}

/** @param {string | undefined} input @param {boolean} fallback @param {string} name */
function booleanInput(input, fallback, name) {
  if (!input?.trim()) return fallback;
  if (!["true", "false"].includes(input)) throw new Error(`${name} must be true or false.`);
  return input === "true";
}

/**
 * @param {Record<string, string | undefined>} inputs
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ run?: typeof execute, installBrowser?: boolean, root?: string }} [deps]
 */
export async function runAudit(inputs, env = process.env, { run = execute, installBrowser = true, root = ROOT } = {}) {
  const { parseRunArgs, UsageError } = await import("../commands/common.js");
  let code = 2;
  let out = "";
  let parsed;
  let settings = { upload: true, name: "automatica11y-report", retention: "", summary: true };
  try {
    const cwd = resolve(env.GITHUB_WORKSPACE ?? process.cwd(), inputs["working-directory"] || ".");
    const args = inputArgs(inputs);
    parsed = parseRunArgs("ci", args, { cwd });
    const artifacts = parsed.config.artifacts ?? {};
    settings = {
      upload: booleanInput(inputs["upload-artifact"], artifacts.enabled ?? true, "upload-artifact"),
      name: inputs["artifact-name"]?.trim() || artifacts.name || "automatica11y-report",
      retention: inputs["artifact-retention-days"]?.trim() || String(artifacts.retentionDays ?? ""),
      summary: booleanInput(inputs.summary, parsed.config.summary ?? true, "summary"),
    };
    if (/[\\/":<>|*?\r\n]/.test(settings.name)) throw new UsageError("artifact-name contains unsupported characters.");
    if (settings.retention && (!/^\d+$/.test(settings.retention) || Number(settings.retention) < 1 || Number(settings.retention) > 90)) throw new UsageError("artifact-retention-days must be an integer from 1 to 90.");
    const requested = resolve(cwd, parsed.options.out);
    if (existsSync(requested) && readdirSync(requested).length) throw new UsageError("The Action output directory must be empty or absent. Use a unique out directory to prevent stale report uploads.");
    mkdirSync(requested, { recursive: true });
    out = requested;
    const browserPath = join(root, "browsers");
    const runtimeEnv = /** @type {NodeJS.ProcessEnv} */ ({ ...env, PLAYWRIGHT_BROWSERS_PATH: browserPath });
    code = 3;
    if (installBrowser) {
      code = Number(await run(process.execPath, [join(root, "node_modules/playwright-core/cli.js"), "install", "--with-deps", "--only-shell", "chromium"], { cwd: root, env: runtimeEnv }));
      if (code !== 0) throw new Error(`Browser installation exited ${code}.`);
      const { findBrowser } = await import("../env/browser.js");
      const { browser } = await findBrowser({ env: { ...runtimeEnv, PATH: "", AUTOMATICA11Y_CHROME: "" } });
      if (!browser) throw new Error("The installed Playwright headless shell was not found.");
      runtimeEnv.AUTOMATICA11Y_CHROME = browser.path;
    }
    const cli = join(root, "bin/automatica11y.js");
    code = Number(await run(process.execPath, [cli, "doctor"], { cwd, env: runtimeEnv }));
    if (code === 0) code = Number(await run(process.execPath, [cli, "ci", ...args], { cwd, env: runtimeEnv }));
  } catch (error) {
    if (error instanceof UsageError || code === 2) code = 2;
    else code = 3;
    console.error(error.message);
  }
  const report = out && existsSync(join(out, "report.md")) ? join(out, "report.md") : "";
  const results = out && existsSync(join(out, "results.json")) ? join(out, "results.json") : "";
  const artifactPath = out && readdirSync(out).length ? out : "";
  const status = code === 0 ? "passed" : code === 5 ? "incomplete" : code === 1 ? "failed" : "error";
  const outputs = { "exit-code": code, outcome: status, "report-path": report, "results-path": results, "artifact-path": artifactPath, "upload-artifact": settings.upload, "artifact-name": settings.name, "artifact-retention-days": settings.retention };
  writeOutputs(outputs, env.GITHUB_OUTPUT);
  if (settings.summary && env.GITHUB_STEP_SUMMARY) {
    let text = `## automatica11y\n\nOutcome: **${status}** (exit ${code}).\n\n`;
    if (results) {
      /** @type {import("../types.js").Results} */
      const data = JSON.parse(readFileSync(results, "utf8"));
      for (const engine of parsed.options.engines) {
        const count = data.targets.reduce((total, target) => total + (target.summary.engines[engine]?.violations ?? 0), 0);
        text += `${engine}: ${count} automated violations.\n\n`;
      }
      if (data.outcome) text += `Coverage gaps: ${data.outcome.coverage.length}. Review findings: ${data.outcome.review.length}. Non-rule failures: ${data.outcome.checks.length}.\n\n`;
    } else text += "No results were produced. See the step diagnostics.\n\n";
    if (artifactPath && settings.upload) text += "Reports are uploaded as a workflow artifact.\n";
    appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  }
  return outputs;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "install") await installTool();
  else if (mode === "run") {
    const token = randomUUID();
    console.log(`::stop-commands::${token}`);
    try { await runAudit(JSON.parse(process.env.AUTOMATICA11Y_INPUTS ?? "{}")); }
    finally { console.log(`::${token}::`); }
  } else if (mode === "finish") {
    const code = Number(process.env.AUTOMATICA11Y_EXIT_CODE);
    process.exitCode = Number.isInteger(code) && code >= 0 && code <= 255 ? code : 3;
  } else throw new Error("Expected install, run, or finish.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 3; });
}