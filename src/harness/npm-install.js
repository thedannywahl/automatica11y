import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NPM_FLAGS = ["--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline", "--loglevel=error"];

/** Run npm in `cwd`. Resolves with stdout and rejects with npm's own words. */
export function runNpm(args, cwd, { timeoutMs = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.platform === "win32" ? "npm.cmd" : "npm",
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(new Error(`${stderr}\n${stdout}`.trim() || error.message), { code: "NPM_FAILED" }));
        else resolve(stdout);
      },
    );
  });
}

/** npm's local copy of a package list can lag behind the registry, so a version that exists looks missing. */
const STALE_CACHE = /ETARGET|notarget|No matching version/i;

/** The version of an installed package, or null. */
export function installedVersion(dir, name) {
  try {
    return JSON.parse(readFileSync(join(dir, "node_modules", name, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Install a package into its own directory, never next to another target's install.
 * npm adds the peer dependencies. A React package also needs react-dom, so add it when the peers left it out.
 * Install scripts stay off, because the code is untrusted until it runs in the browser sandbox.
 * @param {{ dir: string, name: string, version: string, flavor: "react" | "wc" | "unknown", run?: typeof runNpm }} options
 */
export async function installPackage({ dir, name, version, flavor, run = runNpm }) {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, "package.json"))) writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "automatica11y-target", private: true }));
  /** @type {string[]} */
  const warnings = [];
  let refreshed = false;
  /** Run npm. If it says a version doesn't exist, ask once more with fresh package data, since the version came from the registry. */
  const npm = async (args) => {
    try {
      return await run(args, dir);
    } catch (error) {
      if (!STALE_CACHE.test(String(error.message)) || !args.includes("--prefer-offline")) throw error;
      if (!refreshed) warnings.push(`npm's local list of ${name} versions was out of date, so the install refreshed it and tried again.`);
      refreshed = true;
      return run(args.map((arg) => (arg === "--prefer-offline" ? "--prefer-online" : arg)), dir);
    }
  };
  try {
    await npm(["install", `${name}@${version}`, ...NPM_FLAGS]);
  } catch (error) {
    if (!/ERESOLVE|peer dep/i.test(String(error.message))) throw new Error(`npm couldn't install ${name}@${version}: ${firstLine(error.message)}`);
    await npm(["install", `${name}@${version}`, "--legacy-peer-deps", ...NPM_FLAGS]).catch((retry) => {
      throw new Error(`npm couldn't install ${name}@${version}: ${firstLine(retry.message)}`);
    });
    warnings.push(`npm couldn't satisfy ${name}'s peer dependencies, so it installed them loosely (--legacy-peer-deps). Results may not match a supported setup.`);
  }
  if (flavor === "react") {
    const react = installedVersion(dir, "react");
    if (!react) {
      await npm(["install", "react", "react-dom", ...NPM_FLAGS, "--legacy-peer-deps"]);
      warnings.push(`${name} didn't bring in react, so the latest react and react-dom were added.`);
    } else if (!installedVersion(dir, "react-dom")) {
      await npm(["install", `react-dom@${react}`, ...NPM_FLAGS, "--legacy-peer-deps"]);
    }
  }
  return { dir, warnings, react: installedVersion(dir, "react"), reactDom: installedVersion(dir, "react-dom"), version: installedVersion(dir, name) };
}

function firstLine(text) {
  return String(text).split("\n").find((line) => line.trim())?.replace(/^npm (error|ERR!)\s*/i, "").trim() ?? "unknown error";
}
