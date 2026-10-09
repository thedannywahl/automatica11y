# What it checks.

Five tiers run by default. Use `--tiers` to pick fewer.

## Rules.

axe-core and IBM Equal Access run side by side. They overlap, and each catches things the other misses. Their findings are reported separately and never added together. axe-core reports an impact (`minor` to `critical`). IBM reports its Toolkit level, a staged adoption scale where level 1 is essential, high-impact requirements. The two scales aren't comparable.

## Interactions.

Keyboard and focus checks for ten archetypes: button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, and live-region (a message that appears or changes without moving focus, such as an alert or status message). Each check runs on a fresh page. Archetypes are the standard building blocks of HTML and ARIA patterns. A larger widget, such as a carousel, is tested through the archetypes it's made of.

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
