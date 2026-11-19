# What it checks.

Five tiers run by default. Use `--tiers` to pick fewer.

## Rules.

axe-core and IBM Equal Access run side by side. They overlap, and each catches things the other misses. Their findings are reported separately and never added together. axe-core reports an impact (`minor` to `critical`). IBM reports its Toolkit level, a staged adoption scale where level 1 is essential, high-impact requirements. The two scales aren't comparable.

## Interactions.

Keyboard and focus checks for ten archetypes: button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, and live-region (a message that appears or changes without moving focus, such as an alert or status message). Each check runs on a fresh page. Archetypes are the standard building blocks of HTML and ARIA patterns. A larger widget, such as a carousel, is tested through the archetypes it's made of.

### ARIA-AT-informed regression fixtures.

For contributors, three good/bad fixture pairs exercise alternative interaction strategies under the existing checks. They are original local examples informed by [ARIA-AT](https://github.com/w3c-cg/aria-at), not an imported ARIA-AT harness or a new runtime tier. Tests use local files without fetching upstream content.

Sources below are pinned to upstream commit `6c0044502636c8fa6452579f6e10a0d7ca80b3b1`. ARIA-AT's documents have their own [W3C Document License](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/LICENSE.md). The fixtures, scripts, and wording here are independently authored; no upstream test files are copied.

| Local fixtures | Upstream scenarios and assertion IDs | Automated evidence and its boundary |
| --- | --- | --- |
| Active-descendant menu: [good](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/menu-active-descendant-good.html), [bad](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/menu-active-descendant-bad.html) | [Menu tests](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/menu-button-actions-active-descendant/data/tests.csv): `openMenu`, `closeMenu`. Related [assertions](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/menu-button-actions-active-descendant/data/assertions.csv): `nameFocusedItemAction1`, `nameFocusedItemAction2`, `stateCollapsed`. | Existing checks observe opening, active-item navigation, Escape, and focus return. The bad fixture ignores ArrowUp, failing `arrow-keys-move-between-items`. A fixture-contract test confirms DOM focus stays on the menu while `aria-activedescendant` changes. None proves what AT announces. |
| Manual tabs: [good](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/tabs-manual-good.html), [bad](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/tabs-manual-bad.html) | [Manual-tab tests](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/tabs-manual-activation/data/tests.csv): `navToNextTabTabList`, `navToPreviousTabTablist`, `activateTabInTabList`. Related [assertions](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/tabs-manual-activation/data/assertions.csv): `stateNotSelected`, `stateSelected`, `stateChangeToSelected`. | Existing checks observe arrow focus movement, Home/End, and initial selected-state attributes. The bad fixture omits `aria-selected`, failing `selected-state-exposed`. A fixture-contract test confirms arrows do not select, while Enter/Space update selection and the visible panel. That contract is not a runtime check of arbitrary targets' manual activation. |
| Static-heading dialog: [good](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/dialog-static-focus-good.html), [bad](https://github.com/thedannywahl/automatica11y/blob/main/test/fixtures/interactions/dialog-static-focus-bad.html) | [Modal-dialog tests](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/modal-dialog/data/tests.csv): `openModalDialog`, `closeModalDialog`, `navToFirstFocusableElementModalDialog`, `navToLastFocusableElementModalDialog`, `bumpTopEdge`. Related [assertion](https://github.com/w3c-cg/aria-at/blob/6c0044502636c8fa6452579f6e10a0d7ca80b3b1/tests/apg/modal-dialog/data/assertions.csv): `cursorAtAddDeliveryAddressHeading`. | A local variant informed by heading/containment scenarios, not a verbatim upstream test. Existing checks accept initial focus inside the dialog and observe forward Tab containment, Escape, and focus return. The bad fixture sends focus to an unrelated button, failing `focus-returns-to-trigger`. A fixture-contract test confirms initial heading focus and reverse Tab containment. DOM focus is not the AT reading cursor. |

These are related scenarios, not executions of upstream speech assertions. Passing them does not establish ARIA-AT conformance, W3C endorsement, WCAG certification, or that upstream interoperability results apply to these fixtures or another component library. The simulated screen reader is unchanged.

### Real-screen-reader follow-up.

This is a manual contributor checklist, separate from the automated suite and its release gate. It does not publish official [ARIA-AT interoperability reports](https://aria-at.w3.org/reports).

From a repository checkout with Node 22 or newer, serve the fixtures using the existing local server; no additional package is needed:

```bash
node --input-type=module -e 'import { serveStatic } from "./src/harness/static-serve.js"; const server = await serveStatic("test/fixtures/interactions"); console.log(server.origin);'
```

Keep that terminal open. Append a fixture filename, such as `/menu-active-descendant-good.html`, to the printed origin and open it in the browser being tested. The bare origin has no index page. Stop the server with Ctrl+C afterward.

1. Choose and record a combination, for example NVDA/Firefox on Windows, JAWS/Chrome on Windows, or VoiceOver/Safari on macOS. Follow upstream [screen-reader configuration](https://github.com/w3c-cg/aria-at/wiki/Configuring-Screen-Readers-for-Testing) and [testing guidance](https://github.com/w3c-cg/aria-at/wiki/Running-a-Test-Plan). Use the chosen plan's per-AT command files and instructions for navigation and modes; there is no universal screen-reader key sequence.
2. Record the local Git revision, fixture filename, OS/browser/AT versions, settings and mode, starting state, exact command sequence, observed speech, observed focus/reading-cursor position, and verdict for each observation. Capture speech with the AT's speech history or recorder where available rather than assuming exact wording from another AT.
3. Reload before each scenario so state and speech from earlier commands do not influence it. Verify the starting position and that the intended command reached the AT/browser before judging output.
4. Run each good case and its broken counterpart as a negative control:
   - **Menu:** open Document actions, navigate between items, then close it. Observe item names and roles, active-item changes, and the collapsed trigger/focus return. The bad case does not move back on ArrowUp. Position or state announcements can differ by AT/browser; DOM attribute changes alone are not speech evidence.
   - **Tabs:** move from Overview to History without activating it. Observe the distinction between focused and selected state; activate History with the appropriate command and observe the selection change and access to its associated panel. The bad case has no `aria-selected`; record what the AT actually conveys rather than predicting identical failures everywhere.
   - **Dialog:** open Review document and observe the dialog's name/role and initial Review changes heading context. Check forward/reverse keyboard navigation and, separately, reading-cursor navigation at the dialog boundaries. Close it and check the returned focus/context. The bad case focuses Unrelated action rather than the still-present trigger.
5. Record `not run`, `blocked`, `untestable`, or conflicting evidence explicitly, including the reason. If a command goes to the wrong place, its speech cannot establish the expected assertion. Do not count missing evidence as a pass or merge different AT/browser outcomes into one verdict.

The automated checks do not validate actual speech, reading-cursor containment, or the full manual-tab activation sequence on arbitrary targets. Adding regression coverage does not mean these real-AT combinations have been exercised; claim a real-AT result only for a combination actually run and recorded.

## Computed checks.

automatica11y's own measurements from resolved styles in the browser, for the trigger of each archetype fixture: text contrast in rest, hover, keyboard focus, and pressed states (1.4.3), the contrast of the control's edge, fill, or icon (1.4.11), and the contrast and thickness of the focus indicator (1.4.11, and 2.4.13 at level AAA). A page that uses a gradient, an image, or transparency behind the control can't be reduced to one color, so that check reports `undetermined`, which is a gap and never a pass. These results are reported on their own and never added to the rule engines' counts.

## Conditions.

How the page holds up under a user's settings and environment. Each check opens fresh copies of the page and says what happened:

- `prefers-reduced-motion: reduce` (2.3.3, 2.2.2): do animations that move or repeat stop or go away? Motion driven by JavaScript timers isn't visible to this check.
- `prefers-color-scheme: dark` (1.4.3): if the page changes in dark mode, does every piece of text keep its contrast? A page that doesn't adapt isn't failed.
- `prefers-contrast: more` (1.4.3, 1.4.6): if the page responds, does the lowest text contrast stay above the minimum and not drop? The check says whether enhanced contrast (7:1) is reached. `prefers-contrast: less` (1.4.3): if the page softens, does text stay above the minimum? A page that doesn't respond isn't failed.
- `prefers-reduced-transparency: reduce` (1.4.3, 1.4.11): do surfaces that hold text stop being see-through (translucent backgrounds, backdrop blur)? This preference isn't a WCAG requirement. It matters because see-through backgrounds make text contrast unpredictable.
- Forced colors (1.4.11, 2.4.7): is the focus indicator still visible? A ring drawn with `box-shadow` disappears in forced colors, so use an outline.
- Reflow at 320 CSS pixels (1.4.10): does the page scroll sideways, or does anything reach past the right edge? Two-dimensional content such as data tables and maps is exempt, so a person judges those.
- Text spacing (1.4.12): with the spacing the criterion names, does any element cut off its text? Overlapping text isn't checked.

Conditions run on whole pages and on component fixtures. Storybook stories are reported as not applicable.

## Virtual screen reader.

The announcements a simulated screen reader makes, recorded as data. The output is simulated. It isn't a real screen reader, and real ones announce things differently.

## What every result says.

Every result says what it ran, or why it didn't. A gap, a failure, or a result that can't be tested is a finding. It never counts as a pass.

`automatica11y ci` fails on execution and coverage gaps by default: failed or unsupported targets, missing fixtures or requested results, untestable checks, `undetermined` or `error` measurements, failed Storybook stories, and coverage truncated by the story cap. Intentional tier/archetype exclusions and genuinely inapplicable checks are not failures. Engine findings needing manual review and explicit non-rule check failures have separate opt-in gates. See [CI configuration](github-action.md).
