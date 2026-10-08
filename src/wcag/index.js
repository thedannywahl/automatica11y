/**
 * WCAG success criteria, read from the W3C's own published JSON (src/data/wcag-2.2.json, unmodified).
 * Criterion numbers, names, levels, and versions all come from that file. Nothing here is typed in by hand.
 * The links are built from each criterion's `id` and are ours, not the W3C's data.
 *
 * Source: Web Content Accessibility Guidelines (WCAG) 2.2, https://www.w3.org/TR/WCAG22/
 * Terms of use: https://github.com/w3c/wcag/blob/main/11ty/json/README.md
 */
import { readFileSync } from "node:fs";

const DATA = new URL("../data/wcag-2.2.json", import.meta.url);
const SOURCE = new URL("../data/wcag-2.2.source.json", import.meta.url);

/** @typedef {{ num: string, id: string, handle: string, level: "A" | "AA" | "AAA", versions: string[], url: string, understandingUrl: string }} Criterion */

/** @type {Map<string, Criterion> | null} */
let index = null;

function load() {
  if (index) return index;
  const data = JSON.parse(readFileSync(DATA, "utf8"));
  index = new Map();
  for (const principle of data.principles) {
    for (const guideline of principle.guidelines) {
      for (const sc of guideline.successcriteria) {
        index.set(sc.num, {
          num: sc.num,
          id: sc.id,
          handle: sc.handle,
          level: sc.level,
          versions: sc.versions,
          url: `https://www.w3.org/TR/WCAG22/#${sc.id}`,
          understandingUrl: `https://www.w3.org/WAI/WCAG22/Understanding/${sc.id}`,
        });
      }
    }
  }
  return index;
}

/** The criterion with this number, such as `1.4.3`, or null when WCAG 2.2 has no such criterion. */
export function criterion(num) {
  return load().get(num) ?? null;
}

/** The criterion for a number written without dots, the way axe-core tags it: `1410` is 1.4.10. Null when none matches. */
export function criterionFromDigits(digits) {
  for (const c of load().values()) if (c.num.replaceAll(".", "") === digits) return c;
  return null;
}

/** Every criterion, in the W3C's order. */
export function allCriteria() {
  return [...load().values()];
}

/** True when the criterion is part of this WCAG version (`2.0`, `2.1`, or `2.2`). */
export function inVersion(num, version) {
  return criterion(num)?.versions.includes(version) ?? false;
}

/** "1.4.3 Contrast (Minimum)", or just the number when the W3C data doesn't know it. */
export function criterionName(num) {
  const c = criterion(num);
  return c ? `${c.num} ${c.handle}` : num;
}

/** "WCAG 2.4.13 Focus Appearance (level AAA)" for use in a sentence. */
export function criterionRef(num) {
  const c = criterion(num);
  return c ? `WCAG ${c.num} ${c.handle} (level ${c.level})` : `WCAG ${num}`;
}

/** Where the data came from and when it was downloaded, for the report's attribution line. */
export function wcagSource() {
  return JSON.parse(readFileSync(SOURCE, "utf8"));
}

/** The sentence a report prints wherever it shows criterion names. */
export function wcagAttribution() {
  const { retrieved } = wcagSource();
  return `Criterion names and levels come from the W3C's [WCAG 2.2 JSON](https://www.w3.org/WAI/WCAG22/wcag.json), retrieved ${retrieved}. Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. Links to each criterion are added by automatica11y.`;
}
