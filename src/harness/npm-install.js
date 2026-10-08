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
  try {
    await run(["install", `${name}@${version}`, ...NPM_FLAGS], dir);
  } catch (error) {
    if (!/ERESOLVE|peer dep/i.test(String(error.message))) throw new Error(`npm couldn't install ${name}@${version}: ${firstLine(error.message)}`);
    await run(["install", `${name}@${version}`, "--legacy-peer-deps", ...NPM_FLAGS], dir).catch((retry) => {
      throw new Error(`npm couldn't install ${name}@${version}: ${firstLine(retry.message)}`);
    });
    warnings.push(`npm couldn't satisfy ${name}'s peer dependencies, so it installed them loosely (--legacy-peer-deps). Results may not match a supported setup.`);
  }
  if (flavor === "react") {
    const react = installedVersion(dir, "react");
    if (!react) {
      await run(["install", "react", "react-dom", ...NPM_FLAGS, "--legacy-peer-deps"], dir);
      warnings.push(`${name} didn't bring in react, so the latest react and react-dom were added.`);
    } else if (!installedVersion(dir, "react-dom")) {
      await run(["install", `react-dom@${react}`, ...NPM_FLAGS, "--legacy-peer-deps"], dir);
    }
  }
  return { dir, warnings, react: installedVersion(dir, "react"), reactDom: installedVersion(dir, "react-dom"), version: installedVersion(dir, name) };
}

function firstLine(text) {
  return String(text).split("\n").find((line) => line.trim())?.replace(/^npm (error|ERR!)\s*/i, "").trim() ?? "unknown error";
}
