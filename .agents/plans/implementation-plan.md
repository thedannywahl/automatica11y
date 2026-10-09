# automatica11y implementation plan.

Companion to `npm-package-and-skill.md`. That file is the spec. This file covers what changed after evaluating it, what to build first, and how to know each step is done.

## 1. Evaluation summary.

The handoff is solid. Scope, non-goals, CLI contract, plan and results schemas, and report rules are specific enough to build from. The build order de-risks the right things first. Four findings below change or sharpen it.

### Finding 1: the package name has history.

`npm view automatica11y` returns an "Unpublished" tombstone. Someone published `0.1.1` on October 31, 2016 and unpublished it on July 17, 2020. npm usually lets a new owner publish a fresh name after unpublish, but it permanently blocks the old version number.

- Start at `0.2.0` or higher. Never `0.1.1`.
- Run `npm publish --dry-run` in M1, not M8. If npm refuses the name, we need a fallback (a scoped name like `@instructure/automatica11y`) before the CLI and `SKILL.md` hard-code it.
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
- [x] `cli.js` with `audit`, `compare`, `run`, `doctor`, `--version`. Usage errors exit 2. (`init-skill` was built in M1 as a stub and removed in M8.)
- [x] `plan/classify.js` with one test per row in the section 4 table, plus the label syntax and the "bare `button` is a package" rule.
- [x] `schema.js` (valibot, holds plan, mapping, and results schemas), `env/versions.js`, `env/browser.js`.
- [x] `doctor` checks Node version and for Chrome or Chromium. A missing browser exits 3 with the install command.
- [x] Lazy-load heavy dependencies with dynamic `import()`. Test that `--plan`, `doctor`, and `--version` run without importing Playwright.
- [x] `--plan` writes `plan.json` without installing or launching anything.

Exit: acceptance criteria for `--plan` and exit code 3 pass. They do: `npm test` runs 43 tests, and `npm run lint` is clean.

**Results.**

- `bin/automatica11y.js` calls `main(argv, io)` in `src/cli.js`. The streams, environment, working directory, and `fetch` are arguments, so tests drive the CLI in-process.
- **Changed after M8:** a bare word is now a path relative to the working folder, and only the `npm:` prefix picks a package. The first rule (a bare word is a package) let a folder or a typo change what a target meant. Now a bare word that isn't a path fails with a hint (`npm:name` for a package, `https://` for a web address), and any URL scheme other than http and https fails.
- Targets that can't be classified come back as `failed` entries with a reason (path not found, unsupported file type, HTTP 404, unreachable, bad package name), not as exceptions. One bad target doesn't stop a comparison, and if every target fails the CLI exits 4.
- A directory or URL counts as Storybook only when its `index.json` or `stories.json` has the Storybook shape (an `entries` or `stories` object). A random `index.json` in a static site stays a static site. A real Storybook (Carbon's) classified correctly.
- npm targets stay `kind: "npm"` in the plan with `resolved.version: null` and the requested range. `--plan` can't tell React from web components without reading the package, so M4 fills in the framework and the resolved version. Web components are in scope for v1.
- `doctor` and real runs find a browser without importing Playwright: an `AUTOMATICA11Y_CHROME` override, then Chrome or Chromium in the usual places, then Playwright's headless shell cache. A test traces module resolution in a child process and fails if `--version`, `doctor`, or `--plan` loads a heavy package. Nothing heavy is installed yet, so the guard protects later milestones.
- Real runs write `plan.json`, check the environment, then exit 70 with "tiers arrive in M2." Exit 70 was temporary and goes away in M2.
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



### M4. npm React and web component path (done).

- [x] `plan/resolve-npm.js`: name to concrete version, using `npm view`.
- [x] Framework detection: React, web components, unsupported (name the framework), non-UI. For packages with both React and web component signals, pick React, record why, and let `--mapping` set `"flavor"` per archetype. Fill in `kind` (`npm-react`, `npm-wc`, `npm-unsupported`, `npm-non-ui`) and the resolved version in the plan.
- [x] Shadow DOM spike first, one note in `.agents/notes/spike-shadow-dom.md`: build a small open-shadow-root custom element and check what axe, IBM, and the virtual screen reader report inside it. Adjust the web component plan to what they do.
- [x] `harness/npm-react.js` and `harness/npm-wc.js`: isolated temp install, export or manifest scan, candidate mapping, fixture generation, esbuild bundle, local serve. Share the install and serve code.
- [x] `plan/mapping.js`: load and validate `--mapping`. Validation renders each fixture, checks for the two hooks, and fails on console errors. Bad fixtures become `gap`.
- [x] One parameterized fixture template per flavor (React and web component). Start with button, dialog, and tabs. Apply the eight contract tweaks in `spike-fixtures.md`, including an `alias` that pins one copy of React.
- [x] Clean up temp directories on exit, including on failure.

Exit (met): `audit` on one non-compound React library (button, tabs), one compound React library (Radix dialog, authored fixture), and one web component library (a small Lit or Shoelace-style package, authored fixture where needed). Closed shadow roots report `not-testable`.

**Results.** `npm test` runs 111 tests in about 70 seconds, and `npm run lint` is clean. I also ran real packages from the registry: Radix Dialog (React, authored fixture), `react-aria-components` and `@headlessui/react` (React, templates), and Shoelace (web components, template). Each audit took four to 13 seconds.

- **Shadow DOM spike** (`spike-shadow-dom.md`): axe and IBM read open shadow roots. The virtual screen reader reads no shadow roots, so M6 reports shadow content as not testable. A closed root hides its content from every engine and looks clean, so an init script that wraps `attachShadow` records closed roots on every target type, and the report lists them under "Not testable."
- **No separate planning step.** `--plan` resolves npm metadata with `npm view` (version and framework guess) but installs nothing. The first real run installs the package, discovers its exports or custom elements, writes the candidate mapping to `mapping.json` (the format `--mapping` reads) and into `plan.json`, and audits whatever has a fixture. The skill reviews the mapping, writes fixtures into `fixtures/<target id>/<archetype>.jsx` (or `.js` for web components) or names them in a mapping file, and reruns. Fixtures in that folder are found without `--mapping`.
- **Discovery.** The runner bundles `import * as lib from "<package>"` and loads it in the browser, so it reads real exports and compound parts such as `Dialog.Trigger`, and records every custom element the package defines. A package with no framework signal in its metadata is decided here: custom elements mean web components, React components mean React, and neither means `not-applicable`.
- **Templates.** Only `button` and `link` have templates, because other archetypes are compound and need a fixture. A template that can't mark its trigger (the library drops `data-*` props) becomes a gap with that reason. Every other archetype without a match or a fixture is a gap, listed in the report.
- **Fixture contract in practice.** Exactly one `data-a11y-trigger`. No console errors on mount, except a missing favicon. Web component fixtures are plain `.js` files that default-export `mount(container)`, and the entry imports the package first, so its elements get defined. A fixture that doesn't mount, doesn't bundle, or breaks the contract is a gap with the reason, and the other archetypes still run.
- **States.** Dialog, menu, tooltip, and combobox run `closed` and `open`. Accordion runs `collapsed` and `expanded`. Others run `initial`. The open state activates the trigger (focus for tooltips) and waits for `data-a11y-root` to show or the trigger to report `aria-expanded`. The rules scope is `#root` in the first state and `#root` plus `[data-a11y-root]` in the next, so portals count. A state that never appears fails the engines for that state.
- **Status values.** Targets can now end `ran`, `failed`, `unsupported` (framework named), or `not-applicable`. Exit 4 means no target ran.
- **Cleanup.** Each package installs into its own temporary folder, built and served from there, and removed afterward. `AUTOMATICA11Y_KEEP_TEMP=1` keeps it for debugging.
- **Not done from `spike-fixtures.md`.** An optional `open` export to pick the activation method, and a hard failure when two copies of React resolve. The alias pins one copy, so the second matters less. Both can wait for a real need.
- **Found along the way.** `aria-dialog-name` is a best-practice rule in axe 4.14, so the WCAG tag set leaves it out. The tests use an image without alt text that only exists in the open state instead.
- **Dependencies added.** `esbuild` and `@guidepup/virtual-screen-reader` (M6 uses the latter), plus `react` and `react-dom` as dev dependencies for the test packages.

### M5. Interactions tier (done).

- [x] `archetypes.js` step table plus one runner. Add rows for button, link, dialog, menu, and tabs first. Then combobox, form-field, accordion, and tooltip.
- [x] Shared checks: Tab reachable, visible focus, no focus trap.
- [x] Visible-focus method: computed-style diff first, screenshot diff as backup. Record which method fired.
- [x] Every check returns `pass`, `fail`, or `not-applicable` with a detail string.
- [x] Test each archetype row against a known-good and a known-bad fixture.

Exit: the full check table in spec section 7 has a test per row.

**Results.** All nine archetypes with checks are built. `npm test` runs 140 tests in about two minutes, and `npm run lint` is clean. That test failed twice in full runs (about 170 ms, "context has been closed"), and passed alone and on rerun. A likely cause was an unawaited `addInitScript` racing the context close on a 404 page, so `openPage` now awaits its `beforeGoto` hook. Three full runs since have passed, but the race was never reproduced on demand, so watch for it.

- **Shape.** `tiers/interactions/archetypes.js` is the table: each check has a name, the WCAG criteria it speaks to, and a function that returns `pass`, `fail`, or `not-applicable` with a detail. `index.js` is the one runner. It gives every check its own fresh page and context, with a timeout, so no check inherits another's state. `helpers.js` installs a small kit into the page (`window.__a11y`) that reaches through open shadow roots.
- **Checks.** Every archetype gets `trigger-reachable-by-tab`, `focus-indicator-visible`, and `no-focus-trap`. Then:
  - button and link: `enter-activates`, `space-activates` (Space is `not-applicable` for links)
  - dialog: `focus-moves-into-dialog`, `tab-stays-inside-dialog`, `escape-closes`, `focus-returns-to-trigger`
  - menu: `opens-with-enter-or-arrow`, `arrow-keys-move-between-items`, `escape-closes-and-returns-focus`
  - tabs: `arrow-keys-move-between-tabs`, `home-and-end-work`, `selected-state-exposed`
  - combobox: `arrow-down-opens-list`, `arrow-keys-change-active-option`, `enter-selects`, `escape-closes`
  - form-field: `label-associated`, `error-associated-on-invalid`
  - accordion: `expanded-state-exposed`, `enter-toggles`, `space-toggles`
  - tooltip: `appears-on-focus`, `escape-dismisses`, `content-reachable-on-hover`
- **Results.** A fourth result, `error`, covers a check that couldn't finish (it threw or timed out). It counts as a gap and never as a pass or a fail. Each check carries `criteria`. The focus-indicator check carries `method`: it compares computed styles first, then a screenshot of the area around the trigger, and the report says which one found the change.
- **Where it runs.** Once per archetype, in the first state, on its fixture page. Page and Storybook targets report `interactions` as `not-applicable`, because they have no trigger and root hooks. `chart` has no checks and reports `not-applicable`.
- **Judgment calls.**
  - A dialog that isn't marked `aria-modal` counts as non-modal, so a Tab that leaves it is `not-applicable`, not a fail.
  - The form-field error check only counts error text that appears after the input goes wrong, so a hint linked all along doesn't pass it. If the field is invalid but shows no linked or live text, it fails, and the detail says the check can't see the browser's built-in message. If nothing can make the field invalid, it's `not-applicable`.
  - `aria-modal` and the other attributes come from the fixture. A fixture that doesn't set them gets the result its markup earns.
- **Tests.** Each archetype has a good page and at least one bad page in `test/fixtures/interactions/` (22 pages), and a test pins every check's result on every page. A test fails if a check exists that no page exercises. Tests also cover the error and timeout paths.
- **Not covered.** Keyboard behavior for stateful widgets beyond what the table lists, mouse-only interaction, touch, and focus order across several widgets. Anything that needs a human to judge meaning stays in the method note.

### M6. vsr tier (done).

- [x] `tiers/vsr.js`, ported from chartty, using the `page.evaluate` injection from `spike-vsr.md` (Finding 2). Cap the walk at 150 steps and report truncation.
- [x] Record the announcement log per state. Label every result `simulated: true`.
- [x] Flag unnamed controls and generic roles as data. No automatic judgment of the log.
- [x] Method note says the run used the live page, or a DOM snapshot if the fallback fired.

**Results.** `src/tiers/vsr.js` runs in the live page, as the M0 spike found. `npm run lint` is clean.

- **Injection.** The browser build is one ES module. The tier turns its `export` line into `window.__vsr` and runs it with `page.evaluate`, which a strict CSP doesn't block.
- **Every result is simulated.** The tier result carries `simulated: true` and the package version, and the report says it isn't a real screen reader.
- **Where it runs.** Page targets walk `body`. Storybook stories walk `#storybook-root`. npm fixtures walk `body` in each state, so a dialog gets a closed log and an open log. A state that never appeared is `skipped` with the reason.
- **Wrap-around.** Inside a container that isn't the whole document, the reader loops back to the start instead of ending, and a first version of the walk ran to the cap and produced hundreds of false flags. The walk now stops when the log starts repeating (`repeatLength`). The repeating part can begin a step or two in, because the reader announces a dialog container twice at the start. A long document with no repeat stops at 150 steps, and the result says it was truncated.
- **Flags.** The tier marks only two patterns: a control announced as only its role (`button`, `link`, `image`, `textbox`, and similar), and a role announced as generic. The report calls them phrases for a person to check. It doesn't judge the log.
- **Shadow DOM.** Open shadow roots inside the walked container are listed as not testable, with their host tags, in the tier result and in the target's not-testable list. The unnamed button inside a shadow root isn't flagged, because the reader never reads it.
- **Storybook report.** It groups flags by phrase with story counts, because 200 per-story logs would drown the report. Full logs stay in `results.json`.
- **Not built.** Comparing the log against the rules findings, and `chart`-specific handling, which belongs to M7.

### M7. Comparison reporting (done).

- [x] `commands/compare.js` with at least two targets. One failed target doesn't abort the run.
- [x] `report/comparison.js`: coverage matrix first (target by archetype by tier), then findings.
- [x] Mixed-evidence warning when component and page targets mix.
- [x] `--lib-a11y on,off` runs both configurations and labels each.
- [x] Chart archetype with canvas detection. Canvas-only output reports `not-testable`.
- [x] Test every rule in spec section 9 against fixed `results.json` inputs.

Exit: two-library comparison meets the acceptance criterion.

**Results.** 164 tests pass in about two minutes, and `npm run lint` is clean.

- **Report split.** `report/parts.js` holds the shared pieces. `report/single.js` renders an audit. `report/comparison.js` renders a `compare` of two or more targets. `report/index.js` picks one.
- **Coverage matrix.** One table per tier (rules, interactions, virtual screen reader), with archetypes as rows and targets as columns. Each cell says `ran`, `gap`, `not-testable`, `not-applicable`, `skipped`, or `failed`. A cell names the configuration (state, library accessibility) when a target has more than one, and the story count when a Storybook row stands for several stories. A target whose archetypes were all gaps still shows each gap, instead of one `failed` for the whole column.
- **Findings.** Impact and Toolkit-level tables sit apart, one per engine, with no totals across engines or targets. Then one table per archetype puts targets side by side: rule IDs with element counts per engine, failed interaction checks, and flagged virtual screen reader phrases. Counts in those tables are numerals, because they are data, and prose spells out zero through nine.
- **Same settings.** The report states that every target ran with the same WCAG version, level, engines, and archetypes. They share one options object, so they can't differ.
- **Mixed evidence.** Components plus pages, or a Storybook plus a page, open with the non-equivalence warning above the matrix.
- **Storybook rows.** The runner now matches every story to archetypes even without `--archetypes`, so a Storybook lines up by archetype with an npm target. A story-less archetype is a gap.
- **`--lib-a11y`.** A mapping entry with `"libA11y": true` declares that the library has opt-in accessibility features. The fixture receives `{ libA11y }` (a prop in React, a second argument to `mount` for web components), and the runner loads it with `?libA11y=on` and `?libA11y=off`. Each result carries its label in the config, the report headings, and the comparison rows. `--lib-a11y on` runs only that side. An archetype that doesn't declare the option runs once, unlabeled.
- **Canvas.** If a scope is mainly `<canvas>` with no label, text, table, or SVG, the rules tier reports `not-testable` for both engines and skips them. It never reports clean. A canvas with a label or a table nearby is tested, with a note that the drawing itself isn't.
- **Fix found while testing.** An npm package version that the registry listed but couldn't yet serve (`ETARGET` on a package published minutes earlier) failed that target with the reason, as designed. A retry on `ETARGET` would help, and I left it for later.

### M8. Skill and packaging (done, except the release itself).

- [x] The skill, per spec section 11, split in two: a bootstrap in `skills/automatica11y/` and the full steps in `skills/automatica11y-runner/`, with the version handshake in the runner.
- [x] ~~`init-skill` installs `SKILL.md`~~ Dropped. The skill is plain files, and `automatica11y guide` prints the guidance instead.
- [x] README: install, usage, limits, the fixture-trust note, and the "no automated violations found" language.
- [x] Pack the tarball and install it in a clean directory. (`npm link` was skipped on purpose. See below.)
- [x] CI: unit and fixture tests on every push. Scheduled latest-dependency job that opens an issue on failure.
- [ ] Publish `0.2.0`. This is Danny's step (see below).

Exit: all acceptance criteria in spec section 13. They hold. See the check at the end of this section.

**Results.** `npm test` runs 188 tests in about two minutes, and `npm run lint` is clean.

- **Runner skill.** `skills/automatica11y-runner/SKILL.md` walks a model through the version check, `doctor`, turning a request into a command, the fixture loop for npm packages, running and reading `results.json`, the report rules from the spec's section 9, and what to say when a target can't be tested. `references/fixtures.md` holds the fixture contract with React and web component examples. A guard test checks that every `--flag` and command the skill mentions exists, that its exit-code table matches, and that its archetype list matches the tool's, so the skill can't drift from the CLI unnoticed.
- **Version handshake.** `SKILL.md` states the series it works with (`0.2.x`: in the 0.x series a minor version can change behavior, and from 1.0 the major version is enough). It runs `npx --yes automatica11y@latest --version` and stops if the output doesn't start with that series, telling the user to get a matching copy of the skill. The file is static now, so a test fails if its series disagrees with the version in `package.json`. Bump both together.
- **Two skills.** `skills/automatica11y/` is a bootstrap: one file, `SKILL.md`, that a user can copy anywhere. It advertises the tool (the `description` carries the triggers), then says to check Node, run `npx --yes automatica11y@latest guide`, and follow the output, and to stop if it can't run commands. It names no version, so it never goes stale, and it stays under 40 lines. `skills/automatica11y-runner/` holds the full steps and `references/fixtures.md`, and ships with the tool, so it always matches the tool's version. Each skill is a self-contained folder named for its skill, as the Agent Skills format expects, with a `compatibility` line in its frontmatter. The folders are separate from the user's `fixtures/` folder and from `test/fixtures`.
- **`guide`.** `automatica11y guide [agents|skill|fixtures]` prints a guidance file to stdout: `AGENTS.md`, the runner's `SKILL.md`, or the fixture guide. It's read-only, loads no heavy dependency (a test checks this), and exits 2 with the topic list for an unknown topic. An agent needs no file path, no install folder, and no copy of the skill, only `npx`. This replaced the idea of an install command. The guidance comes from the same package as the tool, so there's no version drift.
- **`AGENTS.md`.** It ships in the package and the repository. Its first section tells an agent asked to check or compare accessibility to run `guide skill`, and `guide fixtures` when it needs the fixture guide, and to read the files directly if it can. Its second section tells contributors in a checkout what to run and which rules matter most. Tests check that every path it names exists, that it names no vendor, and that its version series matches the runner's.
- **Agent-agnostic.** No skill or guide names an agent, vendor, or agent-specific path, and a test fails if one appears. The runner carries the essentials of the fixture contract and a React and a web component example, so it still works if the fixture guide can't be opened, and says to run `guide fixtures` to print it. The runner names the version series it works with (`0.2.x`) and stops on a mismatch. The README explains `guide`, and which skill folder to copy.
- **Packaging.** `private` is gone, `license` is MIT, `files` covers `bin`, `src`, `SKILL.md`, and `references`, and `prepublishOnly` runs the type check. A test checks the real tarball contents with `npm pack --dry-run`, that every import in `src` is a declared dependency, that the README documents every flag and exit code, and that the version and the skill series agree. The tarball is about 66 KB.
- **Clean install.** I packed the tarball, installed it into an empty folder, and ran `--version`, `doctor`, an `audit` with a fail flag on a local page, an `audit` of the real Shoelace package from the registry, and `audit` on a real npm package. All worked. `npm link` would have changed the global npm prefix, and the tarball install tests the same bin entry more faithfully, so I didn't link.
- **CI.** `.github/workflows/test.yml` runs lint and tests on Node 20, 22, and 24 on every push. `latest-deps.yml` runs weekly against the latest of every tool and opens (or comments on) an issue labeled `latest-deps` when a test fails. **Neither workflow has run on GitHub.** The YAML parses, but only the first real run shows whether the steps work, and I've only run the suite on Node 24.
- **Not tested.** The skill hasn't run in a live agent session. The guard tests check it against the CLI, but not how a model follows it.

**Release.** `automatica11y@0.0.0-stage` is on npm (a placeholder published by thedannywahl), so the name is claimed. `0.2.0` isn't published. When it is, `npm publish` runs the type check first. After publishing, `npx automatica11y@latest --version` should print `0.2.0`, and the skill's handshake will work as written.

**Acceptance criteria (spec section 13).**

- `audit` and `compare` work for all four target types. Yes.
- `--plan` prints every target's classification without installing or launching anything. Yes. For npm targets it reads registry metadata only.
- A comparison of two React libraries gives a coverage matrix, per-archetype findings, and a report that follows every rule in section 9. Yes, in tests with fake libraries and in real runs.
- Canvas-only output reports `not-testable`, never clean. Yes.
- A missing browser exits 3 with the install command. Yes.
- Every report records the run date, tool versions, and resolved target versions. Yes. Versions apply to npm targets. Pages and Storybooks have no version to record.
- `SKILL.md` is in the repository, names the version series it works with, and doesn't depend on one agent. Yes, in tests. Not tried in a live session.

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

## 6. Status.

All nine milestones are built. What's left is the release (`npm publish` of `0.2.0`, Danny's step), the first real run of the two GitHub workflows, and trying the skill in a live agent session.

### End-to-end run of 0.3.1 and the fixes.

Five subagent scenarios plus a real `npx` smoke test of the published 0.3.1. Fixes made on main:

- The install retries once with `--prefer-online` when npm reports ETARGET from a stale local cache, and adds a warning.
- The bootstrap skill runs `guide skill` directly and retries `npx` with `--prefer-online` on ETARGET.
- The runner skill states the order of sections 1 and 2, asks for missing information in one message, handles mixed-kind compares, defines `needs-fixture` versus `no-match`, notes that a partly failed run still exits 0, orders findings, and allows one retry.
- The React detection reason now says whether react is a peer dependency or a dependency.

Still open: the first run of the weekly latest-deps workflow, a trial in a live agent session, and the Radix open-state `aria-hidden-focus` finding on the trigger (unclear if it's a Radix defect or a harness artifact). Version 0.3.0 on npm is broken, so deprecate it.

### MUI and InstUI button comparison (0.3.2) and fixes.

MUI failed to bundle because Emotion is an optional peer dependency that npm leaves out. Two fixes on main:

- When a bundle can't resolve a package that an installed library declares as an optional peer, the tool installs it (keeping React pinned, since a loose install prunes peer-only packages) and bundles once more, with a warning in the report.
- A `button` or `link` is no longer treated as compound just because exports like `ButtonBase` and `ButtonGroup` share its prefix. Only real parts (such as `Button.Root`) count.

Result with both fixes: MUI Button and InstUI Button each ran all three tiers with no automated violations. IBM listed items to review only (`aria_content_in_landmark` on both, `style_focus_visible` on MUI).

### Harness page and focus indicator check.

- The harness page now wraps the fixture in `<main>`, so IBM no longer reports `aria_content_in_landmark` on a lone component. The virtual screen reader log gains `main` and `end of main`.
- `focus-indicator-visible` reads resolved styles for the trigger, its `::before` and `::after`, and up to 30 inner elements. Only changes a person could see count (outline with width and color, box shadow, border, colors, text decoration, an element that renders only on focus). An outline offset alone doesn't count. The screenshot comparison stays as the fallback. MUI draws its ring on a child ripple, so it used to fall through to the screenshot.

### Computed tier.

A fourth tier, `computed`, measures resolved styles in the browser for each archetype fixture's trigger. It reports on its own and never joins the axe-core or IBM counts.

- `text-contrast-by-state` (1.4.3): text contrast at rest, hover, keyboard focus, and pressed, against the composited backdrop, with the large-text threshold.
- `boundary-contrast` (1.4.11): the strongest of the control's border, fill, or icon against its surroundings. A field must reach 3:1. A control with visible text that falls short is `not-applicable`, since the text identifies it. An icon-only control must reach 3:1.
- `focus-indicator-contrast` (1.4.11, with thickness noted against 2.4.13 at level AAA): exact colors and width for an outline, ring, or border on the control, and a pixel comparison for anything else (a ripple, a background change). The pass bar for pixels is that the pixels reaching 3:1 cover at least the control's perimeter.
- A gradient, image, blend mode, or partly transparent ancestor gives `undetermined`, which counts as a gap.
- Earlier wording said "2.4.11" for focus contrast. 2.4.11 in WCAG 2.2 is Focus Not Obscured. Focus contrast is 1.4.11, and 2.4.13 is Focus Appearance.

First real run (MUI Button and InstUI Button): MUI's text dips below 4.5:1 in hover and pressed, and its focus ripple changes pixels by only 1.5:1. InstUI's focus outline is 4.55:1.

### WCAG data from the W3C.

Criterion numbers, names, levels, and versions now come from the W3C's published WCAG 2.2 JSON, shipped unchanged in `src/data/wcag-2.2.json` (a test checks its SHA-256 against `wcag-2.2.source.json`). `src/wcag/index.js` reads it. Its terms say to credit the source with a link and not change the content, so the credit sits in the README, `src/data/README.md`, and every report's closing "WCAG data" paragraph. Links to each criterion are ours and are labeled as added. `npm run update-wcag` refreshes the file.

- Reports show each criterion as a linked name (for example "1.4.3 Contrast (Minimum)"), and axe-core finding lines show names too.
- axe-core's compact tags (`wcag1410`) resolve through the W3C list. Sentences that cite a criterion take its name and level from the data.
- A test checks that every criterion any check cites exists in WCAG 2.2.
- Left as is: axe-core's tag names (`wcag22aa`) and IBM's ruleset ids. They're those tools' own vocabularies, not WCAG data.

### The live-region archetype.

An alert-style comparison needed an archetype, so `live-region` joined the list. It's named for the accessibility pattern (a message that appears, changes, or goes away without moving focus), not for any component, and its test pages are plain HTML. One archetype covers `role="alert"`, `role="status"`, `role="log"`, and `aria-live`, because the checks branch on the region's role. Checks: the message is in a live region, has text, the region exists before the message (not required for `role="alert"`), politeness fits the role, focus stays on the trigger, the dismiss control works by keyboard, and focus isn't lost when the message is removed. Seven test pages cover the good and bad cases. Mapping and Storybook matching recognize alert, status, toast, snackbar, notification, and live region.

### Findings from the alert comparison, and fixes.

Running the live-region archetype on a React alert and a web component alert turned up five problems in the tool, all fixed on main:

- A web component package whose `sideEffects` list names only CSS lost its elements, because esbuild dropped the bare `import "pkg"` that registers them. The entry now keeps the package through a namespace import. A fake package covers it.
- Slotted text takes its color from the slot's parent in the flattened tree, and the live-region check finds a role kept inside a component's shadow root around a slot.
- The rules tier scanned a message while it was still fading in, and both engines reported a contrast failure that wasn't there once the fade ended. States now wait for finite animations and transitions (up to 2 seconds) before they're scanned.
- For a live region, the computed tier measures the message text that appears, not the harness trigger, and it ignores one-pixel screen reader copies.
- A library that needs a companion stylesheet or theme rendered unstyled, and its results described that. A mapping entry can now list `install` packages. The fixture imports their stylesheets, and a stylesheet a fixture imports is bundled and linked.

The live-region check also now tells apart a region that was inserted with its message from an element that was in the page but only became a live region when the message arrived.

### The conditions tier.

A fifth tier, `conditions`, opens fresh copies of a page (or a fixture) under a user's settings and environment. It runs on whole pages and on component fixtures. Storybook stories are reported as not applicable. Results are reported on their own and never join the axe-core or IBM counts.

- `reduced-motion-respected` (2.3.3, 2.2.2): `getAnimations()` with and without `prefers-reduced-motion: reduce`, at load and just after the trigger is pressed. Animations that repeat forever, or move for more than 100 ms (transform, offsets, margins, size), must be gone under "reduce". Fades are fine. JavaScript-driven motion isn't visible.
- `dark-mode-contrast` (1.4.3): if frozen screenshots differ under `prefers-color-scheme: dark`, every piece of text on the page is measured for contrast. A page that doesn't adapt is not applicable.
- `forced-colors-focus-visible` (1.4.11, 2.4.7): pixel comparison of the focused and unfocused control with forced colors on, with the elements that opt out (`forced-color-adjust: none`) named.
- `reflow-at-320px` (1.4.10): a 320 by 256 window, with the trigger pressed for fixtures. Sideways page scroll, elements past the right edge (excluding ones inside their own scroll container), and a root that spills out.
- `text-spacing-no-clipping` (1.4.12): the spacing the criterion names, injected with `!important`, then every element that hides overflow is checked for newly cut-off text.

Screenshots that decide whether a page "looks the same" freeze animations first. A running spinner had made every animated page look as if it adapted to dark mode. The pixel bar for a focus indicator is now half the control's perimeter (it was the full perimeter, which a thin anti-aliased default ring missed by five pixels). `openPage` now takes `colorScheme` and `reducedMotion`, and a check can open variants of its own page.

### prefers-contrast and prefers-reduced-transparency.

Three more conditions checks. Chrome 155 supports both media features. `prefers-contrast: more` goes through Playwright's context option for `more` only, so `openPage` sends `prefers-contrast` and `prefers-reduced-transparency` through the DevTools protocol (`Emulation.setEmulatedMedia`), which also covers `less`. That call replaces any other emulated feature, so a variant page sets one preference at a time.

- `more-contrast-respected` (1.4.3, 1.4.6): if frozen screenshots differ under "more", all text is measured. It fails when any text falls below its minimum, or when the lowest contrast drops compared with no preference. A pass also says whether enhanced contrast (7:1, or 4.5:1 for large text) is reached.
- `less-contrast-stays-readable` (1.4.3): if the page softens under "less", text must stay above the minimum.
- `reduced-transparency-respected` (1.4.3, 1.4.11): surfaces holding text with a background that isn't fully opaque, or a backdrop filter, must be opaque under "reduce". Empty overlays aren't counted. The preference isn't a success criterion, and the detail says so.

A page that doesn't respond to a preference is not applicable, never a failure. Counts in the new messages go through `num()` and `plural()` from `src/text.js`, so one through nine are spelled out.

### Generated fixtures.

Where there's no authored fixture and no template, the tool now builds candidates from the evidence it found and keeps one only if it works. Order of sources: authored, then template, then generated, then gap. `--no-generate` turns generation off. Nothing in the code names a library.

- **React.** `kit.js` finds compound parts from the exports: namespaced (`Dialog.Root`), flat (`DialogRoot`, with the base as the root), or a package that is the component (`@scope/react-dialog` exporting `Root`). `react-recipes.js` builds candidates per archetype from those parts, by common names (root, trigger, portal, overlay, positioner, content, title, description, close, item, list, panel, input, label), including the usual controlled form (`open` and a close handler, five name pairs), several accordion and tabs conventions, tooltip single components that take a text prop, label wiring for fields, and a message that is mounted or shown by prop. At most eight candidates are probed per archetype.
- **Web components.** Discovery now records each element's observed attributes, class members, and shadow slots. Recipes need evidence: an `open` attribute or `show()` for a dialog, a `tip`-style attribute for a tooltip, a way to append a message, label or value for a field. Menu, tabs, accordion, and combobox have no web component recipe, because they depend on children and slots an element can't describe well enough to guess.
- **Marking.** A generated fixture can't know how a library forwards props, so it passes `data-a11y-trigger` where it can, and a small poller marks what's missing by role (reaching into open shadow roots): dialog, menu, tooltip, listbox, live roles, the first tab, the control an accordion trigger names, a field's parent.
- **Probe.** Before a candidate counts, it must bundle, load with no errors, have exactly one trigger, show a root after activation (waiting for the marked root itself, since a trigger can report `aria-expanded` an instant before the poller runs), and carry a role that fits. A field's trigger must be something a person can type in, and a tab's trigger must have role tab. A rejection says why, and says when a missing role may mean the library doesn't set it.
- **Reporting.** The Archetypes table has a Fixture column, a generated row names its recipe and the parts it used, and comparison coverage cells say "(generated fixture)". One paragraph explains that generated results are lower evidence. Winners are written to `<out>/generated/<id>/<archetype>.jsx` so they can be adopted. results.json records `fixture: { source, recipe, summary, used, file, attempts }`, and mapping.json gets `status: generated`.

Checked against real packages: Radix dialog, tooltip, tabs, accordion, and dropdown menu were all generated and verified on the first run, and the IBM finding on the open dialog matched the earlier hand-written fixture. InstUI's alert stays an honest gap, because its alert sets no live role without a `liveRegion` prop. Pantoken's dialog, message, and field were generated. Along the way: a helper read message text with `textContent`, which is empty when a live region gets its text through a slot, so it now follows slots. The mapping now prefers the archetype's own word, so a tooltip is chosen over a popover. A web component package that marks only CSS as having side effects was fixed earlier.

### Framework adapters, and Vue 3.

The React and web component code that was spread through the audit flow is now one module per framework in `src/frameworks/`: `react.js`, `wc.js`, and `vue.js`, with `index.js` as the registry. An adapter says how to recognize a package from its registry metadata (`detect`), which runtime packages to keep to one copy (`runtime`, and `bundle(workDir)` for the esbuild alias, JSX handling, and defines), how to mount a fixture (`entry`), how to list exports (`discoverEntry`), the button and link `template`, `generate`, and `describe` for the report. A test checks that FLAVORS and TARGET_KINDS in the schema agree with the registry, and that every adapter has the same members. Adding a framework is a module plus two schema entries.

- **Generation was split by dialect.** `jsx-recipes.js` holds the compound-part recipes once, and `dialects.js` carries what differs between React and Vue: how state is declared, read, and written (`useState` or `ref`), how the fixture starts its marking code (an effect or `onMounted`), how a prop is spelled (a Vue name with a colon, like `onUpdate:open`, goes in through a spread), and the controlled prop pairs (`open` with `onUpdate:open`, `modelValue`, and so on).
- **Vue.** Libraries ship compiled components, so nothing compiles single-file components. Fixtures are JSX. esbuild 0.28 has no `jsxInject`, so the adapter writes a one-line shim that exports Vue's `h` and `Fragment` and passes it as `inject`, and a fixture never imports `h`. Children become the default slot. A fixture's default export is a component, and an optional `setup(app)` export installs plugins before mounting. One copy of Vue is aliased, and the Vue feature flags are defined. Vue 3 is detected from a `vue` peer or dependency (ranges that allow 3 count), Vue 2 is reported as unsupported, and a custom elements manifest still wins over Vue.
- **Finding the right family.** On real packages the mapping's best export was often a part (`PopoverArrow`, `MenubarMenu`) picked by alphabetical order. Generation now groups the exports that match an archetype into families (a prefix shared by two or more exports, or a namespaced export), ranks them by how well the base fits the archetype's own name and then by size, and tries the top three. A person's mapping `export` still means only that component is tried. The mapping also now ranks `startsWith` matches by the archetype's own word first, so a tooltip beats a popover.
- **Recipe additions.** A menu's items may be rendered as divs (`as="div"`), and an accordion with no item part (a disclosure) is a root with a button and a panel.
- **Bug found along the way.** The web component template took the tag as its second argument while the uniform adapter interface passes the package name second. The closed shadow root test caught it.

Checked on real packages with no fixtures written: Reka UI generated a dialog, tooltip, tabs, accordion, menu, and form field. Headless UI Vue generated a dialog (controlled with `open` and `update:open`) and a field, and reported its menu, tabs, and disclosure as gaps with the reason. An authored Vue fixture for the Reka dialog passed all seven dialog interaction checks, and that example is now in the runner skill. Not covered: Svelte and Angular (see the sizing notes), and Vue libraries that need plugin installation, which need an authored fixture with `setup(app)`.

### npm sub-paths.

`npm:name[@version][/sub/path]` tests one entry of a package, such as `npm:@scope/ui-buttons/button` or `npm:@scope/ui-buttons@11.7.8/button/v2`, so two versions of a component can be compared side by side. The sub-path is part of the import specifier: discovery, templates, generated fixtures, and the mount entries import `name/sub/path`, while install and registry lookups use the bare name. The default target id includes the sub-path (`scope-pkg-button-v2`).

- **Parsing.** The version stops at the first slash. A sub-path can't contain empty parts, `.`, `..`, or backslashes, so it can't point outside the package. Capital letters are fine (`closeButton`).
- **Validation, twice.** At plan time the registry's `exports` field is checked, so `--plan` fails a wrong sub-path before anything is installed. After install the package's own `package.json` is checked, and a package with no exports map is checked against its files (extensions can be left off, and a folder with an index file works). Exact keys, patterns (`./es/*`, `./feat/*.js`), and `null` entries are handled, and a string or array `exports` means the root only.
- **The message.** A wrong sub-path names the package and version, suggests the closest exports (a shared start, a shared last part, or a typo of it), lists up to twelve exports and a few patterns, and says when a package exports only its main entry.
- **Results.** `results.npm.subpath`, and the report says which entry was tested. A package name that says what it is still counts: `pkg/dialog` makes a dialog family eligible for generation.

Checked on the real `@instructure/ui-buttons@11.7.8`: `v11_6`, `v11_7`, and `es/Button/v2/index.js` all ran from templates, and `button/v2` was rejected at plan time with the real exports listed, because that version doesn't export that sub-path.

### The README and the docs site.

The README is now the short case for the tool: why use it, one real result, a quick start, how agents use it, what it won't do, and the license and W3C attribution. The long-form documentation moved to `docs/` (home, targets, what it checks, options and exit codes, reading a report, npm packages and fixtures, using it with an agent, limits). Two pages on the site are the skills' own files, built straight from `skills/automatica11y-runner/SKILL.md` and `references/fixtures.md`, so the site and the agent see the same words and can't drift.

- **Build.** `npm run docs:build` runs `scripts/build-docs.js`, which uses `marked` (a dev dependency) to turn the Markdown into plain HTML in `site/` (gitignored). The pages have no script. They carry a skip link, a labeled nav, a main landmark, a labeled and focusable wrapper around each table (a repeated heading gets a numbered label), code that wraps and so needs no focus, and light, dark, and forced-colors styles. A relative link in a source file becomes a link to the page it names, or to the file on GitHub.
- **Deploy.** `.github/workflows/docs.yml` rebuilds on a push to main that touches docs, skills, the build script, or `package.json`, and force-pushes the built site as a single commit to the `docs` branch. The branch holds only the site, plus `.nojekyll` and a 404 page. GitHub Pages serves it from the branch root once it's switched on in the repository settings.
- **Dogfooding.** The built site was audited with every tier. axe-core was clean from the start. IBM found two things in the first build: two tables under one heading shared a region label, and focusable `<pre>` blocks had no widget role. The conditions checks then found that code in blocks didn't wrap at 320 pixels. All three are fixed, and a test runs the tool on two built pages (rules and conditions) and fails on any violation.
- **Tests that moved.** The flag, exit code, and guide-topic checks now read `docs/`. The README keeps the install lines and the attribution, and a test keeps it under 100 lines and pointing at real pages.

The site is served from the custom domain `automatica11y.dev`. The build writes a `CNAME` file into every build, because each publish replaces the whole `docs` branch, and Pages reads the domain from that file. The domain is one constant (`DOMAIN` in `scripts/build-docs.js`), and the canonical links, the 404 page, the README, and `package.json` (`homepage`, plus `repository` and `bugs`) all use it. A test fails on any leftover `github.io` reference. The DNS records, the Pages source setting, and HTTPS enforcement are repository and registrar settings, not code.
