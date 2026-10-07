# automatica11y build plan.

Handoff document for Claude Code. It's a clean build, so there's no legacy to preserve.

## 1. Goal and scope.

Build an accessibility testing and comparison tool that answers two questions:

- "How accessible is X?" (`audit`)
- "How do X and Y compare?" (`compare`, two or more targets)

It's **not** an attestation or certification tool. Automated checks cover only part of WCAG, so every report says "no automated violations found," never "accessible."

Users invoke it as `/automatica11y <prompt>` in a Claude host, or as a CLI in a shell or CI.

### Non-goals (v1).

- Native screen readers (VoiceOver, NVDA). Add later as a fourth tier.
- Vue, Svelte, Angular, and other frameworks that aren't React or web components. Report "unsupported framework" and stop.
- Component source files (`.tsx`, `.vue`) as targets. They need a bundler and a framework decision.
- A single accessibility score.
- Docker. The existing chartty Docker setup exists to limit variance in performance runs. Accessibility checks don't need it.

## 2. Architecture decisions (settled).

| Decision | Choice |
|---|---|
| Shape | Published npm package (`automatica11y`) with a thin skill on top. |
| Skill's job | Turn a prompt into a declarative command, show it, run it, and write the report from the results JSON. No setup logic. |
| Runner's job | Everything deterministic: classify targets, install, build, test, and write JSON. It never guesses. |
| Dependencies | Plain npm. All dev and runtime tooling at `latest`. No pnpm workspace, no catalog, no pins. |
| Reproducibility | Record resolved versions of every tool and target in the plan and results. Warn, don't fail, when a rerun's versions differ. |
| Isolation | Each npm target gets its own install directory. Never share one `node_modules` between targets. |
| Browser | `playwright-core`, driving the user's installed Chrome (`channel: "chrome"`) when present. Otherwise `doctor` prints the headless-shell install command. Record the browser version. |
| Loading | Lazy. Playwright, esbuild, axe-core, the IBM Equal Access engine, and the virtual screen reader load by dynamic `import()` only when a command or tier needs them. |
| Tiers (v1) | `rules`, `interactions`, `vsr` (virtual screen reader). |
| Rule engines (v1) | `axe` (axe-core) and `ibm` (IBM Equal Access), both run by default. `--engine` picks one or both. Alfa is out of scope. Each engine reports separately, and findings are never merged across engines. |

## 3. Repo layout.

```
automatica11y/
  package.json
  README.md
  SKILL.md                      # source of truth; copied by init-skill
  bin/
    automatica11y.js            # calls main() in src/cli.js
  src/
    cli.js                      # command dispatch
    commands/
      common.js                 # option parsing, validation, plan execution, usage text
      audit.js
      compare.js
      doctor.js
      init-skill.js
    plan/
      classify.js               # target classification
      build-plan.js             # classify every target, assemble plan.json
      resolve-npm.js            # name -> concrete version
      mapping.js                # archetype mapping load/validate
    harness/
      storybook.js              # enumerate stories, build iframe URLs
      url.js                    # plain URL
      static-serve.js           # local static server for html files and dirs
      npm-react.js              # install, generate fixtures, esbuild bundle, serve
      templates/                # one parameterized fixture template
    tiers/
      rules/
        index.js                # runs the selected engines, normalizes output
        axe.js
        ibm.js
      interactions/
        index.js                # runs the step tables
        archetypes.js           # one table: steps, expected role or state, check name per archetype
      vsr.js
    report/
      single.js                 # renders report.md for audit
      comparison.js             # renders report.md for compare
    env/
      versions.js               # read installed tool versions
      browser.js                # Chrome or Chromium check and install hint
  test/
    fixtures/                   # known-good and known-bad HTML pages
    *.test.js
```

Language: plain ESM JavaScript with JSDoc types, Node 20 or newer. No build step. Valibot validates the plan, mapping, and results files at runtime. CI runs `tsc --noEmit --checkJs` as a lint step only.

## 4. CLI contract.

```
automatica11y audit <target> [options]
automatica11y compare <target> <target> [<target>...] [options]
automatica11y run --plan <plan.json>
automatica11y doctor
automatica11y init-skill [--dest <dir>]
automatica11y --version
```

`compare` needs at least two targets. Usage errors exit with code 2.

### Targets.

A target is `[label=]<spec>`. The label is optional and names the target in reports. Without a label, the report uses the package name or hostname.

Classification order. The first match wins:

| Type | Syntax | Detection |
|---|---|---|
| Local path | Starts with `./`, `../`, `/`, `~`, or `file:` | Exists on disk. |
| Storybook | `http(s)://` URL or local directory | `index.json` or `stories.json` found at the root. |
| Plain URL | `http(s)://` | Anything else that responds. |
| npm package | `name`, `@scope/name`, `name@version`, or an explicit `npm:` prefix | Fallback. |

Rules:

- Local paths need the explicit prefix. A bare `button` is a package, never a folder.
- An `.html` file is served from a local static server over `http://localhost`. Never load it over `file://`, because module scripts and relative assets break there.
- A directory is a static site. If it holds `index.json`, treat it as a Storybook build. A static site audits `index.html` only. A directory without one is a failed target.
- Reject other file types with a clear message.
- A bare package name means the latest published version. `name@version` pins one.
- A directory or URL is Storybook only when its `index.json` or `stories.json` has the Storybook shape (an `entries` or `stories` object).
- A target that can't be classified or resolved becomes a `failed` entry with a reason. Exit 4 applies only when every target fails.

### Options.

| Flag | Default | Purpose |
|---|---|---|
| `--wcag` | `2.2` | WCAG version. |
| `--level` | `AA` | `A`, `AA`, or `AAA`. Maps to axe tag sets and to the IBM WCAG ruleset and checkpoint levels. |
| `--tiers` | `rules,interactions,vsr` | Which tiers to run. |
| `--engine` | `axe,ibm` | Which rule engines the `rules` tier runs: `axe`, `ibm`, or `axe,ibm`. |
| `--archetypes` | all | Limit npm and Storybook targets to named archetypes. |
| `--lib-a11y` | `on,off` | Test library accessibility options on, off, or both. |
| `--mapping` | none | Path to a mapping file (see section 6). |
| `--plan` | off | Resolve and print the plan, then stop. |
| `--out` | `./a11y-report` | Output directory. |
| `--fail-on-axe` | none | `minor`, `moderate`, `serious`, or `critical`. Counts axe violations at or above that impact. |
| `--fail-on-ibm` | none | `1`, `2`, or `3`. Counts IBM violations at or below that Toolkit level, so `1` counts only the most essential rules and `3` counts every violation. |
| `--fail-mode` | `any` | `any` exits 1 when any configured engine hits its threshold. `all` exits 1 only when every configured engine hits its threshold. |

### Fail checks.

Fail checks are off unless you set a flag. Each flag configures one engine:

- `--fail-on-axe <impact>` counts axe violations at or above the impact (`minor` < `moderate` < `serious` < `critical`).
- `--fail-on-ibm <level>` counts IBM violations (`FAIL` results) whose Toolkit level is at or below the number. IBM's violations only use levels 1 to 3, so `3` counts every IBM violation. It compares IBM's own label, not axe's impact.
- Needs-review items (axe `incomplete`, IBM potential, manual, and recommendation results) never trip a fail check.

An engine with no flag isn't checked, even if it ran. `--fail-mode` combines the checked engines:

- `any` (default): exit 1 when at least one checked engine hits its threshold.
- `all`: exit 1 only when every checked engine hits its threshold. This works as a high-confidence gate, because both engines have to agree.

Rules:

- A fail flag for an engine that `--engine` leaves out exits 2 with a message.
- `--fail-mode` without any fail flag exits 2.
- With `compare`, the check applies to each target. Exit 1 if any target trips it. Targets that failed to resolve don't count as hits. Exit 4 still applies when every target failed.
- A target is checked per engine across all its archetypes and configurations. Engine counts are never summed together.
- In `all` mode a target trips only when every checked engine hits on that target. Two targets that each trip a different engine don't add up to a trip.
- `--plan` ignores fail flags. It prints them in the plan.
- `results.json` records the outcome in a `failCheck` object: the mode, each checked engine's threshold, hit count, and whether it hit, and the final exit code. The report prints each engine's result and then the combined result.

### Exit codes.

| Code | Meaning |
|---|---|
| 0 | Run completed. (Findings don't change this unless a `--fail-on-*` flag is set.) |
| 1 | Run completed and the fail check tripped (see section 4, "Fail checks"). |
| 2 | Usage error. |
| 3 | Environment problem (no Chrome or Chromium, wrong Node). Print the fix. |
| 4 | Every target failed to resolve or build. |

A single target failing doesn't abort a comparison. Record it as `failed` with the reason and continue.

### Free-form prompts (skill only).

The CLI accepts only the declarative grammar. The skill treats any input that doesn't start with `audit` or `compare` as a prompt, translates it to a command, shows the command, then runs it.

## 5. Plan file.

`--plan` and every real run write `plan.json` to the output directory.

```jsonc
{
  "schema": 1,
  "createdAt": "2026-10-07T00:00:00Z",
  "command": "compare",
  "options": { "wcag": "2.2", "level": "AA", "tiers": ["rules","interactions","vsr"], "engines": ["axe","ibm"], "libA11y": ["on","off"] },
  "tools": { "node": "", "automatica11y": "", "axe-core": "", "ibm-checker-engine": "", "playwright-core": "", "chromium": "", "esbuild": "", "guidepup-vsr": "" },
  "targets": [
    {
      "id": "radix",
      "input": "radix=@radix-ui/react-dialog",
      "kind": "npm-react",              // npm-react | npm-wc | npm-unsupported | npm-non-ui | storybook | url | html-file | static-dir
      "resolved": { "name": "@radix-ui/react-dialog", "version": "1.1.0" },
      "evidenceLevel": "component",     // component | page
      "mapping": { "dialog": { "fixture": "fixtures/radix/dialog.jsx" } }
    }
  ]
}
```

`run --plan` re-executes a saved plan. If installed tool versions differ from `tools`, print a warning and continue.

## 6. Harness strategies.

### Storybook.

1. Fetch `index.json` (or `stories.json`).
2. Enumerate stories. Leave out docs entries. Load each as `iframe.html?id=<storyId>&viewMode=story`, wait for `body.sb-show-main`, and run the rules tier scoped to `#storybook-root`. A story that fails to render is a gap with a reason.
3. Treat each story as a unit. If the user passed `--archetypes`, filter by title or tag heuristics and report which stories matched.
4. Cap the story count at 200 by default, and provide `--max-stories`. When the cap cuts the list short, take one story per component in turn so the audit spreads across the library, keep the order fixed, and report the truncation.

### Plain URL and HTML.

Load the page, wait for network idle, then run tiers at page level. No archetypes apply. Interaction scripts that need a specific archetype are skipped with the status `not applicable`.

### npm package, React.

Detect by `react` in `peerDependencies`.

1. Install `name@version` into a per-target temp directory with its peer dependencies, using `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`. esbuild comes from automatica11y's own install, not the target's.
2. Read the export list and generate a **candidate archetype mapping** (name heuristics, for example `Dialog`, `Modal`, `Tabs`).
3. Generate one fixture file per mapped archetype from `harness/templates/`.
4. Bundle with esbuild and serve locally. Load one page per archetype and state.

**Compound components need authored fixtures.** Libraries like Radix compose parts (`Dialog.Root`, `Dialog.Trigger`, `Dialog.Content`), and templates can't guess that. Handle it this way:

- The runner produces a candidate mapping and writes it into the plan.
- The skill reviews the mapping. For compound or unusual libraries, the skill writes fixture files into `fixtures/<target>/<archetype>.jsx` following a documented contract (see below).
- The runner validates each fixture: it must render, expose the stable test hooks, and mount without console errors.
- A missing or invalid fixture produces a `gap`, never a pass.

**Fixture contract.** Each fixture default-exports a React component that renders the archetype in its initial state. It marks the trigger with `data-a11y-trigger` and the primary surface with `data-a11y-root`. The runner's interaction scripts target only those hooks and ARIA roles.

### npm package, web components.

Detect `custom-elements.json` (or a `customElements` field in `package.json`), or a `customElements.define` call in the package's entry. A package with both React and web component signals runs as React unless the target says otherwise (see below).

1. Install into a per-target temp directory, as for React. No React or peer framework is needed unless the package asks for one.
2. Read the custom elements manifest (or scan the entry) for tag names, and generate a **candidate archetype mapping** from names (for example `my-dialog`, `x-tabs`).
3. Generate one framework-free fixture per mapped archetype from `harness/templates/`.
4. Bundle with esbuild and serve locally, as for React.

**Fixture contract (web components).** A fixture is a plain `.js` file that default-exports `mount(container)`, a function that appends the archetype in its initial state to `container` and may return a promise. It marks the trigger with `data-a11y-trigger` and the primary surface with `data-a11y-root`. Put the hooks on elements the runner can reach: a custom element's host, a slotted light-DOM child, or an element inside an **open** shadow root. Playwright's CSS selectors pierce open shadow roots. Content inside a closed shadow root is unreachable, so the runner reports it as `not-testable` with that reason, never as clean.

The runner validates web component fixtures the same way as React fixtures: they must mount, expose the hooks, and run without console errors. A missing or invalid fixture produces a `gap`.

**Choosing between React and web components.** When a package ships both, the candidate mapping records which flavor it picked and why. `--mapping` can force `"flavor": "wc"` or `"flavor": "react"` per archetype.

Open risks, checked in M4: whether axe, IBM, and the virtual screen reader read content inside open shadow roots. See the implementation plan.

### Unsupported and non-UI.

- Other frameworks: status `unsupported framework`, with the detected framework named.
- No rendering surface: status `not applicable`. Don't invent a score.

### Archetypes (v1).

button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, chart.

A target with no equivalent for an archetype gets a `gap` entry. The comparison shows gaps explicitly.

### Library accessibility options.

Some libraries ship opt-in accessibility features (the Highcharts accessibility module is one). Mapping entries can declare a `libA11y` toggle. With `--lib-a11y on,off`, run both configurations and label each result with the configuration used.

### Mixed comparisons.

Component fixtures and full pages test different things. A mixed comparison still runs, but the report opens with a warning that the evidence isn't equivalent.

## 7. Tiers.

Every tier reports one status per target and archetype: `ran`, `skipped`, `not-applicable`, `not-testable`, or `failed`, plus a reason when the status isn't `ran`.

### Tier 1: rules.

The `rules` tier runs the engines named by `--engine` (default `axe,ibm`) against the same page and state. Each engine reports on its own.

- **axe:** `@axe-core/playwright` against the tag set for the chosen WCAG version and level.
- **ibm:** inject `ace.js` from `accessibility-checker-engine` into the page with `page.evaluate` (a strict CSP blocks `addScriptTag`) and run the `WCAG_2_0`, `WCAG_2_1`, or `WCAG_2_2` ruleset that matches `--wcag`. Filter by the chosen level using each checkpoint's `wcagLevel`. These rulesets hold levels A and AA only, so `--level AAA` runs the AA rules and the result carries a note that says so.
- **Passes.** `passesCount` is the number of rules that passed, for both engines. IBM reports per element, so count distinct passing rules.
- **Page evidence.** A page target has one pseudo-archetype, `page`. A tier that was requested but can't run reports `skipped` with a reason.
- Keep `violations`, `incomplete` (needs review), and `passes` in separate lists, per engine.
- Keep rule ID, WCAG tags or criteria, help URL, and the first N node selectors per finding. Keep impact when the engine reports one.
- **IBM mapping.** IBM `FAIL` results are violations. `POTENTIAL`, manual, and recommendation results are `incomplete` (needs review). IBM has no impact scale, so its findings carry `impact: null`.
- **Never merge across engines.** Don't deduplicate, sum, or average findings from different engines. When both engines flag the same element, show both, each labeled with its engine.
- **Impact and fail checks.** Impact is the engine's own label, never one we compute. Axe findings carry axe's impact. IBM findings carry `impact: null` and a separate numeric `toolkitLevel` (1 to 4). IBM documents Toolkit level as a staged adoption scale: 1 is essential requirements with high user impact, 2 adds the next-most important, and 3 is the full set. The report labels it "IBM Toolkit level" and never converts it to axe's scale. IBM defines no Level 4. Each engine has its own fail flag (`--fail-on-axe`, `--fail-on-ibm`), and `--fail-mode` combines them. See section 4, "Fail checks."
- Run each archetype in its meaningful states (closed and open for dialog, menu, and tooltip).
- **Canvas detection.** If the rendered output is mainly `<canvas>` with no accessible alternative, set the status `not-testable` with the reason "canvas output exposes nothing to rule checks." Never report it as clean.
- Include contrast results. They depend on Chromium rendering, so record the Chromium version.

### Tier 2: interactions.

Table-driven Playwright steps per archetype, defined in `archetypes.js` and run by one small runner. Each check is a named test with pass, fail, or not-applicable.

| Archetype | Checks |
|---|---|
| All | Trigger is reachable by Tab. Focus indicator is visible. No unintended focus trap. |
| button, link | Enter activates. Space activates (buttons only). |
| dialog | Focus moves into the dialog on open. Tab stays inside. Escape closes. Focus returns to the trigger. |
| menu | Enter or Arrow opens. Arrow keys move between items. Escape closes and returns focus. |
| tabs | Arrow keys move between tabs. Home and End work. Selected state is exposed. |
| combobox | Arrow Down opens the list. Arrow keys change the active option. Enter selects. Escape closes. |
| form-field | Label is associated. Error message is announced or associated on invalid input. |
| accordion | Enter and Space toggle. Expanded state changes. |
| tooltip | Appears on focus. Escape dismisses. Content stays reachable on hover (WCAG 1.4.13). |

Visible focus check: compare computed styles or a screenshot diff between focused and unfocused states. State the method in the report.

### Tier 3: virtual screen reader (vsr).

Use `@guidepup/virtual-screen-reader`. Record the announcement sequence for each archetype's states.

- **Label every vsr result "simulated."** It's not real screen reader output.
- Store the announcement log as data. The report highlights obvious problems (an unnamed control, a role announced as generic) and doesn't judge the log automatically.
- **Spike result (M0):** the virtual screen reader runs against the live page, including under strict CSP, through `page.evaluate` injection. The jsdom fallback isn't needed. The original spike question was whether it could run in the live page or only against a jsdom snapshot. A snapshot loses CSS-driven visibility and changes what's announced. If it needs jsdom, serialize the rendered DOM from Playwright and say so in the report's method note.

## 8. Results schema.

Write `results.json` next to `plan.json`.

```jsonc
{
  "schema": 1,
  "planRef": "plan.json",
  "runAt": "2026-10-07T00:00:00Z",
  "tools": { /* same shape as the plan */ },
  "targets": [
    {
      "id": "radix",
      "status": "ran",
      "reason": null,
      "archetypes": {
        "dialog": {
          "status": "ran",                    // or gap
          "configs": [
            {
              "libA11y": "on",                // on | off | n/a
              "tiers": {
                "rules": {
                  "status": "ran",
                  "engines": {
                    "axe": {
                      "status": "ran",
                      "version": "",
                      "violations": [{ "ruleId": "", "impact": "serious", "wcag": ["1.4.3"], "tags": ["wcag2aa","wcag143"], "help": "", "helpUrl": "", "nodeCount": 1, "nodes": [{ "selector": "", "html": "" }] }],
                      "incomplete": [],
                      "passesCount": 0
                    },
                    "ibm": {
                      "status": "ran",
                      "version": "",
                      "violations": [{ "ruleId": "", "impact": null, "toolkitLevel": 1, "wcag": ["1.4.3"], "help": "", "helpUrl": "", "nodeCount": 1, "nodes": [{ "selector": "", "html": "" }] }],
                      "incomplete": [],
                      "passesCount": 0
                    }
                  }
                },
                "interactions": { "status": "ran", "checks": [{ "name": "escape-closes", "result": "pass", "detail": "" }] },
                "vsr": { "status": "ran", "simulated": true, "log": [ { "state": "open", "announcements": [] } ] }
              }
            }
          ]
        }
      },
      "summary": { "violationsByImpact": { "critical": 0, "serious": 0, "moderate": 0, "minor": 0 }, "gaps": [], "notTestable": [] }
    }
  ],
  "failCheck": { "mode": "any", "axe": { "threshold": "serious", "hits": 0, "tripped": false }, "ibm": { "threshold": 1, "hits": 0, "tripped": false }, "targets": { "radix": { "axe": null, "ibm": null, "tripped": false } }, "tripped": false },  // null when no fail flag is set
  "warnings": []
}
```

Also write a `report.md`, rendered by plain JavaScript functions in `report/` (no template engine), so the CLI works without the skill.

## 9. Report rules.

Both the CLI report renderers and `SKILL.md` follow these rules.

1. Put the run date and tool versions at the top. Say that "latest" results are a snapshot.
2. For `compare`, use the same archetypes, WCAG version, level, and rule tags on every target.
3. Open with a **coverage matrix** (target by archetype by tier, showing ran, gap, not-testable, or failed). Then show findings.
4. Report violations, needs-review items, and passes separately. Never merge them.
5. Break findings out per archetype and by impact.
6. Say "no automated violations found," never "accessible" or "compliant."
7. Don't print a single score. If a stakeholder insists, pair it with the coverage matrix and the automated-coverage caveat.
8. Label vsr output as simulated. Label library accessibility options on or off for each result.
9. Treat a gap or a not-testable result as a finding. It never counts as a pass.
10. For mixed-evidence comparisons, open with the non-equivalence warning.
11. End with a plain-language method note: what the tools can't catch, and which checks need a human (cognitive load, meaningful alt text, real screen reader behavior, and similar).
12. Write the narrative from `results.json`, never from memory.
13. Label every rules-tier finding with its engine. Report axe and IBM separately, never merge or total them, and say that the engines overlap but each catches things the other misses. Label IBM needs-review items as needs review, not failures.

## 10. Build order.

Each milestone ends with working tests.

**M0. Spikes (do these first, they de-risk the design).**
- Virtual screen reader: can it run in the page context or only on a jsdom snapshot? Decide the vsr strategy from the answer.
- Study the existing chartty harness at `~/Scripts/chartty/tmp/chart-comparison` (Vite build with one bundle per library; we swap Vite for esbuild, `versions.lock.json`). Reuse the one-page-per-library idea. Ignore its Docker and performance parts. Find where the existing axe and Guidepup code lives; the file tree showed none, but the parent workspace has configs. Port what's useful.
- Check whether Compound-component fixtures can be authored reliably for Radix and one non-compound library.

**M1. Skeleton.**
- Package, CLI parsing, `doctor`, `--version`, plan output, target classification with tests for every row in section 4.

**M2. URL and HTML path, rules tier.**
- Static server, plain URL and HTML targets, rules tier (axe and IBM), `results.json`, `report.md`. Test against known-good and known-bad HTML fixtures.

**M3. Storybook path.**
- Story enumeration, iframe loading, cap handling. Test against a small static Storybook build.

**M4. npm React path.**
- Install isolation, export scan, candidate mapping, template fixtures, esbuild bundle, authored-fixture validation. Start with button, dialog, and tabs.

**M5. Interactions tier.**
- Archetype scripts, starting with button, link, dialog, menu, and tabs. Then the rest.

**M6. vsr tier.**
- Per the spike's result.

**M7. Comparison reporting.**
- Coverage matrix, gap handling, mixed-evidence warning, `--lib-a11y` on and off, chart archetype with canvas detection.

**M8. Skill and packaging.**
- `SKILL.md`, `init-skill`, version handshake, README, `npm link` smoke test, then publish.

## 11. SKILL.md outline.

1. **Frontmatter.** Name `automatica11y`. Description triggers: accessibility audit, WCAG check, compare accessibility, "how accessible is."
2. **Version handshake.** State the expected CLI major version. Run `npx automatica11y@latest --version` and stop with a clear message on a mismatch.
3. **Preflight.** Run `automatica11y doctor`. Relay fixes.
4. **Translate the prompt.** Map free-form text to `audit` or `compare`. Show the command. If a target is ambiguous, ask one question.
5. **Plan first for npm targets.** Run with `--plan`, review the candidate mapping, author compound-component fixtures where needed, and rerun with `--mapping`.
6. **Run and read.** Execute, then read `results.json`.
7. **Write the report.** Follow section 9. Use the structure of the CLI's `report.md` output.
8. **Limits.** Short list of what to say when a target is unsupported, not applicable, or not testable.
9. **No setup logic.** Anything about installing or configuring tools belongs in the CLI.

## 12. Testing plan.

- **Unit tests:** target classification, plan resolution, mapping validation, schema validation, report rendering from fixed results.
- **Fixture pages:** HTML pages with known, intentional violations (missing label, low contrast, broken dialog focus return) and matching clean pages. Assert the exact findings.
- **Integration:** one small React library and one Storybook build checked into `test/fixtures` or fetched in a setup step.
- **Determinism:** run the same plan twice and assert identical findings (allowing timing fields to differ).
- **CI:** run unit and fixture tests on every push. Add a scheduled job that runs the suite against latest dependencies and files an issue when axe, IBM Equal Access, or Playwright upgrades break a test.

## 13. Acceptance criteria for v1.

- `audit` and `compare` work for all four target types from section 4.
- `--plan` prints the classification of every target without installing or launching anything.
- A comparison of two React libraries produces a coverage matrix, per-archetype findings, and a report that follows every rule in section 9.
- Canvas-only chart output reports `not-testable`, never clean.
- A missing Chrome or Chromium produces exit code 3 with the install command.
- Every report records the run date, the resolved tool versions, and the resolved target versions.
- `init-skill` installs a working skill with one command.

## 14. Open questions for the owner.

1. Where does the existing axe and Guidepup code live in the parent workspace? The chartty `tmp` tree showed none. Ask Danny for the path, or search the parent repo.
2. Should the package be public on npm or published to a private registry or GitHub Packages?
3. What's the story cap for Storybook targets? The plan assumes 200.
4. Should the fail flags default to off in CI contexts too? The plan assumes yes.
