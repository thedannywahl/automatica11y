import { mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** @param {string} value */
const pathPart = (value) => String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";

/**
 * Save one full-page screenshot per engine, with numbered outlines for its stored violation nodes.
 * @param {import("../types.js").Page} page
 * @param {import("../types.js").TierResult | undefined} rules
 * @param {{ enabled: boolean, outputDir: string, target: string, context: string }} options
 */
export async function captureRuleScreenshots(page, rules, { enabled, outputDir, target, context }) {
  if (!enabled || !rules || rules.status !== "ran") return;

  for (const [engine, result] of Object.entries(rules.engines ?? {})) {
    if (result.status !== "ran" || result.violations.length === 0) continue;

    const nodes = result.violations.flatMap((finding) => finding.nodes.map((node) => ({ selector: node.selector })));
    const relativePath = join("screenshots", pathPart(target), `${pathPart(context)}-${pathPart(engine)}.png`).split(sep).join("/");
    const absolutePath = resolve(outputDir, relativePath);
    const markers = nodes.map((node, index) => ({ ...node, number: index + 1 }));

    try {
      const located = await page.evaluate((items) => {
        const overlay = document.createElement("div");
        overlay.dataset.automatica11yScreenshotOverlay = "true";
        Object.assign(overlay.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: `${Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)}px`,
          height: `${Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)}px`,
          pointerEvents: "none",
          zIndex: "2147483647",
        });

        let count = 0;
        for (const item of items) {
          /** @type {Element[]} */
          let elements = [];
          try {
            elements = [...document.querySelectorAll(item.selector)];
          } catch {
            // Some engine selectors include shadow-root paths that CSS cannot resolve from the document.
          }
          for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const outline = document.createElement("div");
            Object.assign(outline.style, {
              position: "absolute",
              left: `${rect.left + window.scrollX}px`,
              top: `${rect.top + window.scrollY}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              boxSizing: "border-box",
              border: "3px solid #c62828",
              background: "rgba(198, 40, 40, 0.08)",
            });
            const number = document.createElement("span");
            number.textContent = String(item.number);
            Object.assign(number.style, {
              position: "absolute",
              top: "0",
              left: "0",
              minWidth: "20px",
              height: "20px",
              padding: "0 4px",
              boxSizing: "border-box",
              borderRadius: "10px",
              background: "#c62828",
              color: "#fff",
              font: "bold 13px/20px sans-serif",
              textAlign: "center",
            });
            outline.append(number);
            overlay.append(outline);
            count += 1;
          }
        }

        if (count) document.documentElement.append(overlay);
        return count;
      }, markers);

      if (!located) {
        result.notes = [...(result.notes ?? []), "No reported elements could be located for an annotated screenshot."];
        continue;
      }

      mkdirSync(dirname(absolutePath), { recursive: true });
      try {
        await page.screenshot({ path: absolutePath, fullPage: true, animations: "disabled" });
        result.screenshot = relativePath;
      } finally {
        await page.evaluate(() => document.querySelector("[data-automatica11y-screenshot-overlay]")?.remove()).catch(() => {});
      }
    } catch (error) {
      result.notes = [...(result.notes ?? []), `Annotated screenshot could not be captured: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`];
      await page.evaluate(() => document.querySelector("[data-automatica11y-screenshot-overlay]")?.remove()).catch(() => {});
    }
  }
}