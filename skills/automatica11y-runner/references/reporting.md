# Writing the report

Read this before you write any report or summary of results, every time. Write the narrative from `<out>/results.json`. Never write from memory, and never repeat a number you didn't read. Read `<out>/report.md` too: it's a complete report the tool wrote, and its structure is the one to follow.

## Before you write

Check that the report uses measured wording from the results; names every failed target with its recorded reason; identifies generated-fixture results as lower evidence and names each recipe; and treats every not-testable result, error, or gap as a finding, never as clean coverage.

Use the caveat sentence verbatim: "These automated results do not establish that the page meets WCAG; manual review is still needed." Avoid positive accessibility verdicts in headings and summaries. Quoted rule text is not itself a claim that a target passed; distinguish quotations and negated statements from an actual verdict.

A title, run metadata, and settings may precede the coverage matrix; the matrix comes before the findings. When IBM Equal Access reports no violations but reports needs-review items, write "IBM Equal Access reported no violations in this run" and list the needs-review items in their own section. Do not use "no automated violations found" for IBM. Never say an engine "found nothing" when it reported needs-review items.

## The rules

1. Put the run date and tool versions first. Say that results are a snapshot. When `results.json` contains an outdated-browser warning, keep it in the report header before coverage and findings, name the browser version, and say results may be unreliable. Preserve that warning in any separate summary; do not hide it in a footer or describe the browser as supported.
2. For a comparison, say that every target used the same archetypes, WCAG version, level, and rules, in those words. The settings apply to every target, including one that failed, so don't narrow the sentence to the targets that ran.
3. Open with the coverage matrix (target by archetype by tier). Then give the findings.
4. Keep violations, needs-review items, and passes in separate lists. Never merge them. For each engine and archetype, write three labeled lists (**Violations**, **Needs review**, **Passes**), even when one is just "none". Don't put two of them in one bullet, line, or sentence, even when they're short. For example:

   ```markdown
   **axe-core 4.14.0**
   - Violations: no automated violations found.
   - Needs review: none.
   - Passes: 9 rules.
   ```

   Report only what the results contain; don't add explanations of why something happened.
5. Break findings out by archetype. Within an archetype, order axe-core findings by impact and IBM findings by Toolkit level.
6. Use "no automated violations found" only for axe-core when it reports zero violations for that target; otherwise list its violations as reported. Where it doesn't apply (a failed target, a page that wasn't reached, an engine that didn't run), don't write the phrase at all, not even to say it doesn't apply. Say what's missing instead, such as "axe-core has no results, because no page was audited." For IBM Equal Access, write "IBM Equal Access reported no violations in this run." when it reports zero. Never use "no automated violations found" for IBM. `report.md` writes "No automated violations found by IBM Equal Access." for that case; in your report, write "IBM Equal Access reported no violations in this run." instead, and don't quote or mention the original line. Never say "accessible," "compliant," or "passes WCAG." That includes negative or hedged sentences such as "I can't say whether it's accessible" or "the report doesn't say the site is accessible."
7. Don't print a single score, and don't write an overall or combined line that adds counts across archetypes, fixtures, or engines. Each count stays with its own archetype and engine. If `results.json` or `report.md` has run-level counts across fixtures, don't copy them. If someone insists, pair any number with the coverage matrix and the automated-coverage caveat.
8. Label virtual screen reader output **simulated**. Label library accessibility options **on** or **off** on every result that has one.
9. Treat a gap, a not-testable result, an error, or a failed target as a finding. It never counts as a pass.
10. If the comparison mixes npm package or Storybook targets with live URL or local page or site targets, open the report with a warning that the evidence isn't equivalent.
11. Label every rule finding with its engine. Report axe-core and IBM Equal Access separately. Never add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (1 is essential, high-impact requirements); report IBM's result even when it has zero violations, without saying "no automated violations found." Don't convert one scale into the other.
12. Report computed checks (contrast measured from resolved styles) in their own section. Give the measured ratio next to the ratio the criterion needs, and name the state or the method. Never add them to axe-core or IBM counts. Treat `undetermined` as a gap, never as a pass. When a control has visible text and a pale edge, the result is `not-applicable`, because the text identifies the control. Say that, and leave it for a person to confirm.
13. Report conditions checks (reduced motion, dark mode, more and less contrast, reduced transparency, forced colors, reflow at 320 pixels, text spacing) in their own section, with the numbers from `results.json`. Never add them to axe-core or IBM counts. In the computed checks section, `not-applicable` means the control's visible text identifies it; in the conditions section, `not-applicable` means the page does not use the feature. Always name the section when reporting this value. Don't list an unused feature, such as a dark theme on a page with no dark theme, as a failure or a pass. Say what each check can't see: JavaScript-driven motion, overlapping text, and two-dimensional content that WCAG exempts from reflow.
14. Say which results come from generated fixtures. A generated fixture is a guess about how the library is assembled, so a failure may come from the wiring and not from the library. Call those results lower evidence than an authored fixture, name the recipe from the **Fixture** column, and list each failed interaction check by its exact ID from `results.json`. Label each fixture-backed result as generated or authored, using those words (a fixture the user wrote is "authored"). In the report and the final summary, head a generated result as `<archetype> (generated fixture, recipe <recipe>, lower evidence than an authored fixture)`, for example `Dialog (generated fixture, recipe dialog-compound, lower evidence than an authored fixture)`, and keep its failed check IDs, even when the full report is written to a file. Don't compare a generated result with an authored one as if they were equal, and never add their checks into one total. If the user wants a result to stand on its own, write an authored fixture for it.
15. When you name a WCAG criterion, use the number and name exactly as `report.md` prints them, and keep its "WCAG data" credit to the W3C. Don't write criterion names or levels from memory.
16. End with a plain method note. Say what automated tools can't catch: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, and how real screen readers behave. Those need a person.

Quote selectors and rule IDs exactly as `results.json` has them. Keep `report.md` screenshot links attached to their relevant finding or story when writing a separate summary.

## Site results

For a crawled site, report `discovery.statistics` and `discovery.queue` using their native Crawlee meanings, then the per-page findings and `discovery.gaps`/events. Finished/handled requests are not accessibility passes. Queue exhaustion is not whole-site coverage; pending requests, caps, sitemap failures and failed authentication must be disclosed. Never combine axe/IBM counts or claim a failed login page was audited as the intended application. Reports and screenshots from authenticated pages may contain sensitive content; avoid copying private data into chat. When coverage is missing, say what's missing; don't say what the report doesn't claim about the site (not "the report doesn't say the site is accessible").

## When a target can't be tested

Say these things plainly. Don't soften them, and don't fill in a result.

- **Unsupported framework.** The package needs a framework other than React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, or web components. Name it, and say which version is unsupported (Vue 2, Svelte 4, or Angular 21, for example). This version covers React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, and web components. A Storybook for the library still works, whatever the framework.
- **Not applicable.** The package has no rendering surface, such as a utility library. There's nothing to test.
- **Not testable.** The content is a canvas with no alternative, or sits in a closed shadow root. The rule engines can't see it, so the result is untested, not clean. Under each engine, write "Violations: not testable (coverage gap)" and the reason. Don't write "none" or "none reported" for an engine that tested nothing. The virtual screen reader also can't read open shadow roots.
- **Gap.** The archetype has no usable fixture or no matching export. Say what the archetype needs.
- **Error.** An interaction or computed check couldn't finish. It's untested, not failed.
- **Undetermined.** A computed check found a gradient, an image, or transparency behind the control, so it can't reduce the page to one color. It's untested, not clean.
- **Failed target.** The target can't be reached, isn't a web page, or couldn't be built. The tool records it as failed with a reason. Tell the user which target failed, using the reason from `results.json`, including when every target failed during resolution before auditing. If others ran, report them, and list the failed target as a gap in coverage.
