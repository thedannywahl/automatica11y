import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Make a temp directory tree from { "relative/path": "contents" }. */
export function makeTree(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "automatica11y-test-"));
  for (const [rel, contents] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, contents);
  }
  return root;
}

/** @param {string} cwd @param {string[]} parts */
export function reportPath(cwd, ...parts) {
  const root = join(cwd, "a11y-report");
  const runs = existsSync(root) ? readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "plan.json")))
    .sort((first, second) => {
      const firstTime = statSync(join(root, first.name, "plan.json"), { bigint: true }).mtimeNs;
      const secondTime = statSync(join(root, second.name, "plan.json"), { bigint: true }).mtimeNs;
      return firstTime < secondTime ? -1 : firstTime > secondTime ? 1 : 0;
    }) : [];
  return join(root, runs.at(-1)?.name ?? "", ...parts);
}

/** A stand-in browser: a shell script that prints a Chrome version. Unix only. */
export function makeFakeBrowser(version = "200.0.4567.89") {
  const root = makeTree();
  const path = join(root, "fake-chrome");
  writeFileSync(path, `#!/bin/sh\necho "Google Chrome ${version}"\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Collect CLI output. fastFixture and interactionConcurrency are explicit test-only options for reviewed fixtures. */
/** @param {Partial<import("../../src/commands/common.js").Io>} [overrides] */
export function makeIo(overrides = {}) {
  const out = { stdout: "", stderr: "" };
  /** @type {import("../../src/commands/common.js").Io} */
  const io = {
    stdout: { write: (text) => (out.stdout += text) },
    stderr: { write: (text) => (out.stderr += text) },
    cwd: makeTree(),
    env: { PATH: "" },
    ...overrides,
  };
  return {
    out,
    io,
  };
}

/**
 * A fetch stand-in. `routes` maps URL to { status, body }. Unlisted URLs fail like a dead host.
 * @param {Record<string, { status?: number, body?: string }>} routes
 */
export function fakeFetch(routes) {
  /** @param {string | URL} input */
  return async (input) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`getaddrinfo ENOTFOUND (${url})`);
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => route.body ?? "" };
  };
}

export const STORYBOOK_INDEX = JSON.stringify({ v: 5, entries: { "button--primary": { id: "button--primary", title: "Button", type: "story" } } });
