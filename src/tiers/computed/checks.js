/**
 * The computed checks. Each reads resolved styles (and, for one case, pixels) from a real browser and compares
 * them with the numbers WCAG gives. A check returns pass, fail, undetermined, or not-applicable with a detail.
 * `undetermined` means the page uses something a color can't be reduced to (a gradient, an image, transparency).
 * It's a gap and never a pass.
 * These are automatica11y's own measurements. They're reported on their own and never added to axe-core or IBM counts.
 */
import { criterionRef } from "../../wcag/index.js";
import { contrastOver, contrastRatio, formatRatio, textThreshold } from "./color.js";

const pass = (detail, extra = {}) => ({ result: "pass", detail, ...extra });
const fail = (detail, extra = {}) => ({ result: "fail", detail, ...extra });
const na = (detail) => ({ result: "not-applicable", detail });
const undetermined = (detail, extra = {}) => ({ result: "undetermined", detail, ...extra });

/** Time for CSS transitions to finish before a state is measured. */
const SETTLE_MS = 400;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const floor2 = (n) => Math.floor(n * 100) / 100;

/** Move the pointer away and let any hover styles end. */
async function parkPointer(ctx) {
  await ctx.page.mouse.move(0, 0);
  await ctx.settle(SETTLE_MS);
}

/** Text contrast in each state a person can put the control in. */
const TEXT_CONTRAST = {
  name: "text-contrast-by-state",
  criteria: ["1.4.3"],
  async run(ctx) {
    /** @type {Array<{ state: string, parts: any[] }>} */
    const states = [];
    const measure = async (state) => states.push({ state, parts: (await ctx.page.evaluate(() => window.__a11yMeasure.text())) ?? [] });
    await parkPointer(ctx);
    await measure("rest");
    if (states[0].parts.length === 0) return na("The trigger has no visible text, so its text contrast wasn't measured.");
    await ctx.trigger.hover();
    await ctx.settle(SETTLE_MS);
    await measure("hover");
    await parkPointer(ctx);
    const reached = await ctx.tabToTrigger();
    await ctx.settle(SETTLE_MS);
    if (reached !== null) await measure("keyboard focus");
    await ctx.page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur?.());
    await ctx.trigger.hover();
    await ctx.page.mouse.down();
    await ctx.settle(SETTLE_MS);
    await measure("pressed");
    await ctx.page.mouse.up().catch(() => {});

    const rows = [];
    const unknown = [];
    for (const { state, parts } of states) {
      for (const part of parts) {
        if (part.undetermined || !part.backdrop) {
          unknown.push(`In ${state}, "${part.text}" can't be measured because ${part.undetermined ?? "its background couldn't be read"}.`);
          continue;
        }
        rows.push({ state, text: part.text, ratio: contrastOver(part.color, part.backdrop), required: textThreshold(part.size, part.weight) });
      }
    }
    const measurements = rows.map((r) => ({ state: r.state, text: r.text, ratio: floor2(r.ratio), required: r.required }));
    const failed = rows.filter((r) => r.ratio < r.required).sort((a, b) => a.ratio / a.required - b.ratio / b.required);
    const list = `Measured in ${states.map((s) => s.state).join(", ")}.`;
    const skipped = reached === null ? " The trigger couldn't be reached with Tab, so keyboard focus wasn't measured." : "";
    if (failed.length) {
      const f = failed[0];
      const more = failed.length > 1 ? ` ${failed.length - 1} more measurement${failed.length > 2 ? "s are" : " is"} below its threshold.` : "";
      return fail(`In ${f.state}, "${f.text}" has ${formatRatio(f.ratio)} against its background and needs ${f.required}:1.${more} ${list}${skipped}`, { measurements });
    }
    if (unknown.length || reached === null) {
      const low = rows.length ? `The lowest measured is ${formatRatio(Math.min(...rows.map((r) => r.ratio)))}. ` : "";
      return undetermined(`${low}${unknown[0] ?? ""} ${list}${skipped}`.replace(/\s+/g, " ").trim(), { measurements });
    }
    const lowest = rows.reduce((a, b) => (b.ratio / b.required < a.ratio / a.required ? b : a));
    return pass(`The lowest is ${formatRatio(lowest.ratio)} in ${lowest.state} (needs ${lowest.required}:1). ${list}`, { measurements });
  },
};

/** The edge, fill, or icon that tells a person where a control is. */
const BOUNDARY_CONTRAST = {
  name: "boundary-contrast",
  criteria: ["1.4.11"],
  async run(ctx) {
    await parkPointer(ctx);
    const b = await ctx.page.evaluate(() => window.__a11yMeasure.boundary());
    if (!b) return na("There's no trigger to measure.");
    if (b.undetermined || !b.outside) return undetermined(`The control's edge can't be measured because ${b.undetermined ?? "its surroundings couldn't be read"}.`);
    const fill = b.parts.find((p) => p.kind === "fill")?.color ?? b.outside;
    const marks = [
      ...b.parts.map((p) => ({ label: p.kind, ratio: contrastRatio(p.color, b.outside) })),
      ...b.graphics.map((g) => ({ label: `icon ${g.kind}`, ratio: contrastRatio(g.color, fill) })),
    ];
    if (marks.length === 0) return undetermined("No border, fill, or icon was found to measure.");
    const best = marks.reduce((a, c) => (c.ratio > a.ratio ? c : a));
    const measurements = marks.map((m) => ({ part: m.label, ratio: floor2(m.ratio) }));
    const text = `The strongest mark is its ${best.label}, at ${formatRatio(best.ratio)} (needs 3:1).`;
    if (b.inputLike) return best.ratio >= 3 ? pass(`${text} A field's edge identifies it.`, { measurements }) : fail(`${text} A field has no label inside it, so its edge is what identifies it.`, { measurements });
    if (b.hasText) {
      return best.ratio >= 3
        ? pass(text, { measurements })
        : { ...na(`${text} The control has visible text that identifies it, so ${criterionRef("1.4.11")} doesn't require its edge to reach 3:1. A person should confirm the text is enough.`), measurements };
    }
    return best.ratio >= 3 ? pass(`${text} The control has no text, so its icon or edge identifies it.`, { measurements }) : fail(`${text} The control has no text, so its icon or edge has to identify it.`, { measurements });
  },
};

/** Does the focus indicator stand out from what's around it? */
const FOCUS_CONTRAST = {
  name: "focus-indicator-contrast",
  criteria: ["1.4.11", "2.4.13"],
  async run(ctx) {
    await parkPointer(ctx);
    const rest = await ctx.page.evaluate(() => window.__a11yMeasure.focusStyles(true));
    if (!rest) return na("There's no trigger to measure.");
    const clip = ctx.clipAround(rest.box, 12);
    const shotRest = await ctx.page.screenshot({ clip });
    if ((await ctx.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so its focus indicator wasn't measured.");
    await ctx.settle(SETTLE_MS);
    const now = await ctx.page.evaluate(() => window.__a11yMeasure.focusStyles(false));

    // First choice: an outline, ring, or border on the control itself. Its colors and thickness are exact.
    if (now && !now.undetermined && now.outside && now.inside) {
      const found = [];
      if (now.outline && !same(now.outline, rest.outline)) {
        const against = now.outline.offset >= 0 ? now.outside : now.inside;
        found.push({ label: "outline", ratio: contrastOver(now.outline.color, against), width: now.outline.width });
      }
      for (const shadow of now.shadows) {
        if (shadow.inset || shadow.blur > 0 || !shadow.color || shadow.color[3] === 0 || (shadow.spread <= 0 && shadow.x === 0 && shadow.y === 0)) continue;
        if (rest.shadows.some((r) => same(r, shadow))) continue;
        found.push({ label: "box-shadow ring", ratio: contrastOver(shadow.color, now.outside), width: Math.max(shadow.spread, Math.abs(shadow.x), Math.abs(shadow.y)) });
      }
      if (now.border && !same(now.border, rest.border)) found.push({ label: "border", ratio: contrastOver(now.border.color, now.outside), width: now.border.width });
      if (found.length) {
        const best = found.reduce((a, c) => (c.ratio > a.ratio ? c : a));
        const thin = best.width < 2 ? ` It's ${best.width}px thick, and ${criterionRef("2.4.13")} asks for at least 2px.` : "";
        const detail = `The ${best.label} has ${formatRatio(best.ratio)} against what's next to it (needs 3:1).${thin}`;
        const measurements = found.map((f) => ({ indicator: f.label, ratio: floor2(f.ratio), widthPx: f.width }));
        return best.ratio >= 3 ? pass(detail, { method: "computed-style", measurements }) : fail(detail, { method: "computed-style", measurements });
      }
    }

    // Otherwise the indicator is something styles can't summarize (a ripple, a background change, a blurred glow), so compare pixels.
    const shotNow = await ctx.page.screenshot({ clip });
    const url = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
    const px = await ctx.page.evaluate(([a, b]) => window.__a11yMeasure.compareShots(a, b), [url(shotRest), url(shotNow)]);
    if (px.changed === 0) return na("Nothing visible changed on focus, so there's no indicator to measure. The interactions tier reports that as a failure.");
    const perimeter = 2 * (rest.box.width + rest.box.height);
    const measurements = [{ changedPixels: px.changed, pixelsAtLeast3to1: px.strong, strongestChange: floor2(px.max), perimeterPixels: Math.round(perimeter) }];
    const detail = `${px.strong} of ${px.changed} changed pixels reach 3:1 against their unfocused color, and the strongest change is ${formatRatio(px.max)}. A ring around this control needs about ${Math.round(perimeter)}.`;
    return px.strong >= perimeter ? pass(detail, { method: "pixels", measurements }) : fail(detail, { method: "pixels", measurements });
  },
};

export const COMPUTED_CHECKS = [TEXT_CONTRAST, BOUNDARY_CONTRAST, FOCUS_CONTRAST];
