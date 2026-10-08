# automatica11y.

Instructions for AI agents working in this repository or asked to use this tool.

## If you're asked to check or compare accessibility.

Use the `automatica11y` skill. It's the folder `skills/automatica11y/`. Read `skills/automatica11y/SKILL.md` all the way through before you run anything, and follow it. It covers:

- the version check and `doctor`
- turning a request into an `audit` or `compare` command
- writing fixtures for npm packages (read `skills/automatica11y/references/fixtures.md` when you do)
- reading `results.json` and writing the report

The skill is the single source for those steps and for how to word results. Don't work from memory or from this file alone.

## If you're changing the code.

- Run `npm test` (about two minutes, needs Chrome or Chromium) and `npm run lint` before you finish.
- The code is plain ESM JavaScript with JSDoc types and no build step. It needs Node 20 or newer.
- `src/` holds the tool. `test/` holds the tests. `test/fixtures/` holds test pages and fake packages, which are not the fixtures a user writes for an npm package.
- Heavy dependencies (Playwright, esbuild, the rule engines) load only when a command needs them. A test checks that `--version`, `doctor`, and `--plan` never import them.
- Keep findings from axe-core and IBM Equal Access separate. Never add their counts together or convert one engine's scale into the other's.
- A gap, an error, a failed target, or a result that isn't testable is a finding. It never counts as a pass. Reports say "no automated violations found," never "accessible."
- `skills/automatica11y/SKILL.md` names the version series it works with (`0.2.x`). Change it when the series in `package.json` changes. A test fails if they disagree.
- Plans and notes live in `.agents/`.
