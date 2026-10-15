import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { updateEvalVersions, updateRunnerSkillVersion } from "../scripts/sync-release-version.js";
import { isVersionPullRequest, productionLock, requiresChangeset, validateTestSummary, validateVersionDiff } from "../scripts/release-policy.js";
import { trustedReleaseRun, validateDocsRequest, validateManualSource } from "../scripts/docs-deploy.js";
import { makeTree } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

/**
 * What `npm pack` would put in the tarball, without writing one.
 * @returns {{ files: { path: string, size: number }[] }}
 */
function packed() {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" });
  return JSON.parse(out)[0];
}

test("the package is ready to publish: public, MIT, ESM, Node 22 or newer", () => {
  assert.equal(pkg.name, "automatica11y");
  assert.equal(pkg.private, undefined, "private is gone, so npm will publish it");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=22");
  assert.equal(pkg.publishConfig.access, "public");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version, "package-lock root version matches package.json");
  assert.equal(lock.packages[""].version, pkg.version, "locked root package version matches package.json");
  assert.deepEqual(lock.packages[""].engines, pkg.engines, "locked root engines match package.json");
  assert.ok(pkg.description.length > 20);
  assert.deepEqual(Object.keys(pkg.bin), ["automatica11y", "a11y"]);
  assert.equal(pkg.bin.a11y, pkg.bin.automatica11y, "the short name runs the same file");
  assert.ok(existsSync(join(root, pkg.bin.automatica11y)));
  assert.match(readFileSync(join(root, pkg.bin.automatica11y), "utf8"), /^#!\/usr\/bin\/env node\n/);
  assert.ok(statSync(join(root, pkg.bin.automatica11y)).mode & 0o111, "the bin file is executable");
});

test("browser-heavy test files run with bounded concurrency in both test commands", () => {
  assert.ok(pkg.scripts.test.split(/\s+/).includes("--test-concurrency=2"), "limit browser contention without relaxing fixture deadlines");
  assert.equal(pkg.scripts["test:release"], "AUTOMATICA11Y_SKIP_VITEPRESS_A11Y=1 npm test");
});

test("release version sync updates all runner skill version checks", () => {
  const source = readFileSync(join(root, "skills/automatica11y-runner/SKILL.md"), "utf8");
  const updated = updateRunnerSkillVersion(source, "0.9.0");
  assert.match(updated, /automatica11y \*\*0\.9\.x\*\*/);
  assert.match(updated, /doesn't start with `0\.9\./);
  assert.match(updated, /series this copy expects \(`0\.9\.x`\)/);
  assert.doesNotMatch(updated, /0\.8\.x/);
});

test("release version sync updates eval mocks and expectations but preserves intentional mismatches", () => {
  const suite = `name: runner-eval
command_mocks:
  - name: npx
    responses:
      - args: ["--yes", "automatica11y@latest", "--version"]
        stdout: "0.9.0\\n"
`;
  assert.match(updateEvalVersions(suite, "0.10.0"), /stdout: "0\.10\.0\\n"/);

  const versionError = `id: runner-preflight-version-error
graders:
  - name: includes-error-text
    config:
      contains:
        - "E404"
        - "0.9.x"
`;
  assert.match(updateEvalVersions(versionError, "0.10.0"), /- "0\.10\.x"/);

  const mismatch = `id: runner-preflight-version-mismatch
description: Version outside the 0.9.x series.
command_mocks:
  - name: npx
    responses:
      - args: ["--yes", "automatica11y@latest", "--version"]
        stdout: "1.0.0\\n"
graders:
  - name: reports-both-versions
    config:
      contains:
        - "1.0.0"
        - "0.9"
`;
  const updatedMismatch = updateEvalVersions(mismatch, "0.10.0");
  assert.match(updatedMismatch, /outside the 0\.10\.x series/);
  assert.match(updatedMismatch, /stdout: "1\.0\.0\\n"/);
  assert.match(updatedMismatch, /- "0\.10"/);

  const historicalReport = `id: historical-report\ncontent:\n  report: "automatica11y 0.9.0"\n`;
  assert.equal(updateEvalVersions(historicalReport, "0.10.0"), historicalReport);
});

test("Changesets versions only the npm package and publishes with isolated OIDC permissions", () => {
  const config = JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8"));
  const workflow = parse(readFileSync(join(root, ".github/workflows/changesets.yml"), "utf8"));
  assert.equal(config.baseBranch, "main");
  assert.equal(config.access, "public");
  assert.deepEqual(config.fixed, []);
  assert.deepEqual(config.linked, []);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.version.permissions, { contents: "read" });
  assert.equal(workflow.jobs.validation.uses, "./.github/workflows/test.yml");
  assert.equal(workflow.jobs.validation.secrets, undefined);
  assert.equal(workflow.jobs.version.needs, "validation");
  assert.equal(workflow.jobs.test, undefined);
  assert.deepEqual(workflow.jobs.publish.needs, ["validation", "version"]);
  assert.equal(workflow.jobs.publish.if, "needs.version.outputs.has-changesets == 'false'");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const version = workflow.jobs.version.steps.find((/** @type {{ id?: string }} */ step) => step.id === "changesets");
  assert.match(version.uses, /^changesets\/action@/);
  assert.equal(version.with["version-script"], "npm run changeset:version");
  assert.equal(version.with["publish-script"], undefined);
  assert.equal(version.with.script, undefined);
  assert.equal(version.with["github-token"], "${{ secrets.RELEASE_PAT }}");
  const merge = workflow.jobs.version.steps.find((/** @type {{ name?: string }} */ step) => step.name === "Enable checked auto-merge");
  assert.match(merge.run, /--squash --auto/);
  assert.doesNotMatch(merge.run, /--admin/);
  assert.equal(workflow.jobs.publish.permissions["id-token"], "write");
  assert.equal(workflow.jobs.publish.permissions.contents, "write");
  const publish = workflow.jobs.publish.steps.find((/** @type {{ id?: string }} */ step) => step.id === "publish");
  assert.match(publish.uses, /changesets\/action\/publish@/);
  assert.equal(publish.with["create-github-releases"], true);
  assert.equal(publish.with["push-git-tags"], true);
  assert.equal(publish.with["github-token"], "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(publish.env.NPM_CONFIG_PROVENANCE, "true");
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /RELEASE_PAT|NODE_AUTH_TOKEN|NPM_TOKEN|registry-url/);
  assert.equal(workflow.jobs.publish.steps.at(-1).if, "steps.publish.outputs.published == 'true'");
  assert.equal(workflow.jobs.publish.steps.at(-1).with.name, "docs-deploy-request");
});

test("validation has one reusable matrix and a fail-closed aggregate gate", () => {
  const workflow = parse(readFileSync(join(root, ".github/workflows/test.yml"), "utf8"));
  assert.equal(workflow.on.push, undefined);
  assert.ok(Object.hasOwn(workflow.on, "workflow_call"));
  assert.deepEqual(workflow.on.pull_request.branches, ["main"]);
  assert.deepEqual(workflow.jobs.test.strategy.matrix.node, [22, 24, 26]);
  assert.equal(workflow.jobs.test.strategy["fail-fast"], false);
  assert.equal(workflow.jobs.smoke.uses, "./.github/workflows/action-test.yml");
  assert.deepEqual(workflow.jobs["ci-gate"].needs, ["test", "smoke", "release-policy"]);
  assert.equal(workflow.jobs["ci-gate"].if, "always()");
  assert.match(workflow.jobs["ci-gate"].steps[0].run, /MATRIX_RESULT.*!= success.*SMOKE_RESULT.*!= success/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

test("the test matrix refreshes the npm download cache after test-time installs", () => {
  const workflow = parse(readFileSync(join(root, ".github/workflows/test.yml"), "utf8"));
  const steps = workflow.jobs.test.steps;
  const setup = steps.find((/** @type {{ uses?: string }} */ step) => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(setup.with.cache, undefined);
  assert.equal(setup.with["package-manager-cache"], false);
  const cache = steps.find((/** @type {{ uses?: string }} */ step) => step.uses?.startsWith("actions/cache@"));
  assert.match(cache.uses, /^actions\/cache@[a-f0-9]{40}$/);
  assert.equal(cache.with.path, "~/.npm");
  assert.ok(cache.with.key.includes("${{ hashFiles('package-lock.json') }}"));
  assert.ok(cache.with.key.endsWith("${{ github.run_id }}-${{ github.run_attempt }}"));
  assert.equal(cache.with["restore-keys"].split("\n")[0], "npm-tests-${{ runner.os }}-${{ matrix.node }}-${{ hashFiles('package-lock.json') }}-");
  assert.ok(steps.indexOf(cache) < steps.findIndex((/** @type {{ name?: string }} */ step) => step.name === "Install dependencies"));
});

test("release policy distinguishes shipped changes from development-only changes", () => {
  const manifest = { name: "automatica11y", version: "0.9.0", dependencies: { axe: "1" }, devDependencies: { typescript: "1" } };
  assert.equal(requiresChangeset(["src/cli.js"], manifest, manifest), true);
  assert.equal(requiresChangeset(["action.yml"], manifest, manifest), true);
  assert.equal(requiresChangeset(["docs/index.md", "test/package.test.js"], manifest, manifest), false);
  assert.equal(requiresChangeset(["package.json"], manifest, { ...manifest, devDependencies: { typescript: "2" } }), false);
  assert.equal(requiresChangeset(["package.json"], manifest, { ...manifest, dependencies: { axe: "2" } }), true);
  const production = { "": manifest, "node_modules/axe": { version: "1" } };
  assert.deepEqual(productionLock({ packages: { ...production, "node_modules/typescript": { dev: true, version: "1" } } }), productionLock({ packages: { ...production, "node_modules/typescript": { dev: true, version: "2" } } }));
  assert.notDeepEqual(productionLock({ packages: production }), productionLock({ packages: { ...production, "node_modules/axe": { version: "2" } } }));
});

test("release validation rejects missing-browser and unexpected skipped tests", () => {
  validateTestSummary("Known upstream VitePress issue\n# skipped 1\n");
  assert.throws(() => validateTestSummary("Known upstream VitePress issue\n# skipped 2\n"), /one known VitePress skip/);
  assert.throws(() => validateTestSummary("No Chrome or Chromium found\n# skipped 1\n"), /sole skip/);
  assert.throws(() => validateTestSummary(""), /one known VitePress skip/);
  const cwd = makeTree({ "test-output.txt": "Known upstream VitePress issue\n# skipped 1\n" });
  execFileSync(process.execPath, [join(root, "scripts/release-policy.js"), "test-summary"], { cwd, stdio: "pipe" });
  assert.throws(() => execFileSync(process.execPath, [join(root, "scripts/release-policy.js"), "test-summary", "../outside.txt"], { cwd, stdio: "pipe" }), /no file path arguments/);
});

test("release policy rejects impersonated version PRs including matching fork branches", () => {
  const context = { repository: "owner/repo", headRepository: "owner/repo", head: "changeset-release/main", base: "main", actor: "release-user", title: "chore: release packages" };
  assert.equal(isVersionPullRequest(context, "release-user"), true);
  assert.throws(() => isVersionPullRequest(context, ""), /RELEASE_ACTOR/);
  assert.throws(() => isVersionPullRequest({ ...context, headRepository: "fork/repo" }, "release-user"), /originate/);
  assert.throws(() => isVersionPullRequest({ ...context, actor: "intruder" }, "release-user"), /authored/);
  assert.throws(() => isVersionPullRequest({ ...context, head: "feature" }, "release-user"), /exact reserved/);
  assert.equal(isVersionPullRequest({ ...context, head: "feature", title: "Fix an issue" }, "release-user"), false);
});

test("release policy permits only generated version bookkeeping", () => {
  const manifest = { name: "automatica11y", version: "0.9.0" };
  const skill = updateRunnerSkillVersion(readFileSync(join(root, "skills/automatica11y-runner/SKILL.md"), "utf8"), manifest.version);
  /** @type {Record<string, string>} */
  const before = { "package.json": JSON.stringify(manifest), "package-lock.json": JSON.stringify({ version: "0.9.0", packages: { "": manifest } }), "skills/automatica11y-runner/SKILL.md": skill };
  /** @type {Record<string, string>} */
  const after = { ...before, "package.json": JSON.stringify({ ...manifest, version: "0.9.1" }), "package-lock.json": JSON.stringify({ version: "0.9.1", packages: { "": { ...manifest, version: "0.9.1" } } }) };
  const changes = [{ status: "M", path: "package.json" }, { status: "M", path: "CHANGELOG.md" }, { status: "D", path: ".changeset/patch.md" }];
  const read = (/** @type {string} */ ref, /** @type {string} */ path) => (ref === "base" ? before : after)[path];
  validateVersionDiff(changes, read, "base", "head");
  assert.throws(() => validateVersionDiff([...changes, { status: "M", path: "src/cli.js" }], read, "base", "head"), /Unexpected release PR file/);
  assert.throws(() => validateVersionDiff([...changes, { status: "A", path: ".changeset/new.md" }], read, "base", "head"), /only consume/);
  const altered = (/** @type {string} */ ref, /** @type {string} */ path) => ref === "head" && path === "package.json" ? JSON.stringify({ ...manifest, version: "0.9.1", scripts: { malicious: "bad" } }) : read(ref, path);
  assert.throws(() => validateVersionDiff(changes, altered, "base", "head"), /only change the manifest version/);
});

test("release policy permits exact generated eval updates and rejects unrelated edits", () => {
  const manifest = { name: "automatica11y", version: "0.9.0" };
  const version = "0.10.0";
  const skillPath = "skills/automatica11y-runner/SKILL.md";
  const skill = updateRunnerSkillVersion(readFileSync(join(root, skillPath), "utf8"), manifest.version);
  const yaml = 'command_mocks:\n  - args: ["--yes", "automatica11y@latest", "--version"]\n    stdout: "0.9.0\\n"\n';
  const evalPaths = ["evals/automatica11y-runner/tasks/preflight-doctor-install-yes.yaml", "evals/automatica11y-runner/wazaEval.yaml", "evals/e2e/automatica11y-runner/wazaEval.yaml"];
  const guidePath = "evals/automatica11y-runner/mocks/guide-skill.md";
  /** @type {Record<string, string>} */
  const before = { "package.json": JSON.stringify(manifest), "package-lock.json": JSON.stringify({ version: manifest.version, packages: { "": manifest } }), [skillPath]: skill, [guidePath]: skill, ...Object.fromEntries(evalPaths.map((path) => [path, yaml])) };
  /** @type {Record<string, string>} */
  const after = { ...before, "package.json": JSON.stringify({ ...manifest, version }), "package-lock.json": JSON.stringify({ version, packages: { "": { ...manifest, version } } }), [skillPath]: updateRunnerSkillVersion(skill, version), [guidePath]: updateRunnerSkillVersion(skill, version), ...Object.fromEntries(evalPaths.map((path) => [path, updateEvalVersions(yaml, version)])) };
  const changes = ["package.json", "package-lock.json", "CHANGELOG.md", skillPath, guidePath, ...evalPaths].map((path) => ({ status: "M", path }));
  const read = (/** @type {string} */ ref, /** @type {string} */ path) => (ref === "base" ? before : after)[path];
  validateVersionDiff(changes, read, "base", "head");
  for (const path of [guidePath, ...evalPaths]) {
    const altered = (/** @type {string} */ ref, /** @type {string} */ file) => read(ref, file) + (ref === "head" && file === path ? "\n# unrelated change\n" : "");
    assert.throws(() => validateVersionDiff(changes, altered, "base", "head"), /only synchronize eval versions/);
    for (const status of ["A", "D", "T"]) {
      assert.throws(() => validateVersionDiff(changes.map((change) => change.path === path ? { ...change, status } : change), read, "base", "head"), /only modify existing eval/);
    }
  }
  assert.throws(() => validateVersionDiff([...changes, { status: "M", path: "evals/automatica11y-runner/mocks/other.md" }], read, "base", "head"), /Unexpected release PR file/);
});

test("docs deploy only trusted released commits or explicit manual sources", () => {
  const sha = "a".repeat(40);
  const run = { repository: "owner/repo", headRepository: "owner/repo", branch: "main", event: "push", conclusion: "success", sha };
  assert.equal(trustedReleaseRun(run), true);
  assert.equal(trustedReleaseRun({ ...run, event: "workflow_dispatch" }), true);
  for (const invalid of [{ headRepository: "fork/repo" }, { event: "pull_request" }, { branch: "feature" }, { conclusion: "failure" }, { sha: "main" }]) {
    assert.equal(trustedReleaseRun({ ...run, ...invalid }), false);
  }
  const request = { sha, version: "0.9.0", tag: "v0.9.0" };
  assert.deepEqual(validateDocsRequest(request, sha), request);
  assert.throws(() => validateDocsRequest(request, "b".repeat(40)), /producer commit/);
  assert.throws(() => validateDocsRequest({ ...request, tag: "v0.9.1" }, sha), /released version/);
  assert.equal(validateManualSource("main"), "main");
  assert.equal(validateManualSource("v0.9.0"), "v0.9.0");
  for (const source of ["feature", "fork/main", "v0.9.0-rc.1", "main\nmalicious"]) assert.throws(() => validateManualSource(source), /Manual docs source/);
  const workflow = parse(readFileSync(join(root, ".github/workflows/docs.yml"), "utf8"));
  assert.equal(workflow.on.push, undefined);
  assert.deepEqual(workflow.on.workflow_run.workflows, ["Changesets"]);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.jobs.publish.needs, "source");
  assert.equal(workflow.jobs.publish.steps[0].with.ref, "${{ needs.source.outputs.sha }}");
  assert.equal(workflow.jobs.publish.steps[0].with["persist-credentials"], false);
});

test("release policy CLI requires a real Changeset for shipped changes", () => {
  const manifest = { name: "automatica11y", version: "0.9.0", dependencies: {} };
  const cwd = makeTree({
    "package.json": JSON.stringify(manifest),
    "package-lock.json": JSON.stringify({ version: manifest.version, packages: { "": manifest } }),
    ".changeset/config.json": readFileSync(join(root, ".changeset/config.json"), "utf8"),
    "pnpm-workspace.yaml": "packages: ['.']\n",
    ".gitignore": "node_modules\n",
    "source.js": "export const value = 1;\n",
  });
  /** @param {...string} args */
  const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "Base");
  const base = git("rev-parse", "HEAD");
  git("checkout", "-b", "feature");
  writeFileSync(join(cwd, "action.yml"), "name: changed\n");
  git("add", ".");
  git("commit", "-m", "Change Action");
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  const eventPath = join(makeTree(), "event.json");
  const invoke = () => {
    writeFileSync(eventPath, JSON.stringify({ repository: { full_name: "owner/repo" }, pull_request: { title: "Change Action", user: { login: "contributor" }, head: { sha: git("rev-parse", "HEAD"), ref: "feature", repo: { full_name: "owner/repo" } }, base: { sha: base, ref: "main" } } }));
    return execFileSync(process.execPath, [join(root, "scripts/release-policy.js")], { cwd, env: { ...process.env, GITHUB_EVENT_PATH: eventPath }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  assert.throws(invoke);
  writeFileSync(join(cwd, ".changeset/empty.md"), "---\n---\n\nNo release.\n");
  git("add", ".");
  git("commit", "-m", "Empty Changeset");
  assert.throws(invoke);
  writeFileSync(join(cwd, ".changeset/patch.md"), '---\n"automatica11y": patch\n---\n\nFix the Action.\n');
  git("add", ".");
  git("commit", "-m", "Patch Changeset");
  assert.doesNotThrow(invoke);
});

test("docs freshness guard skips older automatic commits but allows manual repair", () => {
  const cwd = makeTree({ "file.txt": "first\n" });
  /** @param {...string} args */
  const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "First");
  const first = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "file.txt"), "second\n");
  git("add", ".");
  git("commit", "-m", "Second");
  const second = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "file.txt"), "third\n");
  git("add", ".");
  git("commit", "-m", "Third");
  const third = git("rev-parse", "HEAD");
  git("checkout", "-b", "docs");
  writeFileSync(join(cwd, ".automatica11y-deploy.json"), JSON.stringify({ sha: second }));
  git("add", ".");
  git("commit", "-m", "Deployed source");
  git("checkout", "main");
  git("remote", "add", "origin", cwd);
  const workflow = parse(readFileSync(join(root, ".github/workflows/docs.yml"), "utf8"));
  const script = workflow.jobs.publish.steps.find((/** @type {{ id?: string }} */ step) => step.id === "freshness").run;
  const output = join(makeTree(), "outputs");
  const invoke = (/** @type {string} */ sha, /** @type {string} */ trigger) => {
    writeFileSync(output, "");
    execFileSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], { cwd, env: { ...process.env, SOURCE_SHA: sha, SOURCE_TRIGGER: trigger, GITHUB_OUTPUT: output }, stdio: ["ignore", "pipe", "pipe"] });
    return readFileSync(output, "utf8");
  };
  assert.match(invoke(first, "release"), /should-deploy=false/);
  assert.match(invoke(second, "release"), /should-deploy=false/);
  assert.match(invoke(third, "release"), /should-deploy=true/);
  assert.match(invoke(first, "manual"), /should-deploy=true/);
  git("remote", "set-url", "origin", join(cwd, "missing"));
  assert.throws(() => invoke(third, "release"));
});

test("docs resolver CLI uses only its producer artifact and validates manual dispatch", () => {
  const sha = "a".repeat(40);
  const cwd = makeTree({
    "gh": '#!/usr/bin/env node\nconst { readFileSync } = require("node:fs");\nconst path = process.argv.at(-1);\nif (path.endsWith("/zip")) process.stdout.write(readFileSync(process.env.FIXTURE_ARCHIVE));\nelse if (path.endsWith("/artifacts")) console.log(JSON.stringify([{ artifacts: JSON.parse(process.env.FIXTURE_ARTIFACTS) }]));\nelse if (path.includes("/commits/")) console.log(JSON.stringify({ sha: process.env.FIXTURE_SHA }));\nelse if (path.includes("/releases/tags/")) console.log(JSON.stringify({ draft: false }));\nelse process.exit(1);\n',
    "docs-deploy-request.json": JSON.stringify({ sha, version: "0.9.0", tag: "v0.9.0" }),
  });
  chmodSync(join(cwd, "gh"), 0o755);
  const archive = join(cwd, "request.zip");
  execFileSync("zip", ["-j", archive, join(cwd, "docs-deploy-request.json")], { stdio: "pipe" });
  const eventPath = join(cwd, "event.json");
  const output = join(cwd, "outputs");
  const run = { id: 123, head_repository: { full_name: "owner/repo" }, head_branch: "main", event: "push", conclusion: "success", head_sha: sha };
  /** @param {Record<string, unknown>} event @param {NodeJS.ProcessEnv} [overrides] */
  const invoke = (event, overrides = {}) => {
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(output, "");
    execFileSync(process.execPath, [join(root, "scripts/docs-deploy.js")], { cwd, env: {
      ...process.env, PATH: cwd + ":" + process.env.PATH, GITHUB_EVENT_NAME: "workflow_run", GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "owner/repo", GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output,
      FIXTURE_SHA: sha, FIXTURE_ARCHIVE: archive, FIXTURE_ARTIFACTS: JSON.stringify([{ id: 456, name: "docs-deploy-request", expired: false }]), ...overrides,
    }, stdio: ["ignore", "pipe", "pipe"] });
    return readFileSync(output, "utf8");
  };
  assert.match(invoke({ workflow_run: run }), /sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nversion=0.9.0\ntrigger=release/);
  assert.equal(invoke({ workflow_run: { ...run, conclusion: "failure" } }), "");
  assert.equal(invoke({ workflow_run: { ...run, head_repository: { full_name: "fork/repo" } } }), "");
  assert.equal(invoke({ workflow_run: run }, { FIXTURE_ARTIFACTS: "[]" }), "");
  assert.equal(invoke({ workflow_run: run }, { FIXTURE_ARTIFACTS: JSON.stringify([{ id: 456, name: "docs-deploy-request", expired: true }]) }), "");
  assert.throws(() => invoke({ workflow_run: run }, { FIXTURE_SHA: "b".repeat(40) }));
  assert.match(invoke({}, { GITHUB_EVENT_NAME: "workflow_dispatch", DOCS_SOURCE: "main" }), /version=\ntrigger=manual/);
  assert.match(invoke({}, { GITHUB_EVENT_NAME: "workflow_dispatch", DOCS_SOURCE: "v0.9.0" }), /version=0.9.0\ntrigger=manual/);
  assert.throws(() => invoke({}, { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/feature", DOCS_SOURCE: "main" }));
});

test("the tarball holds the tool, the skill, the docs, and the license, and nothing else", () => {
  const { files } = packed();
  const names = files.map((f) => f.path);
  for (const must of ["package.json", "README.md", "LICENSE", "AGENTS.md", "skills/automatica11y/SKILL.md", "skills/automatica11y-runner/SKILL.md", "skills/automatica11y-runner/references/fixtures.md", "bin/automatica11y.js", "src/cli.js", "src/tiers/rules/index.js", "src/tiers/interactions/archetypes.js", "src/tiers/vsr.js", "src/report/comparison.js", "src/wcag/index.js", "src/data/wcag-2.2.json", "src/data/wcag-2.2.source.json", "src/data/README.md"]) {
    assert.ok(names.includes(must), `${must} is in the tarball`);
  }
  for (const path of names) {
    assert.ok(!/^(test|\.agents|\.github|a11y-report|node_modules|fixtures)\//.test(path), `${path} stays out of the tarball`);
    assert.ok(!path.endsWith(".test.js"), `${path} stays out`);
  }
  const size = files.reduce((n, f) => n + f.size, 0);
  // The W3C's WCAG JSON ships unmodified, and it's about half a megabyte of this.
  assert.ok(size < 1_250_000, `the tarball is small (${size} bytes unpacked)`);
});

test("every dependency the code imports is a real dependency", () => {
  const imports = new Set();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      // These write code for fixtures to bundle. The imports in their templates belong to the bundle, not to this package.
      else if (entry.name.endsWith(".js") && !["react.js", "vue.js", "angular.js", "svelte.js", "angular-recipes.js", "wc.js", "dialects.js", "jsx-recipes.js", "wc-recipes.js"].includes(entry.name)) {
        const text = readFileSync(path, "utf8");
        for (const m of text.matchAll(/(?:from|import\()\s*["']([^."'/][^"']*)["']/g)) imports.add(m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0]);
      }
    }
  };
  walk(join(root, "src"));
  const builtins = new Set(["fs", "path", "os", "url", "util", "module", "http", "net", "child_process", "assert", "test"]);
  const declared = new Set(Object.keys(pkg.dependencies));
  for (const name of imports) {
    if (name.startsWith("node:") || builtins.has(name)) continue;
    assert.ok(declared.has(name), `${name} is imported by the code, so it must be in dependencies`);
  }
  for (const dev of Object.keys(pkg.devDependencies)) assert.ok(!imports.has(dev), `${dev} is a dev dependency, so the code can't import it`);
});


test("the docs document every flag, every exit code, and the skill install, and the README says what the tool won't do", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const docs = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => readFileSync(join(root, "docs", name), "utf8")).join("\n");
  const common = readFileSync(join(root, "src/commands/common.js"), "utf8");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const flags = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => m[1]).filter((f) => f !== "help");
  assert.ok(flags.length >= 12);
  for (const flag of flags) assert.ok(docs.includes(`--${flag}`), `the docs document --${flag}`);
  for (const code of ["0", "1", "2", "3", "4"]) assert.match(docs, new RegExp(`\\| ${code} \\|`), `the docs explain exit code ${code}`);
  assert.match(readme, /skills\/automatica11y/);
  // The README is the short case for the tool. The guide commands live in the docs.
  assert.match(docs, /automatica11y@latest guide/);
  for (const text of [readme, docs]) {
    assert.doesNotMatch(text, /init-skill/);
    assert.doesNotMatch(text, /\bis (fully )?(accessible|compliant)\b/i);
  }
  assert.match(docs, /no automated violations found/i);
  assert.match(readme, /no automated violations found|never says "accessible/i);
});
