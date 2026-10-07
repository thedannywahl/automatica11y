import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

/** A stand-in browser: a shell script that prints a Chrome version. Unix only. */
export function makeFakeBrowser(version = "123.0.4567.89") {
  const root = makeTree();
  const path = join(root, "fake-chrome");
  writeFileSync(path, `#!/bin/sh\necho "Google Chrome ${version}"\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Collect what the CLI writes. */
export function makeIo(overrides = {}) {
  const out = { stdout: "", stderr: "" };
  return {
    out,
    io: {
      stdout: { write: (text) => (out.stdout += text) },
      stderr: { write: (text) => (out.stderr += text) },
      cwd: makeTree(),
      env: { PATH: "" },
      ...overrides,
    },
  };
}

/** A fetch stand-in. `routes` maps URL to { status, body }. Unlisted URLs fail like a dead host. */
export function fakeFetch(routes) {
  return async (input) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`getaddrinfo ENOTFOUND (${url})`);
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => route.body ?? "" };
  };
}

export const STORYBOOK_INDEX = JSON.stringify({ v: 5, entries: { "button--primary": { id: "button--primary", title: "Button", type: "story" } } });
