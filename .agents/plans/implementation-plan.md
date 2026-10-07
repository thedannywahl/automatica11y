# automatica11y implementation plan.

Companion to `npm-package-and-skill.md`. That file is the spec. This file covers what changed after evaluating it, what to build first, and how to know each step is done.

## 1. Evaluation summary.

The handoff is solid. Scope, non-goals, CLI contract, plan and results schemas, and report rules are specific enough to build from. The build order de-risks the right things first. Four findings below change or sharpen it.

### Finding 1: the package name has history.

`npm view automatica11y` returns an "Unpublished" tombstone. Someone published `0.1.1` on October 31, 2016 and unpublished it on July 17, 2020. npm usually lets a new owner publish a fresh name after unpublish, but it permanently blocks the old version number.

- Start at `0.2.0` or higher. Never `0.1.1`.
- Run `npm publish --dry-run` in M1, not M8. If npm refuses the name, we need a fallback (a scoped name like `@instructure/automatica11y`) before the CLI, `SKILL.md`, and `init-skill` hard-code it.
- This also feeds open question 2 (public or private). A scoped name solves both.

### Finding 2: the vsr spike is mostly answered.

The existing chartty harness already runs the virtual screen reader in the live Chromium page. `scripts/run-a11y.ts` reads `@guidepup/virtual-screen-reader/browser.js` and injects it into the page, then calls `virtual` from there. So the jsdom-snapshot fallback isn't needed.

- M0 shrinks to confirming this works on a page that isn't ours (a third-party URL with CSP). Injection through Playwright's `addInitScript` or `page.evaluate` bypasses most CSP issues, but verify it.
- Keep the jsdom serialization path as a documented fallback only.

### Finding 3: the existing code is a port source, and it lives in chartty.

Open question 1 is answered. Reusable code sits in `~/Scripts/chartty/tmp/chart-comparison`:

| Source | What to port |
|---|---|
| `scripts/run-a11y.ts` | The `AxeBuilder` with tag sets, guidepup injection, focus checks, forced-colors and reflow checks. |
| `harness/audit-page.ts`, `harness/dom.ts` | Page loading and DOM helpers. |
| `versions.lock.json` | Pattern for recording resolved versions. |
| `vite.config.ts`, `pages/*.html` | One-page-per-library idea only. The build tool changes (see Finding 5). |

Port, don't import. This repo must stand alone. Strip the chart-specific types (`ChartType`, `Profile`) and the performance imports (`run-perf.ts`).

The chartty setup pins exact versions (`@axe-core/playwright` 4.13.0, guidepup 0.33.0, Playwright 1.63.0). The spec says "latest, no pins." Follow the spec, but expect the first `npm install` to surface API drift. Record whatever resolves.

### Finding 4: three spec gaps to settle before M4.

1. **Peer dependency install.** "Install with its peer dependencies" needs a rule. Use `npm install --legacy-peer-deps=false` first, fall back to `--legacy-peer-deps` and record a warning. Don't silently force.
2. **One bundle per target.** Build one app per target with one HTML entry per archetype and state, not one build per fixture. Finding 5 covers the bundler.
3. **Fixture trust.** The skill authors fixture files that the runner then executes. Say so in the README. Fixtures run in the user's own isolated temp directory, not on a server, so this is acceptable. It still deserves one line.

### Finding 5: drop Vite for esbuild.

Vite earns its keep with a dev server, HMR, and plugin config. We need none of that. We need to turn a fixture file plus a library into a static bundle, fast, with zero config an agent can get wrong.

Use **esbuild** through its JS API.

- One dependency, no config file, no plugins. Handles JSX natively.
- Builds in milliseconds, so a per-target bundle adds no real wait.
- The runner generates one entry file per archetype and state, calls `esbuild.build({ bundle: true, format: "esm", splitting: true, outdir })`, writes a tiny HTML shell for each, and serves the folder with the existing static server from M2. No second server stack.
- Fewer failure modes: no Vite config resolution, no dependency pre-bundling cache, no plugin version drift under "latest."
- Web component targets are deferred past v1 (Finding 7).

Trade-off: esbuild doesn't type-check. That's fine. Fixtures only need to render, and the runner's validation step (renders, exposes hooks, no console errors) catches real breakage.

The same logic applies to the rest of the stack. Prefer the fastest option an agent can install and run unattended:

| Concern | Choice | Why |
|---|---|---|
| Bundler | esbuild | See above. |
| Test runner | `node:test` | Built into Node 20 or newer. No dependency, no config. |
| Language | Plain ESM JavaScript with JSDoc | No build step. `npm publish` ships `src/` as written. See Finding 6. |
| Arg parsing | `node:util` `parseArgs` | No dependency. |
| Schemas | valibot | Small, modular, and tree-shakable, so cold `npx` starts stay quick. Zod 4 is the fallback. See the M0 benchmark. |
| Static server | `node:http` | No dependency. |

### Finding 6: plain ESM JavaScript, no TypeScript.

Decision: write the tool in plain ESM JavaScript with JSDoc types. Nothing here is CPU-bound, so Rust or WASM bindings add install friction and no speed. Revisit only if a measured bottleneck appears.

- No `tsc` build, no `tsx`. The loop is `npm i && npm test`, and `npm publish` ships `src/` as written.
- Valibot validates `plan.json`, the mapping file, and `results.json` at runtime. That's where the real type risk sits.
- CI runs `tsc --noEmit --checkJs` as a lint step. It produces no output files.
- Authored fixtures use `.jsx`, not `.tsx`. Compared packages ship compiled JavaScript, so fixtures need JSX for compound components and nothing else. esbuild handles `.jsx` natively.
- Every source file in the spec's repo layout uses `.js`. Files ported from chartty drop their type annotations in favor of JSDoc.

### Finding 7: slim the library and infrastructure.

- **`playwright-core`, not `@playwright/test`.** No test runner, no bundled browsers. Launch the user's Chrome with `channel: "chrome"`. If none exists, `doctor` exits 3 and prints `npx playwright-core install --only-shell chromium`. Record the browser version in the plan. Keep `@axe-core/playwright` for now (it handles iframes and shadow DOM).
- **Lazy loading.** Load Playwright, esbuild, axe-core, the IBM engine, and the virtual screen reader with dynamic `import()` when a command or tier needs them. `doctor`, `--plan`, `--version`, and usage errors never touch a browser.
- **Web components deferred.** v1 reports `unsupported framework` for custom elements. That removes a second fixture flow and its tests.
- **Table-driven interactions.** One `archetypes.js` table and one runner replace nine per-archetype modules. Adding an archetype means adding a row.
- **Plain-function reports.** Two JavaScript functions return markdown strings. No template engine, no template files. A single-file `report.html` stays out of v1.
- **One schema file.** `src/schema.js` holds the plan, mapping, and results schemas, which share most of their shapes.
- **Lean installs.** Target installs use `--ignore-scripts --no-audit --no-fund --prefer-offline`.
- **`run` shares `audit`'s code path.** `run --plan` stays in the CLI contract but has no module of its own.

Runtime dependencies after this: `playwright-core`, `axe-core`, `@axe-core/playwright`, `accessibility-checker-engine`, `@guidepup/virtual-screen-reader`, `esbuild`, and `valibot`. The IBM package installs 26 MB, but only `ace.js` (0.69 MB) loads, and only when the `ibm` engine runs.

### Finding 8: the `rules` tier runs axe and IBM Equal Access, not Alfa.

We ran axe-core 4.14.0, `accessibility-checker-engine` 4.0.34, and `@siteimprove/alfa-rules` 0.119.0 against 26 single-issue pages, one clean page, and one planted-issue page, in Chrome 155. This was a small synthetic test, not a benchmark.

- **Overlap.** All three engines caught 11 of the 26 issues. Axe and Alfa shared one more (skipped heading), and axe and IBM shared one (positive `tabindex`). Axe alone caught two (bad list child, unnamed dialog), and IBM alone caught one (table with no headers). Eight issues slipped past all three: fake button with no `tabindex`, vague link text, duplicate ID, no focus outline, placeholder-only input, no reflow, `target=_blank` without a warning, and a tiny target that WCAG's spacing exception allows. The interactions tier or a human has to cover most of those.
- **Coverage by WCAG criterion.** Axe covers 29 criteria, Alfa 31, and IBM 40, with 49 in the union. IBM uniquely maps rules to 14 criteria. Many of those rules only prompt a human to review.
- **Cost.** IBM injects into the page like axe, has zero dependencies, and ran in tens of milliseconds. Alfa runs in Node, adds about 31 MB across 73 packages, takes 0.6 to 0.9 seconds to import, and flagged two stricter-than-AA rules on a clean page.
- **Decision.** Default `--engine axe,ibm`. Skip Alfa. Rename the tier from `axe` to `rules` and add an `engine` level to the results, so a future engine is a new entry, not a schema break.
- **Impact.** Impact is the engine's own label, never one we compute. IBM has no impact scale, so its findings carry `impact: null`. IBM does document an adoption scale, the Toolkit level (1 essential with high user impact, 2 next-most important, 3 full set). We carry it as a separate `toolkitLevel` field on IBM findings and never map it onto axe's scale. Each engine gets its own fail flag (`--fail-on-axe`, `--fail-on-ibm`), and `--fail-mode any|all` combines them (Finding 9).
- **Reporting.** Never merge findings across engines. Label each with its engine.

### Finding 9: per-engine fail flags with a combined mode.

Both engines run at once, so one `--fail-on` threshold can't describe them. IBM has no impact scale, and axe has no Toolkit level.

- `--fail-on-axe <minor|moderate|serious|critical>` and `--fail-on-ibm <1|2|3>` each configure one engine.
- `--fail-mode any` (default) exits 1 when any checked engine trips. `--fail-mode all` exits 1 only when every checked engine trips, which gives a high-confidence gate.
- Needs-review items never trip a check. An engine with no flag isn't checked.
- Engine counts are never summed or merged. The report shows each engine's result, then the combined outcome.
- Invalid combinations (a flag for an engine not in `--engine`, or `--fail-mode` with no flag) exit 2.
- The spec's section 4 has the full rules, and `results.json` records the outcome in `failCheck`.

### Spec nits to fix while we're here.

- Section 4 lists "Storybook" detection under both local directory and URL. Fine, but the classification table shows Local path winning first. A local Storybook directory is a local path. Document that it then gets the Storybook check.
- The fail flags and `--plan` share the options table with no note on interaction. `--plan` never runs tiers, so it ignores fail flags and prints them in the plan. State it.
- Open question 4 (fail flags in CI) needs no decision. Default off everywhere. Close it.
- Open question 3 (story cap): keep 200, expose `--max-stories`. Close it.

## 2. Open questions that need Danny.

Registry blocks work only at M8.

1. **Registry.** Public npm, a scoped public package, or GitHub Packages? Decide by the end of M1, once the dry-run result is in.

Everything else has a default in this plan.

## 3. Milestones.

Each milestone ends with passing tests and a commit. Targets are estimates for one focused developer.

### M0. Spikes (done).

Goal: retire the three risks in the spec.

- [x] Inject `virtual-screen-reader/browser.js` into a Playwright page, load a real third-party URL, and capture an announcement log. Write the result into a short note in `.agents/notes/spike-vsr.md`.
- [x] Build a throwaway Radix `Dialog` fixture and a plain `react-aria-components` or Headless UI fixture. Confirm the `data-a11y-trigger` and `data-a11y-root` contract is authorable and the esbuild bundle works.
- [x] Read `run-a11y.ts` end to end and list which functions port as-is.
- [x] Benchmark schema libraries (valibot, zod 4, arktype) on cold start: `time node -e "import('<lib>')"` and install size. Keep valibot unless zod 4 or arktype wins by a clear margin. Record numbers in `.agents/notes/spike-schema-lib.md`.
- [x] Confirm `ace.js` injects and runs on a third-party page with a strict CSP. Find what IBM's documentation says `toolkitLevel` means, then decide whether it supports an `ibmPriority` field and a `--fail-on` rule. Record the result in `.agents/notes/spike-ibm.md`.
- [x] Run `npm publish --dry-run` on a stub `package.json` (see Finding 1).

Exit: five short notes, one yes or no on the package name, and one schema library choice.

**Results.** Notes live in `.agents/notes/`.

- **vsr** (`spike-vsr.md`): runs in the live page, including under strict CSP. Inject by stripping the module's `export` line, wrapping it in an IIFE that sets `window.__vsr`, and running it with `page.evaluate`. No jsdom fallback.
- **Fixtures** (`spike-fixtures.md`): the contract works for Radix (compound) and React Aria. esbuild builds each in under one second. Eight contract tweaks are recorded, including "put `data-a11y-root` on the element with the dialog role" and "query from `document`, because dialogs render in portals."
- **Chartty port** (`spike-chartty-port.md`): the axe setup, self-test, `ariaSnapshot`, screen reader walk, focus check, and context setup port with small changes. Chart-specific code, Vite preview, and the `pngjs` colour math stay behind.
- **Schema library** (`spike-schema-lib.md`): valibot. Import cost is at the noise floor, against about 40 ms for zod 4 and 150 ms or more for ArkType.
- **IBM** (`spike-ibm.md`): `ace.js` runs through `page.evaluate` on all three tested pages. Use `evaluate`, not `addScriptTag`, which a strict CSP blocks. `toolkitLevel` is documented by IBM as an adoption level (1 to 3), so IBM findings carry it as a separate field. A first draft of this note said it was undocumented. That was wrong.
- **Package name** (`spike-package-name.md`): the dry run passes for `automatica11y@0.2.0`, but a dry run can't prove the name is claimable. `npm whoami` fails here, and nothing was published. A real publish settles it.

### M1. Skeleton (one day).

- [ ] `package.json` (`"type": "module"`, Node 20 or newer, `bin`, `files`), `jsconfig.json` for editor checks, test runner (`node:test`).
- [ ] `cli.js` with `audit`, `compare`, `run`, `doctor`, `init-skill`, `--version`. Usage errors exit 2.
- [ ] `plan/classify.js` with one test per row in the section 4 table, plus the label syntax and the "bare `button` is a package" rule.
- [ ] `schema.js` (valibot, holds plan, mapping, and results schemas), `env/versions.js`, `env/browser.js`.
- [ ] `doctor` checks Node version and for Chrome or Chromium. A missing browser exits 3 with the install command.
- [ ] Lazy-load heavy dependencies with dynamic `import()`. Test that `--plan`, `doctor`, and `--version` run without importing Playwright.
- [ ] `--plan` writes `plan.json` without installing or launching anything.

Exit: acceptance criteria for `--plan` and exit code 3 pass.

### M2. URL and HTML path with the rules tier (three days).

- [ ] `harness/static-serve.js` serves files and directories over localhost. Pick a free port and shut down cleanly.
- [ ] `harness/url.js`, with wait-for-network-idle.
- [ ] `tiers/rules/axe.js`, ported from chartty. Separate lists for violations, incomplete, and passes. Cap node selectors.
- [ ] `tiers/rules/ibm.js`: inject `ace.js`, run `IBM_Accessibility`, filter by WCAG version and level, and map `FAIL` to violations and `POTENTIAL`, manual, and recommendation results to needs-review. Attach each rule's `toolkitLevel` to its findings.
- [ ] `tiers/rules/index.js` and the `--engine` flag (`axe`, `ibm`, `axe,ibm`). Default runs both. Reject unknown engine names with exit 2.
- [ ] Self-test on every run: audit a known-bad snippet with each engine and refuse to report if either engine misses it (ported from chartty).
- [ ] Inject `ace.js` with `page.evaluate`, never `addScriptTag` (see `spike-ibm.md`).
- [ ] Never merge findings across engines. Add a test with a page both engines flag and assert both report separately, each labeled.
- [ ] `results.json` writer (schema lives in `schema.js`) and `report/single.js`, a plain function that renders `report.md`.
- [ ] Fixture pages in `test/fixtures/`: missing label, low contrast, broken dialog focus return, plus clean twins. Assert exact rule IDs per engine. Include the clean twin and assert axe and IBM report no violations on it.
- [ ] Fail checks (Finding 9): `--fail-on-axe`, `--fail-on-ibm`, `--fail-mode any|all`, exit code 1, the `failCheck` object in `results.json`, and exit 2 on invalid combinations.
- [ ] Tests for the fail matrix: each flag alone, both flags with `any`, both with `all`, one engine tripped, a flag for an engine left out of `--engine`, and `--fail-mode` without a flag.
- [ ] Determinism test: same plan twice, identical findings.

Exit: `audit` works end to end on `url`, `html-file`, and `static-dir`.

### M3. Storybook path (one day).

- [ ] `harness/storybook.js`: fetch `index.json` or `stories.json`, enumerate, build iframe URLs.
- [ ] Story cap at 200, `--max-stories`, and a truncation warning in the report.
- [ ] `--archetypes` filtering by title and tag heuristics, with matched stories listed.
- [ ] Check in a small static Storybook build as a fixture.

Exit: `audit` works on a local Storybook directory and a Storybook URL.

### M4. npm React path (three days). Highest risk.

- [ ] `plan/resolve-npm.js`: name to concrete version, using `npm view`.
- [ ] Framework detection: React, unsupported (name the framework, including web components, which are deferred), non-UI.
- [ ] `harness/npm-react.js`: isolated temp install, export scan, candidate mapping, fixture generation, esbuild bundle, local serve.
- [ ] `plan/mapping.js`: load and validate `--mapping`. Validation renders each fixture, checks for the two hooks, and fails on console errors. Bad fixtures become `gap`.
- [ ] One parameterized fixture template. Start with button, dialog, and tabs. Apply the eight contract tweaks in `spike-fixtures.md`, including an `alias` that pins one copy of React.
- [ ] Clean up temp directories on exit, including on failure.

Exit: `audit` on one non-compound library (button, tabs) and one compound library (Radix dialog, authored fixture).

### M5. Interactions tier (three days).

- [ ] `archetypes.js` step table plus one runner. Add rows for button, link, dialog, menu, and tabs first. Then combobox, form-field, accordion, and tooltip.
- [ ] Shared checks: Tab reachable, visible focus, no focus trap.
- [ ] Visible-focus method: computed-style diff first, screenshot diff as backup. Record which method fired.
- [ ] Every check returns `pass`, `fail`, or `not-applicable` with a detail string.
- [ ] Test each archetype row against a known-good and a known-bad fixture.

Exit: the full check table in spec section 7 has a test per row.

### M6. vsr tier (one day).

- [ ] `tiers/vsr.js`, ported from chartty, using the `page.evaluate` injection from `spike-vsr.md` (Finding 2). Cap the walk at 150 steps and report truncation.
- [ ] Record the announcement log per state. Label every result `simulated: true`.
- [ ] Flag unnamed controls and generic roles as data. No automatic judgment of the log.
- [ ] Method note says the run used the live page, or a DOM snapshot if the fallback fired.

### M7. Comparison reporting (two days).

- [ ] `commands/compare.js` with at least two targets. One failed target doesn't abort the run.
- [ ] `report/comparison.js`: coverage matrix first (target by archetype by tier), then findings.
- [ ] Mixed-evidence warning when component and page targets mix.
- [ ] `--lib-a11y on,off` runs both configurations and labels each.
- [ ] Chart archetype with canvas detection. Canvas-only output reports `not-testable`.
- [ ] Test every rule in spec section 9 against fixed `results.json` inputs.

Exit: two-library comparison meets the acceptance criterion.

### M8. Skill and packaging (two days).

- [ ] `SKILL.md` per spec section 11, including the version handshake.
- [ ] `init-skill` copies `SKILL.md` to `--dest`, defaulting to the host's skills directory.
- [ ] README: install, usage, limits, the fixture-trust note, and the "no automated violations found" language.
- [ ] `npm link` smoke test, then `npm pack` and install the tarball in a clean directory.
- [ ] CI: unit and fixture tests on every push. Scheduled latest-dependency job that opens an issue on failure.
- [ ] Publish, using the registry decision from M1.

Exit: all acceptance criteria in spec section 13.

## 4. Order and parallelism.

M0 then M1 are strictly first. After M2, M3 and M4 can run in parallel. M5 needs M2 and at least one fixture from M4. M6 and M5 can run in parallel. M7 needs all of them.

## 5. Risks and mitigations.

| Risk | Mitigation |
|---|---|
| "Latest" dependencies break the build between runs. | Record versions in `plan.json`. The scheduled CI job catches breakage early. |
| Compound-component fixtures are brittle. | Authored fixtures plus validation. A bad fixture is a `gap`, never a pass. |
| Third-party pages block script injection. | Use Playwright's init-script path. Report `failed` with the reason if blocked. |
| npm install of arbitrary packages runs lifecycle scripts. | Install with `--ignore-scripts` by default. Document the exception path. |
| Interaction checks flake on timing. | Wait on state (roles, attributes), never fixed sleeps. Run the determinism test in CI. |

## 6. First actions.

1. Commit the two plan files.
2. Run M0, starting with the `npm publish --dry-run` check, since its answer shapes the name used everywhere.
3. Ask Danny for the registry decision once the dry-run result is in.
