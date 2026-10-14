import { parseArgs } from "node:util";
import { installBrowser } from "../env/browser.js";
import { checkEnvironment } from "../env/check.js";
import { EXIT, UsageError } from "./common.js";

/** @param {string[]} argv @param {import("./common.js").Io} io */
export async function doctorCommand(argv, io) {
  let installRequested;
  try {
    installRequested = parseArgs({ args: argv, options: { "install-browser": { type: "boolean" } }, strict: true }).values["install-browser"];
  } catch (error) {
    throw new UsageError(/** @type {Error} */ (error).message);
  }
  const check = () => checkEnvironment({ env: io.env, platform: io.platform });
  let result = await check();
  const browserProblem = result.problems.some((p) => p.id === "browser" || p.id === "browser-old");
  if (installRequested && browserProblem) {
    io.stdout.write("Downloading Chromium (this can take a minute)...\n");
    const install = await (io.installBrowser ?? installBrowser)();
    if (!install.ok) io.stderr.write(`\nThe Chromium download failed.\n${install.output}\n`);
    result = await check();
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
