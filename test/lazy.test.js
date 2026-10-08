import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { makeFakeBrowser, makeTree } from "./helpers/fixtures.js";

const HEAVY = /playwright|esbuild|axe-core|accessibility-checker|guidepup/;
const bin = new URL("../bin/automatica11y.js", import.meta.url).pathname;
const register = new URL("./helpers/trace-register.mjs", import.meta.url).href;

/** Run the CLI in a child process and return every specifier it resolved. */
function trace(args, extraEnv = {}) {
  const dir = makeTree({ "page.html": "<h1>Hi</h1>" });
  const traceFile = join(dir, "trace.txt");
  try {
    execFileSync(process.execPath, ["--import", register, bin, ...args], {
      cwd: dir,
      env: { ...process.env, TRACE_FILE: traceFile, ...extraEnv },
      stdio: "pipe",
    });
  } catch {
    // Exit codes don't matter here. Only the import trace does.
  }
  return readFileSync(traceFile, "utf8").split("\n").filter(Boolean);
}

test("the trace helper sees imports", () => {
  const seen = trace(["--version"]);
  assert.ok(seen.some((s) => s.includes("cli.js")), "expected the trace to include cli.js");
});

test("--version, doctor, guide, and audit --plan never import heavy packages", () => {
  const env = { AUTOMATICA11Y_CHROME: process.platform === "win32" ? "" : makeFakeBrowser() };
  for (const args of [["--version"], ["doctor"], ["guide"], ["guide", "skill"], ["audit", "./page.html", "--plan"], ["compare", "./page.html", "react", "--plan"]]) {
    const heavy = trace(args, env).filter((s) => HEAVY.test(s));
    assert.deepEqual(heavy, [], `${args.join(" ")} imported ${heavy.join(", ")}`);
  }
});
