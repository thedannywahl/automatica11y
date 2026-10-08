# Spike: IBM Equal Access engine

Result: `ace.js` injects and runs on strict-CSP pages through `page.evaluate`. `toolkitLevel` is documented by IBM as an adoption level (1 to 3), so we carry it as its own field. It isn't impact, and we don't map it onto axe's scale.

Correction: an earlier version of this note said `toolkitLevel` had no documented meaning. That was wrong. We searched the npm package and one web query, and missed IBM's requirements page and the repo.

## Injection
- Package: `accessibility-checker-engine` 4.0.34 (Apache-2.0, zero dependencies). Runtime needs only `ace.js` (685 KB). The other 25 MB of the install is debug bundles and help files.
- `page.evaluate(aceSource)` then `new window.ace.Checker().check(document, ["IBM_Accessibility"])` worked on three pages:
  - Local page with `script-src 'nonce-…' 'strict-dynamic'`: 57 results, 1 failure, 64 ms.
  - github.com: 6,894 results, 17 failures, 1,550 ms.
  - w3.org/WAI: 2,166 results, 12 failures, 260 ms.
- `page.addScriptTag({ content })` failed on github.com ("Executing inline script violates … Content Security Policy"). It passed on the other two. Use `page.evaluate`, not `addScriptTag`.
- `bypassCSP: true` also worked. We won't use it, because it changes how the page behaves.

## Result shape
- Each result has `ruleId`, `value: [level, outcome]` (for example `["VIOLATION","FAIL"]`), `reasonId`, `message`, `path.dom`, `path.aria`, and `snippet`.
- We map `FAIL` to violations and `POTENTIAL`, manual, and recommendation to needs-review.
- Rulesets available: `IBM_Accessibility`, `IBM_Accessibility_next`, `WCAG_2_2`, `WCAG_2_1`, `WCAG_2_0`, and `EXTENSIONS`. Checkpoints carry `wcagLevel`, which supports `--level`.

## toolkitLevel
- IBM's [requirements page](https://www.ibm.com/able/requirements/requirements/) defines the levels IBM asks teams to reach:
  - Level 1: essential requirements with high user impact, normally with the least investment (safety, color contrast, text alternatives, navigation, operation, and errors).
  - Level 2: adds the next-most important requirements.
  - Level 3: the full set (WCAG, US Revised 508, EN 301 549).
- The engine tags each rule with `toolkitLevel` `"1"` to `"4"` (`eToolkitLevel` in `IGuideline.ts`). The [IBMa/equal-access](https://github.com/IBMa/equal-access) repo uses it in rule definitions, the generated `rules.csv` ("Toolkit Level" column), and the spreadsheet reports. We found no definition of Level 4. Only four `IBM_Accessibility` rules use it, all recommendations.
- Rule counts in `IBM_Accessibility` by toolkit level and result level: Level 1 has 74 violations and 11 recommendations. Level 2 has 24 violations and 3 recommendations. Level 3 has 47 violations and 18 recommendations. Level 4 has 4 recommendations.
- Failing rules seen on our test pages ranged from Level 1 to Level 3 (for example `img_alt_valid` is 1, `a_text_purpose` is 2, and `skip_main_exists` is 3).
- IBM also documents its result levels: violation, potential violation, recommendation, potential recommendation, and manual.

## Decisions
- Carry `toolkitLevel` on each IBM finding, labeled "IBM Toolkit level," and say what it means in the report: IBM's staged adoption level, where 1 is essential with high user impact. It's IBM's label, not ours, and not axe-style impact. IBM findings keep `impact: null`.
- Show Level 4 as "Level 4 (not defined by IBM)."
- Fail checks use per-engine flags (`--fail-on-axe`, `--fail-on-ibm`) with a combined `--fail-mode`. See Finding 9 in the plan.
