# Release management

## Setup

Complete these settings before enabling the workflow on main:

1. Add a fine-grained `RELEASE_PAT` repository secret scoped only to this repository with Contents and Pull requests read/write. Set the `RELEASE_ACTOR` repository variable to that token owner's exact GitHub login. Set an expiration, assign a rotation owner, and replace the secret before expiry. Never send a token through a chat prompt.
2. Enable repository auto-merge and squash merges. Configure main's required status check as `ci-gate` after the new PR check appears. Require the branch to be current before merge. Replace obsolete matrix/smoke check names only after confirming the aggregate gate works. Do not grant the release actor a global check or review bypass. If required reviews apply to the version PR, it still needs those approvals before auto-merge.
3. Configure npm's trusted publisher for package `automatica11y`: GitHub repository `thedannywahl/automatica11y`, workflow filename `changesets.yml`, no environment name. The package must already exist; initial bootstrap/authentication is a separate owner task. Publishing uses npm 11.5.1 or newer, OIDC and provenance, not an npm token.
4. Permit only trusted maintainers to modify release automation and the `changeset-release/main` branch. Protect existing `v*` release tags against deletion/replacement. Establish the initial Marketplace listing separately if needed; a GitHub Release alone does not guarantee a Marketplace listing.

`RELEASE_PAT` is used only for the generated PR and auto-merge. Its writes allow normal PR CI and the merge's main-push workflow to start automatically. The publish job uses `GITHUB_TOKEN` for GitHub tags/releases and `id-token: write` for npm. PR validation receives neither the PAT nor npm OIDC. The workflow never uses `pull_request_target` to execute candidate code.

## Execution

| Event/state | Validation | Result |
| --- | --- | --- |
| Feature PR | Three-Node matrix, five Action smoke scenarios, release policy | Required `ci-gate`; no publication |
| Generated version PR | Same validation; authenticated identity and bookkeeping-only diff | Auto-merge waits for required checks and any required approvals |
| Main with pending Changesets | Same reusable validation once | Update version PR; no publication |
| Main without pending Changesets | Same reusable validation once | Publish unpublished version; existing versions are a registry no-op |
| Successful publication | Release request identifies exact published SHA | Deploy that version's docs |
| Version-PR update or registry no-op | No release request | No docs deployment |
| Manual Changesets dispatch on main | Complete validation; no retry bypass | Retry the builtin release flow |
| Manual Docs dispatch on main | Validate selected main or existing stable release tag | Deploy docs only; never publish npm |
| Weekly latest-dependencies run | Separate unfiltered upgrade diagnostics | Log artifacts and issue reporting; never publishes |

One validation workflow owns the Node 22/24/26 matrix and calls the reusable Action smoke workflow. There is no independent main matrix, duplicate release-candidate test, or tag-triggered release creator. Failed, cancelled, or skipped required jobs prevent publication. Releases and docs deploys are serialized without cancelling running work; superseded PR validation is cancelled.

## Changesets and version PRs

Use `npm run changeset` for changes to shipped `src/`, `bin/`, Action behavior, packaged instructions, README/license, package runtime fields or production dependency locks. Docs, tests and development-only dependencies do not need a package bump. A real package patch/minor/major entry is required for shipped changes; an empty Changeset is insufficient. Do not hand-edit package versions in feature PRs.

The standard Changesets action decides whether there are pending Changesets. Its `version-script` is the existing `npm run changeset:version`, which runs builtin versioning and synchronizes package-lock and runner-skill versions. There is no custom version-if-needed wrapper.

The reserved PR identity is the same repository, branch `changeset-release/main`, author `RELEASE_ACTOR`, base main and title `chore: release packages`. Its diff may contain only version/lock/changelog/skill updates and consumed Changeset deletions. Never manually reuse that identity for feature changes. Keep human review on feature PRs; do not weaken repository rules to force an automatic merge.

## Validation and diagnostics

Run `npm run lint` and `npm run test:release` with a real Chrome/Chromium browser. The release suite explicitly skips one known upstream VitePress accessibility assertion. CI requires exactly that skip and its known reason. Missing-browser skips, additional skips, nonzero test exits and failing lint block releases. `npm test` remains the unfiltered suite for evaluating an upstream fix. Remove the exception and update the skip validator together when that fix lands.

Matrix artifacts contain install, browser, lint and test output with Node/run-attempt names. Action scenarios retain reports even for expected finding exits. Job summaries include the validated SHA and explicit exception. Latest-dependency diagnostics retain both versions and test output; that workflow intentionally does not hide the upstream assertion.

## Docs deployment

The Docs workflow does not deploy arbitrary main pushes. It accepts a successful, same-repository Changesets run on main only when that run contains an unexpired `docs-deploy-request` artifact. The request's SHA/version/tag must match the producer and existing release tag. It builds that exact commit, not whichever main commit happens to be current when the workflow runs.

For docs-only changes or a deployment retry, run Docs manually from main and choose source `main` or an existing stable GitHub Release tag such as `v0.9.0`. Main is an intentional unreleased docs deployment; the job summary identifies it. Arbitrary feature/fork refs and prerelease tags are rejected. Automatic deployments older than an already-deployed source are skipped; diverged history requires investigation. A manual deployment deliberately permits a rollback/repair.

## Recovery

Registry publication, GitHub release creation and docs deployment are separate operations; they are not atomic. npm versions cannot be overwritten.

- Before npm publication: fix the failed gate/authentication and rerun failed jobs for the original commit, or dispatch Changesets on main. Dispatch never bypasses CI. Missing/expired PATs and missing `RELEASE_ACTOR` fail visibly; do not substitute a token in PR jobs.
- npm published, but tag/release creation failed: first inspect `npm view automatica11y@VERSION version gitHead dist.integrity dist.attestations --json`. Confirm provenance/integrity and the original validated commit. Builtin publish may no-op for an existing version without recreating its release; do not assume a rerun repairs it. Fetch any existing tag and verify its peeled commit. If it points elsewhere, stop. If absent, an owner may create the immutable `vVERSION` tag at that exact SHA, then create the missing GitHub Release with the matching CHANGELOG section. Never point it at latest main or move an existing tag. Deploy docs manually from the repaired release tag. Record the incident and verified SHA.
- Release exists, docs failed: rerun the Docs job for the original producer or dispatch Docs with that release tag. No npm retry is needed. Expired request artifacts use this manual path.
- Existing registry version and normal main push: no publication is expected. Do not emit a fake release request just to deploy docs; use the manual trigger.
- npm OIDC failed: verify the exact trusted-publisher repository/workflow, npm minimum version, absence of `NODE_AUTH_TOKEN`/`NPM_TOKEN`, and no empty `_authToken` npmrc entry. The publish setup intentionally avoids setup-node's registry auth-token template.

## Rollout acceptance

Before the first automatic release, exercise ordinary PR CI and inspect `ci-gate`; test release identity rejection and verify PAT-authored PR checks start automatically. Then merge one reviewed package patch Changeset. Verify one main validation, one generated version PR with aligned versions, automatic merge only after required checks, one npm publication with provenance, one matching immutable tag/GitHub Release, and a same-SHA docs deployment. A failure on any Node or smoke scenario must prevent publication even when Node 26 passes. Local tests cannot verify npm OIDC, remote branch rules, token permissions or Marketplace listing.