/**
 * Decide whether the scope is mainly a canvas with nothing a rule engine can read.
 * A canvas is a bitmap to the accessibility tree. Without a text alternative, a nearby table or SVG, or a label,
 * axe and IBM would find nothing and the result would read as clean. It isn't clean. It's untested.
 * @param {import("playwright-core").Page} page
 * @param {string | string[] | null} scope
 * @returns {Promise<{ canvases: number, canvasOnly: boolean, hasAlternative: boolean }>}
 */
export async function inspectCanvas(page, scope) {
  return page.evaluate((scopes) => {
    const roots = scopes.length ? scopes.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document.body];
    const canvases = roots.flatMap((root) => [...root.querySelectorAll("canvas")]);
    if (canvases.length === 0) return { canvases: 0, canvasOnly: false, hasAlternative: false };
    const labelled = canvases.some(
      (canvas) =>
        canvas.hasAttribute("aria-label") ||
        canvas.hasAttribute("aria-labelledby") ||
        ["img", "graphics-document"].includes(canvas.getAttribute("role") ?? "") ||
        (canvas.textContent ?? "").trim().length > 0,
    );
    const nearby = roots.some((root) => root.querySelector('svg, table, [role="img"], [role="graphics-document"], [role="figure"], figure'));
    const text = roots
      .map((root) => {
        const copy = /** @type {HTMLElement} */ (root.cloneNode(true));
        copy.querySelectorAll("canvas, script, style").forEach((el) => el.remove());
        return (copy.textContent ?? "").trim();
      })
      .join(" ").length;
    const hasAlternative = labelled || nearby || text >= 20;
    return { canvases: canvases.length, canvasOnly: !hasAlternative, hasAlternative };
  }, [scope ?? []].flat());
}

export const CANVAS_REASON = "Canvas output exposes nothing to rule checks.";
