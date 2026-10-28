# automatica11y

## 0.12.0

### Minor Changes

- e348048: Split the agent steps into a small core and on-demand references (`guide setup`, `guide targets`, `guide site`, `guide fixtures`, `guide reporting`), so agents load only what a request needs. Every file in the runner's `references/` folder is now a `guide` topic. Add `doctor --json`, which prints the environment's `state` (`ok`, `node-unsupported`, `browser-missing`, `browser-outdated`, `install-failed-no-browser`, `install-failed-outdated`, or `other`) with the browser, download result, and problems, so agents act on the tool's diagnosis instead of its prose.
- e348048: Add site crawling capability. automatica11y can now crawl a path or a sitemap file in addition to a single web page.
- e348048: Add opt-in sitemap and rendered-link site discovery using Crawlee, trusted authentication hooks, native crawl statistics, site reports, and matching CLI and GitHub Action options.

### Patch Changes

- e348048: Remove the documentation accessibility test exception and update contributor instructions to require the full test suite with zero skipped tests.

## 0.11.0

### Minor Changes

- d247d07: Save each default audit, comparison, CI run, or plan in a unique timestamped folder under a11y-report so earlier reports and their screenshots are preserved together. Explicit --out paths and YAML options.out continue to select an exact output directory.

### Patch Changes

- d247d07: Clarify runner version-check ordering, outdated-browser consent, and ambiguous target handling, including local Storybook folders without index.json. Align runner evaluation command mocks with the documented --prefer-online commands and keep mocked guides in sync.

## 0.10.1

### Patch Changes

- dea2ab3: Write results.json and report.md when every audit target fails to resolve, without requiring a browser. Failed targets retain their reasons and contain no invented audit findings. Keep --plan output plan-only and align agent guidance and the unreachable-target eval with the consistent failure artifacts.
- dea2ab3: Add query selectors to reports for faster targeting by consumers. Replaces the IBM DOM reference in reports.
- dea2ab3: The runner skill now covers local package folders and packed `.tgz` files with `--local-package`. The waza evaluations cover the setup checks, every option, target parsing, grouping, report writing, end-to-end runs against local pages and a packed package, and the bootstrap skill's guide failures.
- dea2ab3: Optimize test fixtures for concurrency and and animation settling.  Speeds up test suite by ~13%.

## 0.10.0

### Minor Changes

- e27ab8a: Add opt-in annotated screenshots for rule violations and link them from reports.
- bf013ca: Require Node.js 22 or newer and update module tracing to use synchronous customization hooks.

### Patch Changes

- 4441eba: Run conditions checks three at a time in isolated browser contexts, preserving result order and limiting concurrent pages. Clear completed check timers so audits and tests do not wait for unused timeouts before exiting.
- 93ba9d0: Update waza evaluations, triggers, and automatica11y skill content.
- bf013ca: Clarify packaged contributor validation instructions and unify package and Action releases behind the Node matrix, Action smoke tests, and explicit Changesets gates.
  
  Update `doctor` command to notify on out-of-date browser or node versions.
  
  Drop support for Node 20

## 0.9.0

### Minor Changes

- Support auditing local workspace package directories and tarballs as npm component targets.

## 0.8.0

### Minor Changes

- Add configuration loading and validation for accessibility audits.
- Restructure the quick starts and improve accessibility across the documentation site.
- Add schema.org metadata and a script to prepare the documentation site and its assets.

## 0.7.0

### Minor Changes

- Add support for Svelte 5 and newer, including generated fixtures, authored fixtures, and a compiler plugin that uses the target's Svelte installation.

## 0.6.0

### Minor Changes

- Add Angular 22 support with generated and authored fixtures across component archetypes.
- Add auditing for plain HTML, CSS, and JavaScript component libraries, including authored markup fixtures and native templates.
- Allow auditing multiple npm packages as one target and add `check` as an alias for `audit`.

## 0.5.0

### Minor Changes

<abbr title="Nothing">`¯\_(ツ)_/¯`</abbr>

## 0.4.1

### Patch Changes

- Clarify that a global install makes the `automatica11y` command available on `PATH`.

## 0.4.0

### Minor Changes

- Add Vue 3 support and framework adapters, with generated fixtures for packages that do not provide their own.
- Add the live-region archetype and checks for reduced motion, color scheme, forced colors, contrast preferences, transparency, reflow, and text spacing.
- Support npm package subpath entries and improve package loading, peer dependency installation, and fixture generation.

## 0.3.3

### Minor Changes

- Add a computed contrast tier based on resolved styles and read WCAG criteria from the W3C's published data.
- Improve focus checks across component parts and install optional peer dependencies on demand.

## 0.3.2

### Patch Changes

- Retry npm installs when the cache is stale and tighten the runner instructions based on end-to-end findings.

## 0.3.1

### Patch Changes

- Update the runner's supported version series to match the 0.3 release.

## 0.3.0

Initial public release.

### Minor Changes

- Add the `automatica11y` CLI for auditing pages, Storybook builds, and React or web component npm packages.
- Add axe and IBM Equal Access rules, interaction checks, a virtual screen reader tier, and side-by-side target comparisons.
- Add the agent skill, guided setup, CI support, and reports for unsupported targets and closed shadow roots.
- Accept `npm:` package targets and treat bare target names as paths.
