# GitHub Action

Run on an Ubuntu GitHub-hosted runner or an Ubuntu self-hosted runner with permission to install Chromium's system dependencies. The Action sets up Node 24, installs the tool from the selected Action checkout in an isolated temporary directory, and downloads the matching Playwright headless shell. It does not install or build your application.

## Built site

Build your site first, then pass its output directory. Built HTML and Storybook directories are served automatically; they do not need a separate dev server.

```yaml
name: Accessibility
on: [push, pull_request]
permissions:
  contents: read
jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout
      - uses: actions/setup-node
        with:
          node-version: '24'
      - run: npm ci
      - run: npm run build
      - uses: thedannywahl/automatica11y
        with:
          targets: ./dist
          tiers: rules
```

`tiers: rules` intentionally limits coverage to rule engines. Omit it to run all five tiers. A URL or `npm:package` can replace the built path. For npm targets, check in authored fixtures and mappings when generated fixtures are insufficient.

## Shared YAML

Check in `.automatica11y.yml` in the effective working directory, or select another file with `config`. The CLI accepts the same file:

```bash
automatica11y ci --config .automatica11y.yml
```

This example shows every audit and delivery setting; omit fields to use defaults. `options.archetypes` is optional and omitted here so all archetypes are considered.

```yaml
version: 1
targets:
  - site=./dist
options:
  wcag: '2.2'
  level: AA
  tiers: [rules, interactions, computed, conditions, vsr]
  engines: [axe, ibm]
  libA11y: [on, off]
  maxStories: 200
  generate: true
  out: ./a11y-report
fail:
  axe: serious
  ibm: 1
  mode: any
  incomplete: true
  review: false
  checks: false
artifacts:
  enabled: true
  name: accessibility-report
  retentionDays: 14
summary: true
```

Add `options.archetypes: [button, dialog]` to limit component coverage or `options.mapping: ./mapping.json` for authored mappings. Add the `server` object from the next example when testing a local application instead of built files.

Precedence is built-in defaults, YAML, then explicit Action inputs or CLI flags. Objects merge by known fields; arrays and the target list replace entirely. Blank Action inputs do not override YAML. Unknown fields, duplicate keys, custom tags, invalid types, and explicit missing config files fail validation. Quote WCAG versions because they must be strings.

All relative paths use `working-directory`, not the directory containing the config file. This includes target paths, config selection, mapping files and their authored fixtures, report output, and server directories. Standalone CLI commands use the current directory. `audit` and `compare` also accept YAML, but managed-server settings require `ci`.

## Failure policies

The Action and `ci` default to axe `serious` or higher, IBM Toolkit level `1`, and incomplete execution/coverage failure. Counts and scales remain separate. `fail.mode: all` requires both engine thresholds to trip on the same target; it never hides an execution gap.

Incomplete coverage includes failed or unsupported targets, fixture gaps, missing requested results, untestable checks, `undetermined`/`error` measurements, failed stories, and story-cap truncation. Deliberately excluded tiers or archetypes and genuinely inapplicable checks do not fail. A target with no usable audit evidence is not a completed audit.

`fail.review: true` gates engine findings needing manual review and simulated-screen-reader review flags. `fail.checks: true` gates explicit failures in interactions, computed checks, and conditions. These are off by default and remain separate from rule-engine violations.

Disable engine thresholds with YAML `axe: null` or `ibm: null`, or Action inputs `fail-on-axe: none` and `fail-on-ibm: none`. Disable coverage gating with `incomplete: false` or `fail-on-incomplete: 'false'`. Disabling a gate never removes its findings. An excluded engine or rules tier has no inherited CI threshold; an explicitly incompatible threshold is a configuration error.

## Local server

The caller installs the application's dependencies. The Action starts the trusted command, waits for an HTTP 2xx or 3xx readiness response, and cleans up the process group afterward, including failure and cancellation paths.

```yaml
version: 1
targets: [http://127.0.0.1:4173]
server:
  command: npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
  url: http://127.0.0.1:4173
  timeoutSeconds: 60
  cwd: .
options:
  tiers: [rules]
```

The readiness URL must be HTTP(S) on `localhost`, `127.0.0.1`, or `[::1]`, without credentials. If it already responds before startup, the Action fails rather than auditing an unrelated server. Startup exit, timeout, or server exit during the audit fails CI. `--plan` validates the settings without starting the server or browser. `server-command`, `server-url`, `server-timeout`, and `server-working-directory` inputs override the corresponding YAML values.

## Comparisons and overrides

One target audits; two or more compare under the same settings. Use one target per line, retaining labels and npm companion lists as single strings:

```yaml
- uses: thedannywahl/automatica11y@main
  with:
    config: .automatica11y.yml
    targets: |
      current=https://example.com/current
      candidate=https://example.com/candidate
    fail-on-axe: critical
    fail-on-review: 'true'
    artifact-name: comparison-report
```

Named audit inputs are `wcag`, `level`, `tiers`, `engine`, `archetypes`, `lib-a11y`, `mapping`, `max-stories`, `generate`, and `out`. Lists use commas. `generate`, `fail-on-incomplete`, `fail-on-review`, `fail-on-checks`, `upload-artifact`, and `summary` take `'true'` or `'false'`. All inputs are documented in the root Action metadata. There is no raw shell-arguments input.

For a matrix, use a unique artifact name and report directory:

```yaml
with:
  artifact-name: a11y-${{ matrix.component }}
  out: ./reports/${{ matrix.component }}
```

## Reports and outputs

Reports upload before the final step propagates the original failure. By default the artifact is `automatica11y-report`; `artifact-name`, `artifact-retention-days` (1–90), and `upload-artifact` override delivery settings. A job summary shows the outcome and independent engine counts; `summary: 'false'` disables it. Use normal GitHub `continue-on-error` when the caller wants to inspect a failing outcome without failing the job.

The report directory must be absent or empty. A nonempty directory is rejected to prevent stale uploads; no existing report directory is deleted. Early environment or resolution failures can produce only a plan or no files. No missing evidence is presented as a successful audit.

| Output | Meaning |
|---|---|
| `exit-code` | `0` no gate tripped; `1` finding policy; `2` configuration; `3` environment/server; `4` no target results; `5` incomplete coverage. |
| `outcome` | `passed`, `failed`, `incomplete`, or `error` for the entire Action run. |
| `report-path` | Absolute Markdown path, empty if no report. |
| `results-path` | Absolute JSON path, empty if no results. |
| `artifact-name` | Effective report artifact name. |
| `artifact-id` | Uploaded artifact ID, empty when not uploaded. |
| `artifact-url` | Uploaded artifact URL, empty when not uploaded. |

Setup failures before the audit step can leave all outputs empty. Artifact-service errors also fail the Action. A `passed` outcome means only that configured gates did not trip; it makes no accessibility claim.

## Trust boundaries

Targets and options are passed as argument arrays, never evaluated as shell fragments. Only `server.command` is an explicitly trusted shell command; do not populate it from untrusted pull-request text. npm installs disable lifecycle scripts, but package bundles and server commands still execute code. Do not run untrusted projects with privileged `pull_request_target` credentials.

Reports can contain target URLs, DOM snippets, paths, and generated fixtures. Avoid credentials in target URLs and page markup; GitHub log masking does not redact report artifacts. Restrict artifact access/retention and disable artifact uploads or summaries where needed.