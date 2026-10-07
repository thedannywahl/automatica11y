import { checkEnvironment } from "../env/browser.js";
import { EXIT } from "./common.js";

/** @param {string[]} _argv @param {import("./common.js").Io} io */
export async function doctorCommand(_argv, io) {
  const result = await checkEnvironment({ env: io.env, platform: io.platform });
  const lines = ["automatica11y doctor"];
  const nodeProblem = result.problems.find((p) => p.id === "node");
  lines.push(`  Node     ${result.node}  ${nodeProblem ? "problem" : "ok"}`);
  if (result.browser) {
    const { kind, version, path } = result.browser;
    lines.push(`  Browser  ${kind}${version ? ` ${version}` : ""}  ok`, `           ${path}`);
  } else {
    lines.push("  Browser  not found  problem");
  }
  io.stdout.write(`${lines.join("\n")}\n`);
  if (result.ok) return EXIT.OK;
  for (const problem of result.problems) io.stderr.write(`\n${problem.message}\n  Fix: ${problem.fix}\n`);
  return EXIT.ENVIRONMENT;
}
