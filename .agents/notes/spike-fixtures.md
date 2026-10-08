# Spike: agent-authored React fixtures with esbuild

Result: the contract works. Both fixtures bundled and behaved correctly in Chrome.

## Setup
- Scratch project: `/private/tmp/claude-502/-Users-dwahl-Scripts-automatica11y/72d91baa-1951-48b8-a132-1b4c0a7bae97/scratchpad/spike-fixtures`.
- Installed with `--ignore-scripts --no-audit --no-fund`: react 19.3.0, react-dom 19.3.0, esbuild 0.28.2, @radix-ui/react-dialog 1.2.0, react-aria-components 1.21.1, playwright-core 1.64.0.
- react-aria-components installed fine, so Headless UI wasn't needed.
- Files: `fixtures/*.jsx`, `build.mjs` (esbuild plus HTML shells), `run.mjs` (node:http server plus Playwright).

## What worked
- The generated entry file imports the fixture and mounts it with `createRoot`. esbuild bundled it with the requested options.
- `jsx: 'automatic'` needs no React import in fixtures.
- Both pages rendered the trigger. Pressing Enter on the focused trigger opened the dialog.
- Neither page had `[data-a11y-root]` before the click (initial state is closed, as expected).
- Radix: the `data-a11y-root` attribute landed on `Dialog.Content`. That's a `div` with `role="dialog"` and `aria-labelledby`.
- React Aria: the attribute landed on `Dialog`. That's a `section` with `role="dialog"`.
- Both dialogs render outside `#root`, in a portal under `body`.
- Console errors: none for React Aria. Radix showed one 404 for a missing resource. It's almost certainly `/favicon.ico` (not checked). Add a `<link rel="icon" href="data:,">` to the shell.

## Build times and sizes (development mode, no minify)
- radix-dialog: 74 ms, 1,276 KB.
- aria-dialog: 649 ms (includes esbuild warm-up), 1,434 KB.
- Total for both: 724 ms.
- Sizes are large because of the development React build. They don't matter for a local test run.

## Gotchas for fixture authors
- Props pass through. `data-a11y-*` attributes reach the DOM on Radix `Trigger` and `Content`, and on React Aria `Button` and `Dialog`. A wrapper component that drops unknown props would break this.
- Put `data-a11y-root` on the element with `role="dialog"`, not on `Overlay`, `Modal`, or `Portal`. React Aria's `Modal` and `ModalOverlay` also render wrapper divs, so the wrong choice is easy.
- Portals are fine for a selector-based hook, because `document.querySelector` finds them. A hook that looks inside `#root` would miss the dialog. Query from `document`.
- The root doesn't exist until the trigger fires. The harness must wait for it, not assume it.
- Radix warns if `Dialog.Title` or `Description` is missing. Fixtures must include both.
- Radix generates IDs like `radix-_r_1_`, and React Aria's include a random number. Don't snapshot IDs.
- `process.env.NODE_ENV` must be defined, or the browser throws. The build script handles it.
- Duplicate React: esbuild resolves from the nearest `node_modules`. If fixtures live outside the project root, set `nodePaths` and keep one copy of react. Two copies cause invalid hook call errors. Consider an esbuild `alias` for `react` and `react-dom`.
- CSS: we didn't test it. esbuild emits a sibling `.css` file for CSS imports, so the shell would need a link tag. Fixtures should skip CSS unless a rule needs it.
- Fixtures can't be TypeScript or rely on a `tsconfig`. Plain `.jsx` worked with no loader config.
- `playwright-core` with `channel: 'chrome'` launched system Chrome without a browser download.

## Recommended contract tweaks
1. Require exactly one `[data-a11y-trigger]` and at most one `[data-a11y-root]` after the trigger fires.
2. Say that `data-a11y-root` goes on the element carrying the dialog role, and that it appears after interaction.
3. Add an optional named export, for example `export const open = 'click' | 'enter'`, to set the activation method.
4. State that the root may live in a portal, and that tools must query from `document`.
5. Require accessible name content (title and description) so library warnings stay quiet.
6. Add a favicon data URL to the HTML shell to remove the false 404.
7. Pin React through `alias` and fail the build if two React copies resolve.
8. Forbid CSS imports, or document that the shell links the emitted CSS.
