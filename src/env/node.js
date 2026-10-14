export const MIN_NODE_MAJOR = 22;

/**
 * Check that the running Node is new enough.
 * @param {string} [nodeVersion]
 * @returns {import("./check.js").Problem[]}
 */
export function checkNode(nodeVersion = process.versions.node) {
  const major = Number(nodeVersion.split(".")[0]);
  if (major >= MIN_NODE_MAJOR) return [];
  return [{ id: "node", message: `Node ${nodeVersion} is too old. automatica11y needs Node ${MIN_NODE_MAJOR} or newer.`, fix: `Install Node ${MIN_NODE_MAJOR} or newer from https://nodejs.org.` }];
}
