# automatica11y

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
