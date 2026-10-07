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
- Web component targets use the same esbuild path with a framework-free fixture (Finding 7).

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
- **Web components stay in v1.** Decided: since `--plan` can't tell React from web components without reading the package, M4 detects both. Web components get a framework-free fixture (`mount(container)`) on the same esbuild path. A closed shadow root is `not-testable`. The M4 risks are whether axe, IBM, and the virtual screen reader read open shadow roots.
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

Registry and license are decided. One question remains, and it only blocks M8.

1. **Package name.** The dry run can't confirm `automatica11y` is yours to publish (see `spike-package-name.md`). A real publish from a logged-in account settles it. If npm refuses, the fallback is `@instructure/automatica11y`, which is still public.

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

### M1. Skeleton (done).

- [x] `package.json` (`"type": "module"`, Node 20 or newer, `bin`, `files`), `jsconfig.json` for editor checks, test runner (`node:test`).
- [x] `cli.js` with `audit`, `compare`, `run`, `doctor`, `init-skill`, `--version`. Usage errors exit 2.
- [x] `plan/classify.js` with one test per row in the section 4 table, plus the label syntax and the "bare `button` is a package" rule.
- [x] `schema.js` (valibot, holds plan, mapping, and results schemas), `env/versions.js`, `env/browser.js`.
- [x] `doctor` checks Node version and for Chrome or Chromium. A missing browser exits 3 with the install command.
- [x] Lazy-load heavy dependencies with dynamic `import()`. Test that `--plan`, `doctor`, and `--version` run without importing Playwright.
- [x] `--plan` writes `plan.json` without installing or launching anything.

Exit: acceptance criteria for `--plan` and exit code 3 pass. They do: `npm test` runs 43 tests, and `npm run lint` is clean.

**Results.**

- `bin/automatica11y.js` calls `main(argv, io)` in `src/cli.js`. The streams, environment, working directory, and `fetch` are arguments, so tests drive the CLI in-process.
- Targets that can't be classified come back as `failed` entries with a reason (path not found, unsupported file type, HTTP 404, unreachable, bad package name), not as exceptions. One bad target doesn't stop a comparison, and if every target fails the CLI exits 4.
- A directory or URL counts as Storybook only when its `index.json` or `stories.json` has the Storybook shape (an `entries` or `stories` object). A random `index.json` in a static site stays a static site. A real Storybook (Carbon's) classified correctly.
- npm targets stay `kind: "npm"` in the plan with `resolved.version: null` and the requested range. `--plan` can't tell React from web components without reading the package, so M4 fills in the framework and the resolved version. Web components are in scope for v1.
- `doctor` and real runs find a browser without importing Playwright: an `AUTOMATICA11Y_CHROME` override, then Chrome or Chromium in the usual places, then Playwright's headless shell cache. A test traces module resolution in a child process and fails if `--version`, `doctor`, or `--plan` loads a heavy package. Nothing heavy is installed yet, so the guard protects later milestones.
- Real runs write `plan.json`, check the environment, then exit 70 with "tiers arrive in M2." `init-skill` exits 70 until M8. Exit 70 is temporary and goes away in M2.
- `run --plan` re-runs a saved plan and warns when installed tool versions differ.
- `package.json` has `"private": true`, so nothing publishes by accident. Remove it at M8. The package is public on npm under the MIT license (`license`, `publishConfig.access`, and a `LICENSE` file are set).
- `jsconfig.json` runs with `strict: false`. Strict mode demanded annotations on every helper and gave no real bugs. The lint still checks calls and property names.
- The only runtime dependency so far is `valibot`. The others arrive with the milestone that uses them.



### M2. URL and HTML path with the rules tier (done).

- [x] `harness/static-serve.js` serves files and directories over localhost. Pick a free port and shut down cleanly.
- [x] `harness/url.js`, with wait-for-network-idle.
- [x] `tiers/rules/axe.js`, ported from chartty. Separate lists for violations, incomplete, and passes. Cap node selectors.
- [x] `tiers/rules/ibm.js`: inject `ace.js`, run `IBM_Accessibility`, filter by WCAG version and level, and map `FAIL` to violations and `POTENTIAL`, manual, and recommendation results to needs-review. Attach each rule's `toolkitLevel` to its findings.
- [x] `tiers/rules/index.js` and the `--engine` flag (`axe`, `ibm`, `axe,ibm`). Default runs both. Reject unknown engine names with exit 2.
- [x] Self-test on every run: audit a known-bad snippet with each engine and refuse to report if either engine misses it (ported from chartty).
- [x] Inject `ace.js` with `page.evaluate`, never `addScriptTag` (see `spike-ibm.md`).
- [x] Never merge findings across engines. Add a test with a page both engines flag and assert both report separately, each labeled.
- [x] `results.json` writer (schema lives in `schema.js`) and `report/single.js`, a plain function that renders `report.md`.
- [x] Fixture pages in `test/fixtures/`: missing label, low contrast, broken dialog focus return, plus clean twins. Assert exact rule IDs per engine. Include the clean twin and assert axe and IBM report no violations on it.
- [x] Fail checks (Finding 9): `--fail-on-axe`, `--fail-on-ibm`, `--fail-mode any|all`, exit code 1, the `failCheck` object in `results.json`, and exit 2 on invalid combinations.
- [x] Tests for the fail matrix: each flag alone, both flags with `any`, both with `all`, one engine tripped, a flag for an engine left out of `--engine`, and `--fail-mode` without a flag.
- [x] Determinism test: same plan twice, identical findings.

Exit: `audit` works end to end on `url`, `html-file`, and `static-dir`. It does: `npm test` runs 71 tests in about a minute, and `npm run lint` is clean.

**Results.**

- **Flow.** A real run checks the environment (exit 3), launches one browser from the path `doctor` found, runs the engine self-test (exit 3 if either engine misses a known problem), audits each target, and writes `results.json` and `report.md`. A target that fails becomes a `failed` result with a reason. Exit 4 applies when every target fails.
- **Page evidence.** Page targets use `page` as their archetype key. Tiers the user requests but we haven't built are `skipped` with a reason, and the report says so. They never read as clean. `interactions` arrives in M5 and `vsr` in M6.
- **IBM ruleset.** The `ibm` engine runs the `WCAG_2_0`, `WCAG_2_1`, or `WCAG_2_2` ruleset that matches `--wcag`, not `IBM_Accessibility`. Those rulesets hold only A and AA checkpoints, so `--level AAA` runs the AA rules and says so in the results and the report. Level `A` keeps only checkpoints marked A. Findings carry WCAG criteria (for example `1.4.3`) for both engines.
- **Pass counts.** Both engines report `passesCount` in the same unit: the number of rules that passed. IBM reports a result per element, so the adapter counts distinct passing rules.
- **axe-core version.** `@axe-core/playwright` ships its own copy of axe-core, which was one minor version behind ours. The adapter hands AxeBuilder our `axe.min.js`, so the version we record is the version that ran.
- **Fail check.** `failCheck` in `results.json` records totals per engine and a `targets` object with one entry per target. In `all` mode a target trips only when every checked engine hits on that target, so two targets that each trip one engine don't add up to a trip.
- **Static directories.** Only `index.html` is checked, and the report says so. A directory with no `index.html` is a failed target.
- **Report.** `report/single.js` renders one report for `audit` and `compare`: coverage matrix, findings per engine and target, fail check, and the method note. Counts from zero to nine are spelled out in prose. The matrix across targets is basic until M7.
- **Fixtures.** `test/fixtures/` holds a clean page, missing-label, low-contrast, missing-alt, a static site, and a site without `index.html`. Two dialog pages (`bad-dialog.html`, `good-dialog.html`) wait for M5: both start closed, so the rules tier correctly sees no violation in the closed state.
- **Dependencies added.** `playwright-core`, `axe-core`, `@axe-core/playwright`, and `accessibility-checker-engine`.



### M3. Storybook path (done).

- [x] `harness/storybook.js`: fetch `index.json` or `stories.json`, enumerate, build iframe URLs.
- [x] Story cap at 200, `--max-stories`, and a truncation warning in the report.
- [x] `--archetypes` filtering by title and tag heuristics, with matched stories listed.
- [x] Check in a small static Storybook build as a fixture.

Exit: `audit` works on a local Storybook directory and a Storybook URL. It does: `npm test` runs 89 tests in about a minute, and `npm run lint` is clean.

**Results.**

- **Units.** Each story renders at `iframe.html?id=<id>&viewMode=story` in its own page and context, four at a time. Results come back in a fixed order. Docs entries are left out. Results key each story as `story:<id>` under `archetypes`.
- **Scope.** Rules run on `#storybook-root` only, for both engines (`--scope` in the adapters: axe `include`, IBM `check(element)`). Page-level rules such as document title, page language, and landmarks stay quiet, and a test asserts it. Without the scope they fire on every story.
- **Render signal.** A story is ready when `body` has `sb-show-main`. `sb-show-errordisplay` and `sb-show-nopreview` fail that story with a reason.
- **Failed stories.** A story that doesn't render is a `gap` with its reason in `storybook.failedStories`, and it shows in the report. It never reads as clean. If no story renders, the target fails.
- **Cap.** The default is 200 (`--max-stories`). When the cap cuts the list short, it takes one story per component in turn, so one big component can't use the budget. The order is fixed, so two runs pick the same stories. A warning says how many were audited.
- **Archetype filter.** `--archetypes` matches story title, name, and tags against name patterns. The report lists the matched stories per archetype. An archetype with no match is a gap and a warning. If nothing matches, the target fails. On a page target the flag is noted in a warning.
- **Report.** Storybook targets aggregate findings by rule, with the number of stories and three examples per rule, because hundreds of stories would drown a per-story listing. Element-level detail stays in `results.json`.
- **Fixture.** `test/fixtures/storybook-static/` is a hand-written stand-in that follows the iframe contract (story id in the query string, render into `#storybook-root`, status class on `body`). It isn't a real Storybook build. I also ran the CLI against a real Storybook (Carbon, 507 stories): six stories from the `button` and `tabs` filter took about five seconds. A real small build in the test suite is still worth adding if the contract changes.
- **Not yet covered.** Storybook builds that need a `viewport` or global setup, and stories with `play` functions that change state, run in their initial state only. The interactions tier handles state later.



### M4. npm React and web component path (four days). Highest risk.

- [ ] `plan/resolve-npm.js`: name to concrete version, using `npm view`.
- [ ] Framework detection: React, web components, unsupported (name the framework), non-UI. For packages with both React and web component signals, pick React, record why, and let `--mapping` set `"flavor"` per archetype. Fill in `kind` (`npm-react`, `npm-wc`, `npm-unsupported`, `npm-non-ui`) and the resolved version in the plan.
- [ ] Shadow DOM spike first, one note in `.agents/notes/spike-shadow-dom.md`: build a small open-shadow-root custom element and check what axe, IBM, and the virtual screen reader report inside it. Adjust the web component plan to what they do.
- [ ] `harness/npm-react.js` and `harness/npm-wc.js`: isolated temp install, export or manifest scan, candidate mapping, fixture generation, esbuild bundle, local serve. Share the install and serve code.
- [ ] `plan/mapping.js`: load and validate `--mapping`. Validation renders each fixture, checks for the two hooks, and fails on console errors. Bad fixtures become `gap`.
- [ ] One parameterized fixture template per flavor (React and web component). Start with button, dialog, and tabs. Apply the eight contract tweaks in `spike-fixtures.md`, including an `alias` that pins one copy of React.
- [ ] Clean up temp directories on exit, including on failure.

Exit: `audit` on one non-compound React library (button, tabs), one compound React library (Radix dialog, authored fixture), and one web component library (a small Lit or Shoelace-style package, authored fixture where needed). Closed shadow roots report `not-testable`.

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
