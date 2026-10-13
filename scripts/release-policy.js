import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { updateRunnerSkillVersion } from "./sync-release-version.js";

const releaseTitle = "chore: release packages";
const runtimeFields = ["name", "version", "description", "license", "type", "main", "module", "types", "exports", "imports", "bin", "files", "engines", "dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "overrides", "publishConfig", "sideEffects"];

/** @param {Record<string, unknown>} manifest */
export function runtimeManifest(manifest) {
  return Object.fromEntries(runtimeFields.filter((field) => Object.hasOwn(manifest, field)).map((field) => [field, manifest[field]]));
}

/** @param {{ repository: string, headRepository: string, head: string, base: string, actor: string, title: string }} context @param {string} releaseActor */
export function isVersionPullRequest(context, releaseActor) {
  const reserved = context.head.startsWith("changeset-release/") || context.title.toLowerCase().startsWith(releaseTitle);
  if (!reserved) return false;
  assert.ok(releaseActor, "Configure RELEASE_ACTOR before accepting generated version PRs.");
  assert.equal(context.headRepository, context.repository, "Release PR must originate in this repository.");
  assert.equal(context.head, "changeset-release/main", "Release PR must use the exact reserved branch.");
  assert.equal(context.base, "main");
  assert.equal(context.actor, releaseActor, "Release PR must be authored by RELEASE_ACTOR.");
  assert.equal(context.title, releaseTitle);
  return true;
}

/** @param {string[]} paths @param {Record<string, unknown>} before @param {Record<string, unknown>} after */
export function requiresChangeset(paths, before, after) {
  return paths.some((path) => /^(?:src\/|bin\/|skills\/|action\.yml$|AGENTS\.md$|README\.md$|LICENSE$)/.test(path))
    || !isDeepStrictEqual(runtimeManifest(before), runtimeManifest(after));
}

/** @param {{ packages: Record<string, Record<string, unknown>> }} lock */
export function productionLock(lock) {
  return Object.fromEntries(Object.entries(lock.packages).filter(([path, entry]) => path === "" || entry.dev !== true)
    .map(([path, entry]) => [path, path === "" ? runtimeManifest(entry) : entry]));
}

/** @param {string} output */
export function validateTestSummary(output) {
  const skipped = [...output.matchAll(/(?:\u2139|#)\s*skipped (\d+)/g)].at(-1)?.[1];
  assert.equal(skipped, "1", "CI permits only the one known VitePress skip; missing-browser or additional skips block release.");
  assert.match(output, /Known upstream VitePress issue/, "The sole skip must be the acknowledged upstream assertion.");
}

/** @param {{ status: string, path: string }[]} changes @param {(ref: string, path: string) => string} read @param {string} base @param {string} head */
export function validateVersionDiff(changes, read, base, head) {
  const before = JSON.parse(read(base, "package.json"));
  const after = JSON.parse(read(head, "package.json"));
  assert.match(after.version, /^\d+\.\d+\.\d+$/, "Release version must be stable semver.");
  assert.notEqual(before.version, after.version, "Release PR must bump the version.");
  assert.deepEqual({ ...before, version: after.version }, after, "Release PR may only change the manifest version.");
  for (const { status, path } of changes) {
    if (/^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(path)) {
      assert.equal(status, "D", "Release PR may only consume Changesets.");
    } else {
      assert.ok(["package.json", "package-lock.json", "CHANGELOG.md", "skills/automatica11y-runner/SKILL.md"].includes(path), "Unexpected release PR file: " + path);
    }
  }
  const lockBefore = JSON.parse(read(base, "package-lock.json"));
  const lockAfter = JSON.parse(read(head, "package-lock.json"));
  lockBefore.version = after.version;
  lockBefore.packages[""].version = after.version;
  assert.deepEqual(lockAfter, lockBefore, "Release PR must not alter locked dependencies.");
  const skill = "skills/automatica11y-runner/SKILL.md";
  assert.equal(read(head, skill), updateRunnerSkillVersion(read(base, skill), after.version));
  assert.ok(changes.some(({ path }) => path === "CHANGELOG.md"), "Release PR must include its changelog.");
}

function main() {
  if (process.argv[2] === "test-summary") {
    assert.equal(process.argv.length, 3, "Test summary accepts no file path arguments.");
    validateTestSummary(readFileSync("test-output.txt", "utf8"));
    return;
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  assert.ok(pr, "Release policy only accepts pull_request events.");
  const base = pr.base.sha;
  const head = pr.head.sha;
  assert.match(base, /^[a-f0-9]{40}$/);
  assert.match(head, /^[a-f0-9]{40}$/);
  /** @param {...string} args */
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const read = (/** @type {string} */ ref, /** @type {string} */ path) => git("show", ref + ":" + path);
  const entries = git("diff", "--no-renames", "--name-status", "-z", base, head).split("\0").filter(Boolean);
  const changes = Array.from({ length: entries.length / 2 }, (_, index) => ({ status: entries[index * 2], path: entries[index * 2 + 1] }));
  if (isVersionPullRequest({ repository: event.repository.full_name, headRepository: pr.head.repo?.full_name, head: pr.head.ref, base: pr.base.ref, actor: pr.user.login, title: pr.title }, process.env.RELEASE_ACTOR)) {
    validateVersionDiff(changes, read, base, head);
    console.log("Authenticated generated version PR: manifest, lockfile and skill are aligned.");
    return;
  }
  const before = JSON.parse(read(base, "package.json"));
  const after = JSON.parse(read(head, "package.json"));
  assert.equal(after.version, before.version, "Let Changesets generate version bumps rather than editing them in feature PRs.");
  const lockChanged = !isDeepStrictEqual(productionLock(JSON.parse(read(base, "package-lock.json"))), productionLock(JSON.parse(read(head, "package-lock.json"))));
  if (!requiresChangeset(changes.map(({ path }) => path), before, after) && !lockChanged) {
    console.log("Docs/internal-only PR: no package Changeset required.");
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), "automatica11y-release-policy-"));
  try {
    const output = join(temporary, "status.json");
    execFileSync("npm", ["exec", "--", "changeset", "status", "--since", base, "--output", output], { stdio: "inherit" });
    const { releases } = JSON.parse(readFileSync(output, "utf8"));
    assert.ok(releases.some((/** @type {{ name: string, type: string }} */ release) => release.name === after.name && ["patch", "minor", "major"].includes(release.type)), "Shipped changes require a nonempty Changeset for " + after.name + ".");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();