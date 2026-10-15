# Accessibility report.

Run date: 2026-10-14T19:06:20.463Z.

Command: audit. WCAG 2.2, level AA. Tiers: rules, interactions, computed, conditions, vsr. Engines: axe, ibm.

These results are a snapshot. The tools ran at their latest versions on this date, and a later run can differ.

**Tool versions.**

- node: 24.22.0
- automatica11y: 0.9.0
- axe-core: 4.14.0
- ibm-checker-engine: 4.0.34
- playwright-core: 1.64.0
- esbuild: 0.28.2
- guidepup-vsr: 0.33.0
- chromium: 155.0.8059.80

**Targets.**

- canvas-only.html: /home/user/site/canvas-only.html

## Coverage.

| Target | axe-core | IBM Equal Access | Interactions | Computed checks | Conditions | Virtual screen reader |
| --- | --- | --- | --- | --- | --- | --- |
| canvas-only.html | not-testable | not-testable | not-applicable | not-applicable | ran, two passed, six not applicable | ran (simulated), none flagged |

A gap, a failed engine, or a target that wasn't testable is a finding. It never counts as a pass.

**Not testable in canvas-only.html.**

- Canvas output exposes nothing to rule checks. The page or component is mainly a canvas with no text alternative, label, table, or SVG, so there was nothing to test.

## Findings.

Findings from different engines are listed separately. The engines overlap, and each catches things the other misses, so don't add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (level 1 is essential requirements with high user impact). The two scales aren't comparable.

### canvas-only.html.

Target `./canvas-only.html`, html-file, page evidence.

#### axe-core.

Not testable: Canvas output exposes nothing to rule checks. The page or component is mainly a canvas with no text alternative, label, table, or SVG, so there was nothing to test. Treat this as a coverage gap, not a pass.

#### IBM Equal Access.

Not testable: Canvas output exposes nothing to rule checks. The page or component is mainly a canvas with no text alternative, label, table, or SVG, so there was nothing to test. Treat this as a coverage gap, not a pass.

#### Conditions.

automatica11y's own checks of how the page holds up under a user's settings (reduced motion, dark mode, more or less contrast, reduced transparency, forced colors) and environment (a 320 pixel window, wider text spacing). Each check opens fresh copies of the page. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't tell is undetermined, which counts as a gap and never as a pass. "Not applicable" means the page doesn't use the feature, which isn't a failure.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `reduced-motion-respected` | not-applicable | [2.3.3 Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions), [2.2.2 Pause, Stop, Hide](https://www.w3.org/TR/WCAG22/#pause-stop-hide) | No animations or transitions were running at load or after the trigger was pressed, so there's nothing to reduce. Motion driven by JavaScript timers isn't visible to this check. |
| `dark-mode-contrast` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-color-scheme: dark, so it doesn't adapt to it. A page isn't required to. Nothing was checked. |
| `more-contrast-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.6 Contrast (Enhanced)](https://www.w3.org/TR/WCAG22/#contrast-enhanced) | The page looks the same under prefers-contrast: more, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `less-contrast-stays-readable` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-contrast: less, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `reduced-transparency-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) | No surface that holds text is see-through (no translucent background and no backdrop filter), so there's nothing to reduce. Empty overlays aren't counted. |
| `forced-colors-focus-visible` | not-applicable | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) | Nothing on the page takes keyboard focus, so there's no focus indicator to check. |
| `reflow-at-320px` | pass | [1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow) | In a 320px window, nothing reaches past the right edge and the page doesn't scroll sideways. |
| `text-spacing-no-clipping` | pass | [1.4.12 Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing) | With line height 1.5, letter spacing 0.12em, word spacing 0.16em, and paragraph spacing 2em, no element cut off its text (four elements checked). Overlapping text isn't checked. |

#### Virtual screen reader (simulated).

Simulated output from @guidepup/virtual-screen-reader 0.33.0. It isn't a real screen reader, and real ones announce things differently. The log is data. The flags only mark a phrase that is a bare role or a generic role, for a person to check.

**Flagged phrases.**

None.

**Announcement log.**

```text
document
main
heading, Canvas only, level 1
end of main
end of document
```

**Not run.**

- Interactions: Interaction checks need an archetype fixture with trigger and root hooks. Page and Storybook targets don't have them.
- Computed checks: Computed checks need an archetype fixture with a trigger hook. Page and Storybook targets don't have one.

## Method note.

Automated rules cover only part of WCAG. A result of no automated violations found doesn't show that a page conforms to WCAG or works for everyone.

A person has to check what these tools can't judge: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, reading order and focus order in real use, and how real screen readers behave.

Contrast results depend on how the browser rendered the page, so the browser version is recorded above.

**WCAG data.** Criterion names and levels come from the W3C's [WCAG 2.2 JSON](https://www.w3.org/WAI/WCAG22/wcag.json), retrieved 2026-10-08. Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. Links to each criterion are added by automatica11y.

