# Spike: porting from chartty

Source: `~/Scripts/chartty/tmp/chart-comparison/scripts/run-a11y.ts` and `harness/audit-page.ts`.

## Ports with small changes
- `AxeBuilder({ page }).withTags(...)`. Chartty's tags omit `best-practice`. We decide whether to include it.
- `selfTest()`. It audits a known-bad snippet and refuses to report if axe doesn't flag it. Keep this. Add the IBM engine to the same check.
- `chart.ariaSnapshot()`. Chrome's real accessibility tree, which is the cross-check we wanted for the vsr tier.
- `screenReaderWalk()`. Change the container, replace the dynamic import with the `window.__vsr` injection (see `spike-vsr.md`), and keep the 150-step cap plus the `reachedEnd` flag.
- Focus check. Tab until focus lands inside the target, then compare screenshots (`Buffer.equals`) for a visible change. Needs no image library.
- Context setup. Viewport, `deviceScaleFactor: 1`, `forcedColors: "active"`, and a 30 s default timeout.
- Reflow at 320 px. Needs a resize hook, so it becomes a viewport change in our harness.

## Leave behind
- Chart-specific code: `valueTokens`, `generate`, `LIBRARIES`, `window.__bench`, `dataValuesInTree`, and the `?type=&n=&profile=` URL contract.
- `vite preview` with COOP and COEP headers, and `CHROMIUM_ARGS` from `run-perf.ts`.
- `pngjs`-based colour math (`dominantMarkContrast`, `inkRatio`). It adds a dependency, so defer it. The forced-colors check becomes a later addition.

## Changes to the plan
- Add the self-test to M2. It should fail the run if either engine misses a known-bad case.
- Use `channel: "chrome"` instead of chartty's bundled-Chromium launch.
