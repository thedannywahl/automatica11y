import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let axeSource = null;

/** Hand AxeBuilder our own axe-core, so the version we record is the version that ran. */
function loadAxe() {
  axeSource ??= readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  return axeSource;
}

/** Tag sets that match a WCAG version and level. Best-practice rules aren't WCAG, so they stay out. */
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

/** `wcag143` becomes `1.4.3`. Returns null for tags that aren't success criteria. */
function criterionFromTag(tag) {
  const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/** An axe target can be nested for iframes and shadow roots. Flatten it to one readable selector. */
function selectorFor(target) {
  return (Array.isArray(target) ? target.flat(Infinity) : [target]).join(" ");
}

function normalize(items, maxNodes) {
  return items.map((item) => ({
    ruleId: item.id,
    impact: item.impact ?? null,
    wcag: item.tags.map(criterionFromTag).filter(Boolean),
    tags: item.tags.filter((tag) => tag.startsWith("wcag") || tag.startsWith("best-practice")),
    help: item.help,
    helpUrl: item.helpUrl,
    nodeCount: item.nodes.length,
    nodes: item.nodes.slice(0, maxNodes).map((node) => ({ selector: selectorFor(node.target), html: String(node.html).slice(0, 300) })),
  }));
}

/**
 * Run axe-core against the page for one WCAG version and level.
 * @param {import("playwright-core").Page} page
 * @param {{ wcag: string, level: string, maxNodes?: number, scope?: string | null }} options
 *   `scope` is a CSS selector. Component evidence checks only that element, so page-level rules like document title don't fire.
 */
export async function runAxe(page, { wcag, level, maxNodes = 5, scope = null }) {
  const { AxeBuilder } = await import("@axe-core/playwright");
  const tags = axeTags(wcag, level);
  const builder = new AxeBuilder({ page, axeSource: loadAxe() }).withTags(tags);
  if (scope) builder.include(scope);
  const result = await builder.analyze();
  return {
    status: /** @type {const} */ ("ran"),
    version: result.testEngine.version,
    config: { tags, ...(scope ? { scope } : {}) },
    violations: normalize(result.violations, maxNodes),
    incomplete: normalize(result.incomplete, maxNodes),
    passesCount: result.passes.length,
    notes: /** @type {string[]} */ ([]),
  };
}
