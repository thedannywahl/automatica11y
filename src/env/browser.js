import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const INSTALL_COMMAND = "npx playwright-core install --only-shell chromium";
export const BROWSER_ENV_VAR = "AUTOMATICA11Y_CHROME";
/** How many major versions behind the Chromium that Playwright ships a browser may be. */
export const CHROME_MAJOR_WINDOW = 2;

const require = createRequire(import.meta.url);

/** Folder of the installed playwright-core, found without importing it. */
function playwrightDir() {
  return dirname(require.resolve("playwright-core/package.json"));
}

/**
 * The oldest Chrome or Chromium major version we accept: the one Playwright ships, minus the window.
 * Read from Playwright's browser list, so it moves with the pinned playwright-core.
 * @returns {number | null} Null when the list can't be read.
 */
export function minChromeMajor() {
  try {
    const { browsers } = JSON.parse(readFileSync(join(playwrightDir(), "browsers.json"), "utf8"));
    const shipped = Number(browsers.find((/** @type {{ name: string }} */ b) => b.name === "chromium")?.browserVersion?.split(".")[0]);
    return Number.isFinite(shipped) ? shipped - CHROME_MAJOR_WINDOW : null;
  } catch {
    return null;
  }
}

/**
 * Download the Playwright headless shell, using the playwright-core this tool depends on.
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
export function installBrowser() {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(playwrightDir(), "cli.js"), "install", "--only-shell", "chromium"], { timeout: 600000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}${stderr}`.trim() || (error?.message ?? "") });
    });
  });
}

/**
 * @typedef {{ kind: "chrome" | "chromium" | "headless-shell" | "custom", path: string, version: string | null }} Browser
 */

/**
 * Known install locations for Chrome and Chromium, by platform.
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ kind: string, path: string }[]}
 */
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

/**
 * Where Playwright keeps the browsers `playwright-core install` downloads.
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 */
function playwrightCacheDir(platform, env) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") return env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform === "darwin") return join(homedir(), "Library", "Caches", "ms-playwright");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ms-playwright");
  return join(homedir(), ".cache", "ms-playwright");
}

/**
 * Find a headless shell that `playwright-core install --only-shell chromium` downloaded.
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
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

/** @param {Browser} browser @param {number} minMajor */
function isTooOld(browser, minMajor) {
  return browser.version !== null && Number(browser.version.split(".")[0]) < minMajor;
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
 * @returns {Promise<{ browser: Browser | null, problem: import("./check.js").Problem | null }>}
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
  const minMajor = minChromeMajor();
  /** @type {Browser | null} */
  let tooOld = null;
  for (const candidate of candidatePaths(platform, env)) {
    if (existsSync(candidate.path)) {
      const browser = { kind: /** @type {"chrome" | "chromium"} */ (candidate.kind), path: candidate.path, version: await readVersion(candidate.path) };
      if (minMajor === null || !isTooOld(browser, minMajor)) return { browser, problem: null };
      tooOld ??= browser;
    }
  }
  const shell = findHeadlessShell(platform, env);
  if (shell) return { browser: { kind: "headless-shell", path: shell, version: await readVersion(shell) }, problem: null };
  if (tooOld) return { browser: tooOld, problem: null };
  return {
    browser: null,
    problem: { id: "browser", message: "No Chrome or Chromium found.", fix: `Install Chrome, or run: ${INSTALL_COMMAND}` },
  };
}

/**
 * Find a browser and check that it is recent enough.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform }} [options]
 */
export async function checkBrowser({ env = process.env, platform = process.platform } = {}) {
  /** @type {import("./check.js").Problem[]} */
  const problems = [];
  const { browser, problem } = await findBrowser({ env, platform });
  if (problem) problems.push(problem);
  const minMajor = minChromeMajor();
  if (browser && minMajor !== null && isTooOld(browser, minMajor)) {
    problems.push({
      id: "browser-old",
      message: `${browser.kind} ${browser.version} is too old. automatica11y needs Chrome or Chromium ${minMajor} or newer.`,
      fix: `Update Chrome, or run: ${INSTALL_COMMAND}`,
    });
  }
  return { browser, problems };
}
