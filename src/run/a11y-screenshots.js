import { mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { installSelectors } from "../tiers/rules/selectors.js";

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

    const nodes = result.violations.flatMap((finding) => finding.nodes);
    const relativePath = join("screenshots", pathPart(target), `${pathPart(context)}-${pathPart(engine)}.png`).split(sep).join("/");
    const absolutePath = resolve(outputDir, relativePath);
    const markers = nodes.map((node, index) => ({ ...node, number: index + 1 }));

    try {
      await installSelectors(page);
      const located = await page.evaluate((items) => {
        /** @type {string[]} */
        const unresolved = [];
        const resolved = items.flatMap((item) => {
          try {
            const element = window.__a11ySelectors.resolve(item);
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) throw new Error("Reported element has no visible bounds.");
            return [{ element, rect, number: item.number }];
          } catch (error) {
            unresolved.push(`#${item.number}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
          }
        });
        /** @type {Map<Document, HTMLDivElement>} */
        const overlays = new Map();

        let count = 0;
        for (const item of resolved) {
          const { element, rect } = item;
          const owner = element.ownerDocument;
          const view = owner.defaultView;
          let overlay = overlays.get(owner);
          if (!overlay) {
            overlay = owner.createElement("div");
            overlay.dataset.automatica11yScreenshotOverlay = "true";
            Object.assign(overlay.style, {
              position: "absolute",
              top: "0",
              left: "0",
              width: `${Math.max(owner.documentElement.scrollWidth, owner.body?.scrollWidth ?? 0)}px`,
              height: `${Math.max(owner.documentElement.scrollHeight, owner.body?.scrollHeight ?? 0)}px`,
              pointerEvents: "none",
              zIndex: "2147483647",
            });
            overlays.set(owner, overlay);
          }
          const outline = owner.createElement("div");
          Object.assign(outline.style, {
            position: "absolute",
            left: `${rect.left + view.scrollX}px`,
            top: `${rect.top + view.scrollY}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            boxSizing: "border-box",
            border: "3px solid #c62828",
            background: "rgba(198, 40, 40, 0.08)",
          });
          const number = owner.createElement("span");
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

        for (const [owner, overlay] of overlays) owner.documentElement.append(overlay);
        return { count, unresolved };
      }, markers);

      if (located.unresolved.length) {
        result.notes = [...(result.notes ?? []), `Annotated screenshot omitted ${located.unresolved.length} of ${markers.length} reported elements. ${located.unresolved.join("; ")}`];
      }
      if (!located.count) {
        result.notes = [...(result.notes ?? []), "No reported elements could be located for an annotated screenshot."];
        continue;
      }

      mkdirSync(dirname(absolutePath), { recursive: true });
      await page.screenshot({ path: absolutePath, fullPage: true, animations: "disabled" });
      result.screenshot = relativePath;
    } catch (error) {
      result.notes = [...(result.notes ?? []), `Annotated screenshot could not be captured: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`];
    } finally {
      for (const frame of page.frames()) {
        await frame.evaluate(() => document.querySelectorAll("[data-automatica11y-screenshot-overlay]").forEach((overlay) => overlay.remove())).catch(() => {});
      }
    }
  }
}