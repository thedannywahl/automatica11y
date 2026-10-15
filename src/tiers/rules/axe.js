import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { criterionFromDigits } from "../../wcag/index.js";
import { installSelectors } from "./selectors.js";

const require = createRequire(import.meta.url);
/** @type {string | null} */
let axeSource = null;

/** Hand AxeBuilder our own axe-core, so the version we record is the version that ran. */
function loadAxe() {
  axeSource ??= readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  return axeSource;
}

/**
 * Tag sets that match a WCAG version and level. Best-practice rules aren't WCAG, so they stay out.
 * @param {string} wcag
 * @param {string} level
 */
export function axeTags(wcag, level) {
  const tags = ["wcag2a"];
  if (level !== "A") tags.push("wcag2aa");
  if (level === "AAA") tags.push("wcag2aaa");
  if (wcag === "2.1" || wcag === "2.2") {
    tags.push("wcag21a");
    if (level !== "A") tags.push("wcag21aa");
    if (level === "AAA") tags.push("wcag21aaa");
  }
  if (wcag === "2.2") {
    if (level !== "A") tags.push("wcag22aa");
    if (level === "AAA") tags.push("wcag22aaa");
  }
  return tags;
}

/**
 * `wcag143` becomes `1.4.3`, using the W3C's list of criteria. Returns null for tags that aren't success criteria.
 * @param {string} tag
 */
function criterionFromTag(tag) {
  const match = /^wcag(\d{3,4})$/.exec(tag);
  return match ? (criterionFromDigits(match[1])?.num ?? null) : null;
}

/**
 * Preserve axe's outer frame steps and inner shadow-root steps.
 * @param {import("axe-core").NodeResult["target"]} target
 * @returns {Pick<import('../../types.js').Finding['nodes'][number], 'selector' | 'selectorPath'>}
 */
function selectorFor(target) {
  const frames = Array.isArray(target) ? target : [target];
  /** @type {NonNullable<import('../../types.js').Finding['nodes'][number]['selectorPath']>} */
  const selectorPath = [];
  let selector = "";
  for (const [frameIndex, frame] of frames.entries()) {
    const shadows = Array.isArray(frame) ? frame : [frame];
    for (const [shadowIndex, part] of shadows.entries()) {
      selector = String(part);
      if (shadowIndex < shadows.length - 1) selectorPath.push({ selector, enter: "shadow" });
      else if (frameIndex < frames.length - 1) selectorPath.push({ selector, enter: "frame" });
    }
  }
  return { selector, ...(selectorPath.length ? { selectorPath } : {}) };
}

/**
 * @param {import("axe-core").Result[]} items
 * @param {number} maxNodes
 */
function normalize(items, maxNodes) {
  return items.map((item) => ({
    ruleId: item.id,
    impact: item.impact ?? null,
    wcag: item.tags.map(criterionFromTag).filter(Boolean),
    tags: item.tags.filter((tag) => tag.startsWith("wcag") || tag.startsWith("best-practice")),
    help: item.help,
    helpUrl: item.helpUrl,
    nodeCount: item.nodes.length,
    nodes: item.nodes.slice(0, maxNodes).map((node) => ({ ...selectorFor(node.target), html: String(node.html).slice(0, 300) })),
  }));
}

/**
 * Run axe-core against the page for one WCAG version and level.
 * @param {import("playwright-core").Page} page
 * @param {{ wcag: string, level: string, maxNodes?: number, scope?: string | string[] | null }} options
 *   `scope` is a CSS selector. Component evidence checks only that element, so page-level rules like document title don't fire.
 */
export async function runAxe(page, { wcag, level, maxNodes = 5, scope = null }) {
  const { AxeBuilder } = await import("@axe-core/playwright");
  const tags = axeTags(wcag, level);
  const builder = new AxeBuilder({ page, axeSource: loadAxe() }).withTags(tags);
  for (const selector of [scope ?? []].flat()) builder.include(selector);
  const result = await builder.analyze();
  await installSelectors(page);
  const [violations, incomplete] = await page.evaluate((groups) => groups.map((findings) => findings.map((finding) => ({
    ...finding,
    nodes: finding.nodes.map((node) => {
      try {
        window.__a11ySelectors.resolve(node);
        return node;
      } catch (error) {
        return { ...node, selectorError: error instanceof Error ? error.message : String(error) };
      }
    }),
  }))), [normalize(result.violations, maxNodes), normalize(result.incomplete, maxNodes)]);
  return {
    status: /** @type {const} */ ("ran"),
    version: result.testEngine.version,
    config: { tags, ...(scope ? { scope } : {}) },
    violations,
    incomplete,
    passesCount: result.passes.length,
    notes: /** @type {string[]} */ ([]),
  };
}
