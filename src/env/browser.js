import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const INSTALL_COMMAND = "npx playwright-core install --only-shell chromium";
export const BROWSER_ENV_VAR = "AUTOMATICA11Y_CHROME";
export const MIN_NODE_MAJOR = 20;

/**
 * @typedef {{ kind: "chrome" | "chromium" | "headless-shell" | "custom", path: string, version: string | null }} Browser
 * @typedef {{ id: string, message: string, fix: string }} Problem
 */

/** Known install locations for Chrome and Chromium, by platform. */
function candidatePaths(platform, env) {
  if (platform === "darwin") {
    return [
      { kind: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { kind: "chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
    ];
  }
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return roots.map((root) => ({ kind: "chrome", path: join(/** @type {string} */ (root), "Google", "Chrome", "Application", "chrome.exe") }));
  }
  const names = [
    ["chrome", "google-chrome"],
    ["chrome", "google-chrome-stable"],
    ["chromium", "chromium"],
    ["chromium", "chromium-browser"],
  ];
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  return names.flatMap(([kind, name]) => dirs.map((dir) => ({ kind, path: join(dir, name) })));
}

/** Where Playwright keeps the browsers `playwright-core install` downloads. */
function playwrightCacheDir(platform, env) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") return env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform === "darwin") return join(homedir(), "Library", "Caches", "ms-playwright");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ms-playwright");
  return join(homedir(), ".cache", "ms-playwright");
}

/** Find a headless shell that `playwright-core install --only-shell chromium` downloaded. */
function findHeadlessShell(platform, env) {
  const root = playwrightCacheDir(platform, env);
  const names = new Set(["chrome-headless-shell", "chrome-headless-shell.exe", "headless_shell"]);
  /** @param {string} dir @param {number} depth @returns {string | null} */
  const search = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (entry.isFile() && names.has(entry.name)) return join(dir, entry.name);
    }
    if (depth === 0) return null;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = search(join(dir, entry.name), depth - 1);
        if (found) return found;
      }
    }
    return null;
  };
  let shells;
  try {
    shells = readdirSync(root).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse();
  } catch {
    return null;
  }
  for (const shell of shells) {
    const found = search(join(root, shell), 3);
    if (found) return found;
  }
  return null;
}

/** @param {string} path @returns {Promise<string | null>} */
function readVersion(path) {
  return new Promise((resolve) => {
    execFile(path, ["--version"], { timeout: 5000 }, (error, stdout) => {
      const match = error ? null : /(\d+\.\d+\.\d+\.\d+)/.exec(stdout);
      resolve(match ? match[1] : null);
    });
  });
}

/**
 * Find a browser we can drive. Prefers an explicit override, then installed Chrome or Chromium,
 * then the Playwright headless shell. Never imports Playwright.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform }} [options]
 * @returns {Promise<{ browser: Browser | null, problem: Problem | null }>}
 */
export async function findBrowser({ env = process.env, platform = process.platform } = {}) {
  const override = env[BROWSER_ENV_VAR];
  if (override) {
    if (!existsSync(override)) {
      return {
        browser: null,
        problem: { id: "browser", message: `${BROWSER_ENV_VAR} points to a file that doesn't exist: ${override}`, fix: `Fix or unset ${BROWSER_ENV_VAR}, or run: ${INSTALL_COMMAND}` },
      };
    }
    return { browser: { kind: "custom", path: override, version: await readVersion(override) }, problem: null };
  }
  for (const candidate of candidatePaths(platform, env)) {
    if (existsSync(candidate.path)) {
      return { browser: { kind: /** @type {"chrome" | "chromium"} */ (candidate.kind), path: candidate.path, version: await readVersion(candidate.path) }, problem: null };
    }
  }
  const shell = findHeadlessShell(platform, env);
  if (shell) return { browser: { kind: "headless-shell", path: shell, version: await readVersion(shell) }, problem: null };
  return {
    browser: null,
    problem: { id: "browser", message: "No Chrome or Chromium found.", fix: `Install Chrome, or run: ${INSTALL_COMMAND}` },
  };
}

/**
 * Check everything a real run needs. Used by `doctor` and by real runs.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, nodeVersion?: string }} [options]
 */
export async function checkEnvironment({ env = process.env, platform = process.platform, nodeVersion = process.versions.node } = {}) {
  /** @type {Problem[]} */
  const problems = [];
  const major = Number(nodeVersion.split(".")[0]);
  if (!(major >= MIN_NODE_MAJOR)) {
    problems.push({ id: "node", message: `Node ${nodeVersion} is too old. automatica11y needs Node ${MIN_NODE_MAJOR} or newer.`, fix: `Install Node ${MIN_NODE_MAJOR} or newer from https://nodejs.org.` });
  }
  const { browser, problem } = await findBrowser({ env, platform });
  if (problem) problems.push(problem);
  return { ok: problems.length === 0, node: nodeVersion, browser, problems };
}
