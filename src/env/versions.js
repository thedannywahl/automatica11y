import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** The packages whose resolved versions every plan and results file records. */
const TOOL_PACKAGES = {
  "axe-core": "axe-core",
  "ibm-checker-engine": "accessibility-checker-engine",
  "playwright-core": "playwright-core",
  esbuild: "esbuild",
  "guidepup-vsr": "@guidepup/virtual-screen-reader",
};

/**
 * Read an installed package's version without importing the package itself.
 * @param {string} name
 * @returns {string | null} The version, or null when the package isn't installed.
 */
export function readPackageVersion(name) {
  try {
    return JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version ?? null;
  } catch {
    // The package may hide its package.json behind an exports map. Walk up from its entry file.
  }
  try {
    let dir = dirname(require.resolve(name));
    for (let depth = 0; depth < 6; depth += 1) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        if (pkg.name === name) return pkg.version ?? null;
      } catch {
        // Keep walking.
      }
      dir = dirname(dir);
    }
  } catch {
    // Not installed.
  }
  return null;
}

/** Version of automatica11y itself. */
export function ownVersion() {
  const url = new URL("../../package.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).version;
}

/**
 * Resolved versions of every tool, keyed the way plan.json and results.json record them.
 * @param {{ chromium?: string | null }} [extra]
 */
export function readToolVersions(extra = {}) {
  /** @type {Record<string, string | null>} */
  const tools = { node: process.versions.node, automatica11y: ownVersion() };
  for (const [key, pkg] of Object.entries(TOOL_PACKAGES)) tools[key] = readPackageVersion(pkg);
  tools.chromium = extra.chromium ?? null;
  return tools;
}
