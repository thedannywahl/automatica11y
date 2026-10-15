# Accessibility report.

Run date: 2026-10-14T19:11:05.356Z.

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

- @a11y-eval/widgets: @a11y-eval/widgets 1.0.0 React The package lists react as a peer dependency. tarball /home/user/widgets/a11y-eval-widgets-1.0.0.tgz

## Coverage.

| Target | axe-core | IBM Equal Access | Interactions | Computed checks | Conditions | Virtual screen reader |
| --- | --- | --- | --- | --- | --- | --- |
| a11y-eval-widgets | ran, zero violations | ran, one violation | ran, three failed, nine passed, one not applicable | ran, six passed | ran, six passed, 10 not applicable | ran (simulated), none flagged |

A gap, a failed engine, or a target that wasn't testable is a finding. It never counts as a pass.

## Findings.

Findings from different engines are listed separately. The engines overlap, and each catches things the other misses, so don't add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (level 1 is essential requirements with high user impact). The two scales aren't comparable.

### @a11y-eval/widgets.

Target `npm:@a11y-eval/widgets`, npm-react, component evidence.

Installed `@a11y-eval/widgets@1.0.0` on its own, as React (react 19.2.0).

**Archetypes.** A gap means the archetype wasn't tested, so it counts against coverage and never as a pass.

| Archetype | Status | Fixture | States | Note |
| --- | --- | --- | --- | --- |
| dialog | ran | generated (dialog-compound) | closed, open | a root, a trigger, and a content part that opens on its own, from DialogTrigger, DialogContent, DialogTitle, DialogClose. Source: generated/a11y-eval-widgets/dialog.jsx |
| tabs | ran | authored | initial |  |

**Generated fixtures.** Where no fixture was written, the tool built one from the parts the package exports (or from what a custom element says about itself) and ran it only after it checked that the trigger and root behaved. A generated fixture is a guess about how the library is meant to be assembled, so a failure may come from how it was wired and not from the library. Treat generated results as lower evidence than an authored fixture. The source of each is in the `generated` folder beside this report. Copy one to `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) and edit it to make it an authored fixture.

#### dialog (closed state).

##### axe-core 4.14.0.

Configuration: `{"tags":["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"],"scope":"#root"}`.

**Violations.**

No automated violations found by axe-core.

**Needs review.**

Nothing flagged for review.

**Passes.**

Nine rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### IBM Equal Access 4.0.34.

Configuration: `{"ruleset":"WCAG_2_2","levels":["A","AA"],"scope":"#root"}`.

**Violations.**

No automated violations found by IBM Equal Access.

**Needs review.**

Nothing flagged for review.

**Passes.**

16 rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### Virtual screen reader (simulated).

Simulated output from @guidepup/virtual-screen-reader 0.33.0. It isn't a real screen reader, and real ones announce things differently. The log is data. The flags only mark a phrase that is a bare role or a generic role, for a person to check.

**Flagged phrases.**

None.

**Announcement log (closed state).**

```text
document
main
button, Open dialog, not expanded, has popup dialog
end of main
end of document
```

##### Interactions.

Each check ran on a fresh page, using only the trigger and root hooks and ARIA roles. A check that couldn't finish is an error, which counts as a gap and never as a pass.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `trigger-reachable-by-tab` | pass | [2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) | Tab reached the trigger after 1 press. |
| `focus-indicator-visible` | pass | [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) | Computed style changed on focus: the element: outline. (method: computed-style) |
| `no-focus-trap` | pass | [2.1.2 No Keyboard Trap](https://www.w3.org/TR/WCAG22/#no-keyboard-trap) | Focus moved on after 1 more Tab press. |
| `focus-moves-into-dialog` | fail | [2.4.3 Focus Order](https://www.w3.org/TR/WCAG22/#focus-order) | Focus stayed outside the dialog, on button "Open dialog". |
| `tab-stays-inside-dialog` | fail | [2.4.3 Focus Order](https://www.w3.org/TR/WCAG22/#focus-order), [2.1.2 No Keyboard Trap](https://www.w3.org/TR/WCAG22/#no-keyboard-trap) | Focus left the dialog after 2 Tab presses, onto nothing (the page body). |
| `escape-closes` | fail | [2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) | The dialog stayed open after Escape. |
| `focus-returns-to-trigger` | not-applicable | [2.4.3 Focus Order](https://www.w3.org/TR/WCAG22/#focus-order) | Escape didn't close the dialog, so focus return wasn't checked. |

##### Computed checks.

automatica11y's own measurements from resolved styles in the browser, with the numbers WCAG gives. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't reduce the page to colors (a gradient, an image, transparency) is undetermined, which counts as a gap and never as a pass.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `text-contrast-by-state` | pass | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The lowest is 18.26:1 in rest (needs 4.5:1). Measured in rest, hover, keyboard focus, pressed. |
| `boundary-contrast` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) | The strongest mark is its top border, at 21:1 (needs 3:1). |
| `focus-indicator-contrast` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), [2.4.13 Focus Appearance](https://www.w3.org/TR/WCAG22/#focus-appearance) | The outline has 5.98:1 against what's next to it (needs 3:1). It's 1px thick, and WCAG 2.4.13 Focus Appearance (level AAA) asks for at least 2px. (method: computed-style) |

##### Conditions.

automatica11y's own checks of how the page holds up under a user's settings (reduced motion, dark mode, more or less contrast, reduced transparency, forced colors) and environment (a 320 pixel window, wider text spacing). Each check opens fresh copies of the page. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't tell is undetermined, which counts as a gap and never as a pass. "Not applicable" means the page doesn't use the feature, which isn't a failure.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `reduced-motion-respected` | not-applicable | [2.3.3 Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions), [2.2.2 Pause, Stop, Hide](https://www.w3.org/TR/WCAG22/#pause-stop-hide) | No animations or transitions were running at load or after the trigger was pressed, so there's nothing to reduce. Motion driven by JavaScript timers isn't visible to this check. |
| `dark-mode-contrast` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-color-scheme: dark, so it doesn't adapt to it. A page isn't required to. Nothing was checked. |
| `more-contrast-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.6 Contrast (Enhanced)](https://www.w3.org/TR/WCAG22/#contrast-enhanced) | The page looks the same under prefers-contrast: more, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `less-contrast-stays-readable` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-contrast: less, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `reduced-transparency-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) | No surface that holds text is see-through (no translucent background and no backdrop filter), so there's nothing to reduce. Empty overlays aren't counted. |
| `forced-colors-focus-visible` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) | With forced colors on, the focus indicator is visible: 214 of 424 changed pixels reach 3:1 against their unfocused color. (method: pixels) |
| `reflow-at-320px` | pass | [1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow) | In a 320px window, nothing reaches past the right edge and the page doesn't scroll sideways. The div fits (8px to 312px). |
| `text-spacing-no-clipping` | pass | [1.4.12 Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing) | With line height 1.5, letter spacing 0.12em, word spacing 0.16em, and paragraph spacing 2em, no element cut off its text (eight elements checked). Overlapping text isn't checked. |

#### dialog (open state).

##### axe-core 4.14.0.

Configuration: `{"tags":["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"],"scope":["#root","[data-a11y-root]"]}`.

**Violations.**

No automated violations found by axe-core.

**Needs review.**

Nothing flagged for review.

**Passes.**

12 rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### IBM Equal Access 4.0.34.

Configuration: `{"ruleset":"WCAG_2_2","levels":["A","AA"],"scope":["#root","[data-a11y-root]"]}`.

**Violations.**

No automated violations found by IBM Equal Access.

**Needs review.**

Nothing flagged for review.

**Passes.**

23 rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### Virtual screen reader (simulated).

Simulated output from @guidepup/virtual-screen-reader 0.33.0. It isn't a real screen reader, and real ones announce things differently. The log is data. The flags only mark a phrase that is a bare role or a generic role, for a person to check.

Note: The walk stopped after 150 steps, before it came back around to the start.

**Flagged phrases.**

None.

**Announcement log (open state).**

```text
document
main
button, Open dialog, expanded, has popup dialog
dialog, modal
dialog, modal
heading, Edit profile, level 2
paragraph
Update your details.
end of paragraph
button, Close
end of dialog, modal
dialog, modal
heading, Edit profile, level 2
paragraph
Update your details.
end of paragraph
button, Close
end of dialog, modal
dialog, modal
heading, Edit profile, level 2
paragraph
Update your details.
end of paragraph
button, Close
end of dialog, modal
dialog, modal
heading, Edit profile, level 2
paragraph
Update your details.
end of paragraph
button, Close
end of dialog, modal
dialog, modal
heading, Edit profile, level 2
paragraph
Update your details.
end of paragraph
button, Close
end of dialog, modal
dialog, modal
... and 111 more in results.json
```

#### tabs (initial state).

##### axe-core 4.14.0.

Configuration: `{"tags":["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"],"scope":"#root"}`.

**Violations.**

No automated violations found by axe-core.

**Needs review.**

Nothing flagged for review.

**Passes.**

15 rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### IBM Equal Access 4.0.34.

Configuration: `{"ruleset":"WCAG_2_2","levels":["A","AA"],"scope":"#root"}`.

**Violations.**

- `target_spacing_sufficient` (IBM Toolkit level 3; WCAG 2.5.8 Target Size (Minimum); one element). Undersized target "button" does not have sufficient spacing of 12 CSS pixels from another target "button" [Rule help](https://able.ibm.com/rules/archives/latest/doc/en-US/target_spacing_sufficient.html)
  - `#widgets-tab-1` `<button tabindex="-1" aria-controls="widgets-panel-1" aria-selected="false" id="widgets-tab-1" role="tab" type="button">`

**Needs review.**

- `aria_keyboard_handler_exists` (IBM Toolkit level 1; kind: potential; WCAG 2.1.1 Keyboard; one element). Verify the \<div> element with "tablist" role has keyboard access [Rule help](https://able.ibm.com/rules/archives/latest/doc/en-US/aria_keyboard_handler_exists.html)
  - `#root > div:nth-of-type(1) > div:nth-of-type(1)` `<div data-a11y-root="" aria-label="Account settings" role="tablist">`

**Passes.**

24 rules passed. A pass means the rule found nothing to flag. It doesn't show the page meets those criteria.

##### Virtual screen reader (simulated).

Simulated output from @guidepup/virtual-screen-reader 0.33.0. It isn't a real screen reader, and real ones announce things differently. The log is data. The flags only mark a phrase that is a bare role or a generic role, for a person to check.

**Flagged phrases.**

None.

**Announcement log (initial state).**

```text
document
main
tablist, Account settings, orientated horizontally
tab, Profile, selected, 1 control, position 1, set size 2
tab, Security, not selected, 1 control, position 2, set size 2
end of tablist, Account settings, orientated horizontally
tabpanel, Profile
paragraph
Profile settings
end of paragraph
end of tabpanel, Profile
end of main
end of document
```

##### Interactions.

Each check ran on a fresh page, using only the trigger and root hooks and ARIA roles. A check that couldn't finish is an error, which counts as a gap and never as a pass.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `trigger-reachable-by-tab` | pass | [2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) | Tab reached the trigger after 1 press. |
| `focus-indicator-visible` | pass | [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) | Computed style changed on focus: the element: outline. (method: computed-style) |
| `no-focus-trap` | pass | [2.1.2 No Keyboard Trap](https://www.w3.org/TR/WCAG22/#no-keyboard-trap) | Focus moved on after 1 more Tab press. |
| `arrow-keys-move-between-tabs` | pass | [2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) | ArrowRight and ArrowLeft moved focus between tabs. |
| `home-and-end-work` | pass | [2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) | Home moved to the first tab and End to the last. |
| `selected-state-exposed` | pass | [4.1.2 Name, Role, Value](https://www.w3.org/TR/WCAG22/#name-role-value) | Every tab has aria-selected, and exactly one is true. |

##### Computed checks.

automatica11y's own measurements from resolved styles in the browser, with the numbers WCAG gives. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't reduce the page to colors (a gradient, an image, transparency) is undetermined, which counts as a gap and never as a pass.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `text-contrast-by-state` | pass | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The lowest is 18.26:1 in rest (needs 4.5:1). Measured in rest, hover, keyboard focus, pressed. |
| `boundary-contrast` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) | The strongest mark is its top border, at 21:1 (needs 3:1). |
| `focus-indicator-contrast` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), [2.4.13 Focus Appearance](https://www.w3.org/TR/WCAG22/#focus-appearance) | The outline has 5.98:1 against what's next to it (needs 3:1). It's 1px thick, and WCAG 2.4.13 Focus Appearance (level AAA) asks for at least 2px. (method: computed-style) |

##### Conditions.

automatica11y's own checks of how the page holds up under a user's settings (reduced motion, dark mode, more or less contrast, reduced transparency, forced colors) and environment (a 320 pixel window, wider text spacing). Each check opens fresh copies of the page. They're reported on their own and never added to the axe-core or IBM Equal Access counts. A check that can't tell is undetermined, which counts as a gap and never as a pass. "Not applicable" means the page doesn't use the feature, which isn't a failure.

| Check | Result | WCAG | Detail |
| --- | --- | --- | --- |
| `reduced-motion-respected` | not-applicable | [2.3.3 Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions), [2.2.2 Pause, Stop, Hide](https://www.w3.org/TR/WCAG22/#pause-stop-hide) | No animations or transitions were running at load or after the trigger was pressed, so there's nothing to reduce. Motion driven by JavaScript timers isn't visible to this check. |
| `dark-mode-contrast` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-color-scheme: dark, so it doesn't adapt to it. A page isn't required to. Nothing was checked. |
| `more-contrast-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.6 Contrast (Enhanced)](https://www.w3.org/TR/WCAG22/#contrast-enhanced) | The page looks the same under prefers-contrast: more, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `less-contrast-stays-readable` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) | The page looks the same under prefers-contrast: less, so it doesn't respond to it. A page isn't required to. Nothing was checked. |
| `reduced-transparency-respected` | not-applicable | [1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum), [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) | No surface that holds text is see-through (no translucent background and no backdrop filter), so there's nothing to reduce. Empty overlays aren't counted. |
| `forced-colors-focus-visible` | pass | [1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) | With forced colors on, the focus indicator is visible: 146 of 288 changed pixels reach 3:1 against their unfocused color. (method: pixels) |
| `reflow-at-320px` | pass | [1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow) | In a 320px window, nothing reaches past the right edge and the page doesn't scroll sideways. The div fits (8px to 312px). |
| `text-spacing-no-clipping` | pass | [1.4.12 Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing) | With line height 1.5, letter spacing 0.12em, word spacing 0.16em, and paragraph spacing 2em, no element cut off its text (11 elements checked). Overlapping text isn't checked. |

## Method note.

Automated rules cover only part of WCAG. A result of no automated violations found doesn't show that a page conforms to WCAG or works for everyone.

A person has to check what these tools can't judge: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, reading order and focus order in real use, and how real screen readers behave.

Contrast results depend on how the browser rendered the page, so the browser version is recorded above.

**WCAG data.** Criterion names and levels come from the W3C's [WCAG 2.2 JSON](https://www.w3.org/WAI/WCAG22/wcag.json), retrieved 2026-10-08. Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. Links to each criterion are added by automatica11y.

