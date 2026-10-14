import { checkBrowser } from "./browser.js";
import { checkNode } from "./node.js";

/** @typedef {{ id: string, message: string, fix: string }} Problem */

/**
 * Check everything a real run needs. Used by `doctor` and by real runs.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, nodeVersion?: string }} [options]
 */
export async function checkEnvironment({ env = process.env, platform = process.platform, nodeVersion = process.versions.node } = {}) {
  const { browser, problems: browserProblems } = await checkBrowser({ env, platform });
  const problems = [...checkNode(nodeVersion), ...browserProblems];
  return { ok: problems.length === 0, node: nodeVersion, browser, problems };
}
