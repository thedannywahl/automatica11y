# Reading a report.

Every run writes `report.md`, `results.json`, and `plan.json`. `report.md` is the one to read first. `results.json` has everything behind it.

## The coverage matrix.

A report opens with a matrix of target by archetype by tier. Each cell says what happened: `ran`, `gap`, `not-testable`, `not-applicable`, `skipped`, or `failed`. A gap, a failure, or a target that wasn't testable is a finding. It never counts as a pass.

## Result values.

Checks in the interactions, computed, and conditions tiers report one of these:

| Result | Meaning |
|---|---|
| `pass` | The check measured or observed what it looks for, and it held. |
| `fail` | It didn't hold. The detail says what was measured and what was needed. |
| `undetermined` | The check couldn't reduce the page to an answer, for example text over a gradient. It's a gap, never a pass. |
| `not-applicable` | The page doesn't use the feature. A page with no dark theme has nothing to check in dark mode. That isn't a failure. |
| `error` | The check couldn't finish. It's untested, not failed. |

## Findings stay separate.

axe-core and IBM Equal Access findings are listed under their own names, and their counts are never added together. axe-core's `impact` and IBM's Toolkit level are different scales and aren't converted into each other. Computed checks and conditions checks are reported on their own as well, because they are automatica11y's own measurements.

## How much to trust a result.

Each target carries the kind of evidence it gave:

- **Component evidence** comes from a fixture. An **authored** fixture, written from the library's documentation, is the strongest. A **template** (for `button` and `link`) is built from the export name. A **generated** fixture is a guess about how the library is assembled, so a failure may come from the wiring and not from the library. Reports mark generated results and the source is written to `generated/<target id>/` beside the report.
- **Page evidence** comes from testing a whole page.

A comparison that mixes the two opens with a warning. The report also records the date, the tool versions, and the package versions, because results are a snapshot.

## Wording.

A report says "no automated violations found" only for an engine that reported none for that target. It never says "accessible," "compliant," or "passes WCAG." It doesn't print a single score. If someone asks for a number, pair it with the coverage matrix and the limits.

Criterion names and levels come from the W3C's [WCAG 2.2 JSON](https://www.w3.org/WAI/WCAG22/wcag.json), and every report credits the source in its closing section.
