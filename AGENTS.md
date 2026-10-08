# automatica11y.

Instructions for AI agents working in this repository or asked to use this tool. This file ships in the npm package, so it matches the version of the tool you're running.

## If you're asked to check or compare accessibility.

Read the full steps and follow them exactly. They cover the version check, `doctor`, turning a request into an `audit` or `compare` command, writing fixtures for npm packages, and writing the report from `results.json`:

```bash
npx --yes automatica11y@latest guide skill
```

When the steps tell you to write a fixture, read the fixture guide:

```bash
npx --yes automatica11y@latest guide fixtures
```

Both print files that live in `skills/automatica11y-runner/` in the repository and in the package. If you can read those files directly, you can read them instead. Don't work from memory or from this file alone. The steps are the single source for what to run and for how to word results.

## If you're changing the code (in a checkout of the repository).

- Run `npm test` (about two minutes, needs Chrome or Chromium) and `npm run lint` before you finish.
- The code is plain ESM JavaScript with JSDoc types and no build step. It needs Node 20 or newer.
- `src/` holds the tool. `test/` holds the tests. `test/fixtures/` holds test pages and fake packages, which are not the fixtures a user writes for an npm package.
- Heavy dependencies (Playwright, esbuild, the rule engines) load only when a command needs them. A test checks that `--version`, `doctor`, `guide`, and `--plan` never import them.
- Keep findings from axe-core and IBM Equal Access separate. Never add their counts together or convert one engine's scale into the other's.
- A gap, an error, a failed target, or a result that isn't testable is a finding. It never counts as a pass. A report says "no automated violations found" only where an engine found none, and never says "accessible."
- There are two skills. `skills/automatica11y/` is a tiny bootstrap that people copy. It sends an agent to `guide`. `skills/automatica11y-runner/` holds the full steps and ships with the tool. The runner names the version series it works with (`0.2.x`). Change it when the series in `package.json` changes. A test fails if they disagree.
- Plans and notes live in `.agents/`.
