import { parseArgs } from "node:util";
import { installBrowser } from "../env/browser.js";
import { checkEnvironment } from "../env/check.js";
import { EXIT, UsageError } from "./common.js";

/**
 * One name for what `doctor` found, so an agent can act on it without reading the prose.
 * @typedef {"ok" | "node-unsupported" | "browser-missing" | "browser-outdated" | "install-failed-no-browser" | "install-failed-outdated" | "other"} DoctorState
 */

/**
 * @param {Awaited<ReturnType<typeof checkEnvironment>>} result
 * @param {{ attempted: boolean, ok: boolean | null }} install
 * @returns {DoctorState}
 */
export function doctorState(result, install) {
  if (result.ok) return "ok";
  const ids = new Set(result.problems.map((p) => p.id));
  if (ids.has("node")) return "node-unsupported";
  const failed = install.attempted && install.ok === false;
  if (ids.has("browser")) return failed ? "install-failed-no-browser" : "browser-missing";
  if (ids.has("browser-old")) return failed ? "install-failed-outdated" : "browser-outdated";
  return "other";
}

/** @param {string[]} argv @param {import("./common.js").Io} io */
export async function doctorCommand(argv, io) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { "install-browser": { type: "boolean" }, json: { type: "boolean" } }, strict: true }));
  } catch (error) {
    throw new UsageError(/** @type {Error} */ (error).message);
  }
  const json = values.json === true;
  const check = () => checkEnvironment({ env: io.env, platform: io.platform });
  let result = await check();
  /** @type {{ attempted: boolean, ok: boolean | null, output: string }} */
  const install = { attempted: false, ok: null, output: "" };
  const browserProblem = result.problems.some((p) => p.id === "browser" || p.id === "browser-old");
  if (values["install-browser"] && browserProblem) {
    if (!json) io.stdout.write("Downloading Chromium (this can take a minute)...\n");
    const outcome = await (io.installBrowser ?? installBrowser)();
    Object.assign(install, { attempted: true, ok: outcome.ok, output: outcome.output ?? "" });
    if (!outcome.ok && !json) io.stderr.write(`\nThe Chromium download failed.\n${outcome.output}\n`);
    result = await check();
  }
  if (json) {
    const report = {
      ok: result.ok,
      state: doctorState(result, install),
      node: result.node,
      browser: result.browser ? { kind: result.browser.kind, version: result.browser.version ?? null, path: result.browser.path, outdated: result.problems.some((p) => p.id === "browser-old") } : null,
      install,
      problems: result.problems,
    };
    io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return result.ok ? EXIT.OK : EXIT.ENVIRONMENT;
  }
  const lines = ["automatica11y doctor"];
  const nodeProblem = result.problems.find((p) => p.id === "node");
  lines.push(`  Node     ${result.node}  ${nodeProblem ? "problem" : "ok"}`);
  if (result.browser) {
    const { kind, version, path } = result.browser;
    const old = result.problems.some((p) => p.id === "browser-old");
    lines.push(`  Browser  ${kind}${version ? ` ${version}` : ""}  ${old ? "problem" : "ok"}`, `           ${path}`);
  } else {
    lines.push("  Browser  not found  problem");
  }
  io.stdout.write(`${lines.join("\n")}\n`);
  if (result.ok) return EXIT.OK;
  for (const problem of result.problems) io.stderr.write(`\n${problem.message}\n  Fix: ${problem.fix}\n`);
  return EXIT.ENVIRONMENT;
}
