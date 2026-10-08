import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COMPUTED_CHECKS } from "../src/tiers/computed/checks.js";
import { ARCHETYPE_CHECKS, COMMON } from "../src/tiers/interactions/archetypes.js";
import { allCriteria, criterion, criterionFromDigits, criterionName, criterionRef, inVersion, wcagAttribution, wcagSource } from "../src/wcag/index.js";
import { criteriaCell } from "../src/report/parts.js";

const read = (path) => readFileSync(new URL(path, import.meta.url));

test("the WCAG file is the W3C's, byte for byte", () => {
  const { sha256, source } = wcagSource();
  assert.equal(createHash("sha256").update(read("../src/data/wcag-2.2.json")).digest("hex"), sha256, "run `npm run update-wcag` instead of editing the file");
  assert.equal(source, "https://www.w3.org/WAI/WCAG22/wcag.json");
});

test("criteria come from the W3C data: names, levels, versions, and links", () => {
  assert.equal(allCriteria().filter((c) => c.versions.includes("2.2")).length, 86, "WCAG 2.2 has 86 success criteria");
  assert.ok(!inVersion("4.1.1", "2.2"), "4.1.1 Parsing was removed in 2.2, and the file says so");
  const contrast = criterion("1.4.3");
  assert.deepEqual([contrast.handle, contrast.level], ["Contrast (Minimum)", "AA"]);
  assert.equal(contrast.url, "https://www.w3.org/TR/WCAG22/#contrast-minimum");
  assert.equal(criterionName("2.4.7"), "2.4.7 Focus Visible");
  assert.equal(criterionRef("2.4.13"), "WCAG 2.4.13 Focus Appearance (level AAA)");
  assert.equal(criterionRef("9.9.9"), "WCAG 9.9.9", "an unknown number stays as written");
  assert.equal(criterion("9.9.9"), null);
  assert.ok(inVersion("1.4.3", "2.0") && inVersion("2.4.13", "2.2") && !inVersion("2.4.13", "2.1"));
});

test("axe-core's compact tags map to criteria, including the two-digit ones", () => {
  assert.equal(criterionFromDigits("143").num, "1.4.3");
  assert.equal(criterionFromDigits("1410").num, "1.4.10");
  assert.equal(criterionFromDigits("2411").num, "2.4.11");
  assert.equal(criterionFromDigits("999"), null);
});

test("every criterion a check cites exists in WCAG 2.2", () => {
  const checks = [...COMMON, ...Object.values(ARCHETYPE_CHECKS).flat(), ...COMPUTED_CHECKS];
  const cited = new Set(checks.flatMap((c) => c.criteria));
  assert.ok(cited.size >= 8);
  for (const num of cited) assert.ok(criterion(num), `${num} is a WCAG 2.2 success criterion`);
});

test("reports link each criterion and credit the W3C", () => {
  assert.equal(criteriaCell(["1.4.3"]), "[1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)");
  assert.equal(criteriaCell([]), "-");
  assert.match(wcagAttribution(), /W3C's \[WCAG 2\.2 JSON\]\(https:\/\/www\.w3\.org\/WAI\/WCAG22\/wcag\.json\), retrieved \d{4}-\d{2}-\d{2}/);
  assert.match(wcagAttribution(), /\[Web Content Accessibility Guidelines \(WCAG\) 2\.2\]\(https:\/\/www\.w3\.org\/TR\/WCAG22\/\)/);
});

test("the README and the data folder carry the W3C attribution", () => {
  for (const file of ["../README.md", "../src/data/README.md"]) {
    const text = read(file).toString();
    assert.match(text, /https:\/\/www\.w3\.org\/TR\/WCAG22\//, `${file} links the WCAG 2.2 Recommendation`);
    assert.match(text, /https:\/\/github\.com\/w3c\/wcag\/blob\/main\/11ty\/json\/README\.md/, `${file} links the W3C's terms`);
    assert.match(text, /[Dd]on't change the content|without changes/, `${file} says the content isn't changed`);
  }
});
