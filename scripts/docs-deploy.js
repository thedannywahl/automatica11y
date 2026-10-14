import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {{ repository: string, headRepository: string, branch: string, event: string, conclusion: string, sha: string }} run */
export function trustedReleaseRun(run) {
  return run.repository === run.headRepository && run.branch === "main" && ["push", "workflow_dispatch"].includes(run.event)
    && run.conclusion === "success" && /^[a-f0-9]{40}$/.test(run.sha);
}

/** @param {{ sha: string, version: string, tag: string }} request @param {string} expectedSha */
export function validateDocsRequest(request, expectedSha) {
  assert.match(request.sha, /^[a-f0-9]{40}$/);
  assert.equal(request.sha, expectedSha, "Docs artifact must identify its producer commit.");
  assert.match(request.version, /^\d+\.\d+\.\d+$/);
  assert.equal(request.tag, "v" + request.version, "Docs tag must match the released version.");
  return request;
}

/** @param {string} source */
export function validateManualSource(source) {
  assert.ok(source === "main" || /^v\d+\.\d+\.\d+$/.test(source), "Manual docs source must be main or an existing stable release tag.");
  return source;
}

function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repository = process.env.GITHUB_REPOSITORY;
  /** @param {string} path */
  const api = (path) => JSON.parse(execFileSync("gh", ["api", "repos/" + repository + "/" + path], { encoding: "utf8" }));
  /** @param {string} sha @param {string} version @param {string} trigger */
  const output = (sha, version, trigger) => {
    assert.match(sha, /^[a-f0-9]{40}$/);
    appendFileSync(process.env.GITHUB_OUTPUT, "sha=" + sha + "\nversion=" + version + "\ntrigger=" + trigger + "\nshould-deploy=true\n");
  };
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    assert.equal(process.env.GITHUB_REF, "refs/heads/main", "Dispatch docs from the trusted main workflow.");
    const source = validateManualSource(process.env.DOCS_SOURCE || "main");
    const commit = api("commits/" + source);
    if (source !== "main") {
      const release = api("releases/tags/" + source);
      assert.equal(release.draft, false, "Manual docs tag must have a published GitHub Release.");
    }
    output(commit.sha, source === "main" ? "" : source.slice(1), "manual");
    return;
  }
  const run = event.workflow_run;
  if (!run || !trustedReleaseRun({ repository, headRepository: run.head_repository?.full_name, branch: run.head_branch, event: run.event, conclusion: run.conclusion, sha: run.head_sha })) {
    console.log("No successful, trusted main release run; skipping docs.");
    return;
  }
  const pages = JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", "repos/" + repository + "/actions/runs/" + run.id + "/artifacts"], { encoding: "utf8" }));
  const artifacts = pages.flatMap((/** @type {{ artifacts: { id: number, name: string, expired: boolean }[] }} */ page) => page.artifacts)
    .filter((/** @type {{ name: string, expired: boolean }} */ artifact) => artifact.name === "docs-deploy-request" && !artifact.expired);
  if (artifacts.length === 0) {
    console.log("Release run published nothing or its request expired; use the manual docs trigger if needed.");
    return;
  }
  assert.equal(artifacts.length, 1, "Ambiguous docs deployment requests.");
  const temporary = mkdtempSync(join(tmpdir(), "automatica11y-docs-"));
  try {
    const archive = join(temporary, "request.zip");
    writeFileSync(archive, execFileSync("gh", ["api", "--allow-escape-sequences", "repos/" + repository + "/actions/artifacts/" + artifacts[0].id + "/zip"]));
    const request = validateDocsRequest(JSON.parse(execFileSync("unzip", ["-p", archive, "docs-deploy-request.json"], { encoding: "utf8" })), run.head_sha);
    assert.equal(api("commits/" + request.tag).sha, request.sha, "Released tag must point to the producer commit.");
    assert.equal(api("releases/tags/" + request.tag).draft, false);
    output(request.sha, request.version, "release");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();