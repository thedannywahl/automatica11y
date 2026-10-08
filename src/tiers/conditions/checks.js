/**
 * The conditions checks. Each opens the page under a setting a person might use (reduced motion, dark mode, forced colors),
 * or in an environment (a 320 pixel window, wider text spacing), and says whether the page holds up.
 * A check returns pass, fail, undetermined, or not-applicable, with a detail and the numbers behind it.
 * These are automatica11y's own measurements. They're reported on their own and never added to axe-core or IBM counts.
 */
import { contrastOver, formatRatio, ringIsEnough, textThreshold } from "../computed/color.js";
import { criterionRef } from "../../wcag/index.js";

const pass = (detail, extra = {}) => ({ result: "pass", detail, ...extra });
const fail = (detail, extra = {}) => ({ result: "fail", detail, ...extra });
const na = (detail) => ({ result: "not-applicable", detail });
const undetermined = (detail, extra = {}) => ({ result: "undetermined", detail, ...extra });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const floor2 = (n) => Math.floor(n * 100) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (items, max = 3) => `${items.slice(0, max).join("; ")}${items.length > max ? `; and ${items.length - max} more` : ""}`;

/** Archetypes whose trigger shouldn't be pressed to reach their resting state: a link would navigate, and a chart has nothing to press. */
const NO_ACTIVATION = new Set(["link", "chart"]);

/** Does this page have a trigger hook (a fixture), or is it a whole page? */
const hasTrigger = async (ctx) => (await ctx.trigger.count()) > 0;

/** Press Enter on the trigger of a fixture, so a dialog, menu, or message is showing. Whole pages are left as they are. */
async function reachState(ctx, archetype) {
  if (!(await hasTrigger(ctx)) || NO_ACTIVATION.has(archetype)) return false;
  await ctx.focus();
  await ctx.press("Enter");
  await ctx.settle(300);
  return true;
}

// ---- reduced motion ----

/** Every animation seen at load and just after the trigger is pressed. Each is recorded once. */
async function collectAnimations(ctx, archetype) {
  const seen = new Map();
  const take = async () => {
    for (const a of await ctx.page.evaluate(() => window.__a11yConditions.animations())) seen.set(`${a.kind}|${a.name}|${a.target}|${a.props.join()}|${a.duration}|${a.iterations}`, a);
  };
  await ctx.settle(100);
  await take();
  await sleep(150);
  await take();
  if ((await hasTrigger(ctx)) && !NO_ACTIVATION.has(archetype)) {
    await ctx.focus();
    await ctx.page.keyboard.press("Enter");
    for (const wait of [0, 40, 80, 160, 240]) {
      await take();
      await sleep(wait);
    }
  }
  return [...seen.values()];
}

/** An animation worth reducing: anything that repeats forever, or moves for longer than a blink. */
const concerning = (a) => a.iterations === "infinite" || (a.moving && (a.duration ?? 0) > 100);
const describeAnimation = (a) => `${a.name || a.kind} on ${a.target} (${a.moving ? `moves ${a.props.filter((p) => /^(transform|translate|rotate|scale|top|left|right|bottom|inset|margin|height|width|offset|background|clip|max|min)/.test(p)).join(", ")}` : a.props.join(", ") || "no keyframes"}; ${a.duration ?? "?"}ms${a.iterations === "infinite" ? ", repeats forever" : ""})`;

const reducedMotion = (archetype) => ({
  name: "reduced-motion-respected",
  criteria: ["2.3.3", "2.2.2"],
  async run(ctx) {
    const normal = await collectAnimations(ctx, archetype);
    const reduced = await collectAnimations(await ctx.variant({ reducedMotion: true }), archetype);
    const measurements = [{ setting: "no preference", animations: normal.length, moveOrRepeat: normal.filter(concerning).length }, { setting: "reduce", animations: reduced.length, moveOrRepeat: reduced.filter(concerning).length }];
    if (normal.length === 0 && reduced.length === 0) return na("No animations or transitions were running at load or after the trigger was pressed, so there's nothing to reduce. Motion driven by JavaScript timers isn't visible to this check.");
    const still = reduced.filter(concerning);
    if (still.length) {
      const before = normal.filter(concerning).length;
      return fail(`With prefers-reduced-motion: reduce, ${plural(still.length, "animation")} still ${still.length === 1 ? "moves or repeats" : "move or repeat"}: ${list(still.map(describeAnimation))}. Without the preference, ${before} did.`, { measurements });
    }
    const had = normal.filter(concerning);
    return had.length
      ? pass(`${plural(had.length, "animation")} that move or repeat (${list(had.map(describeAnimation), 2)}) don't run when motion is reduced.`, { measurements })
      : pass(`The page animates (${plural(normal.length, "animation")}), but nothing moves or repeats, so there's no motion to reduce. Motion driven by JavaScript timers isn't visible to this check.`, { measurements });
  },
});

// ---- color scheme ----

const colorScheme = () => ({
  name: "dark-mode-contrast",
  criteria: ["1.4.3"],
  async run(ctx) {
    await ctx.settle(300);
    // Animations are frozen in both shots, so a spinner or a fade can't make a page look as if it changed.
    const light = await ctx.page.screenshot({ animations: "disabled" });
    const dark = await ctx.variant({ colorScheme: "dark" });
    await dark.settle(300);
    const shot = await dark.page.screenshot({ animations: "disabled" });
    if (light.equals(shot)) return na("The page looks the same under prefers-color-scheme: dark, so it doesn't adapt to it. A page isn't required to. Nothing was checked.");
    const parts = (await dark.page.evaluate(() => window.__a11yMeasure.text("all"))) ?? [];
    if (parts.length === 0) return undetermined("The page changes under prefers-color-scheme: dark, but no visible text was found to measure.");
    const rows = [];
    const unknown = [];
    for (const part of parts) {
      if (part.undetermined || !part.backdrop) unknown.push(`"${part.text}" can't be measured because ${part.undetermined ?? "its background couldn't be read"}.`);
      else rows.push({ text: part.text, ratio: contrastOver(part.color, part.backdrop), required: textThreshold(part.size, part.weight) });
    }
    const failed = rows.filter((r) => r.ratio < r.required).sort((a, b) => a.ratio / a.required - b.ratio / b.required);
    const measurements = [{ measured: rows.length, undetermined: unknown.length, below: failed.length, lowestRatio: rows.length ? floor2(Math.min(...rows.map((r) => r.ratio))) : null }];
    if (failed.length) return fail(`In dark mode, ${plural(failed.length, "piece")} of text fall${failed.length === 1 ? "s" : ""} below the contrast it needs. The worst is "${failed[0].text}" at ${formatRatio(failed[0].ratio)} (needs ${failed[0].required}:1).`, { measurements });
    if (unknown.length) return undetermined(`${rows.length ? `All ${plural(rows.length, "measured piece")} of text pass in dark mode. ` : ""}${plural(unknown.length, "other piece")} can't be reduced to one color. ${unknown[0]}`, { measurements });
    return pass(`The page adapts to dark mode, and all ${plural(rows.length, "piece")} of text measured pass. The lowest is ${formatRatio(Math.min(...rows.map((r) => r.ratio)))}.`, { measurements });
  },
});

// ---- forced colors ----

const forcedColors = (archetype) => ({
  name: "forced-colors-focus-visible",
  criteria: ["1.4.11", "2.4.7"],
  async run(ctx) {
    const forced = await ctx.variant({ forcedColors: true });
    await forced.settle(300);
    let focused;
    if (await hasTrigger(forced)) {
      if ((await forced.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so its focus indicator wasn't checked.");
    } else {
      await forced.page.keyboard.press("Tab");
      await forced.settle(100);
    }
    focused = await forced.page.evaluate(() => window.__a11yMeasure.focusStyles(false));
    if (!focused || (focused.box.width === 0 && focused.box.height === 0) || (await forced.page.evaluate(() => document.activeElement === document.body))) return na("Nothing on the page takes keyboard focus, so there's no focus indicator to check.");
    await forced.settle(400);
    const clip = forced.clipAround(focused.box, 12);
    const shotFocused = await forced.page.screenshot({ clip, animations: "disabled" });
    await forced.page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur?.());
    await forced.page.mouse.move(0, 0);
    await forced.settle(300);
    const shotBlurred = await forced.page.screenshot({ clip, animations: "disabled" });
    const url = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
    const px = await forced.page.evaluate(([a, b]) => window.__a11yMeasure.compareShots(a, b), [url(shotBlurred), url(shotFocused)]);
    const optOuts = await forced.page.evaluate(() => window.__a11yConditions.forcedColorOptOuts());
    const note = optOuts.length ? ` ${plural(optOuts.length, "element")} opt${optOuts.length === 1 ? "s" : ""} out of forced colors with forced-color-adjust: none (${list(optOuts, 3)}), so a person should check them.` : "";
    const perimeter = 2 * (focused.box.width + focused.box.height);
    const measurements = [{ changedPixels: px.changed, pixelsAtLeast3to1: px.strong, perimeterPixels: Math.round(perimeter), forcedColorOptOuts: optOuts.length }];
    if (px.changed === 0) return fail(`With forced colors on, nothing visible changed when the control took focus. A focus ring drawn with box-shadow or a background color disappears in forced colors. Use an outline.${note}`, { measurements, method: "pixels" });
    return ringIsEnough(px.strong, perimeter)
      ? pass(`With forced colors on, the focus indicator is visible: ${px.strong} of ${px.changed} changed pixels reach 3:1 against their unfocused color.${note}`, { measurements, method: "pixels" })
      : fail(`With forced colors on, the focus indicator is weak: only ${px.strong} of ${px.changed} changed pixels reach 3:1 against their unfocused color, and enough to count is about half the control's perimeter, ${Math.round(perimeter / 2)}.${note}`, { measurements, method: "pixels" });
  },
});

// ---- reflow ----

const reflow = (archetype) => ({
  name: "reflow-at-320px",
  criteria: ["1.4.10"],
  async run(ctx) {
    const narrow = await ctx.variant({ viewport: { width: 320, height: 256 } });
    await narrow.settle(300);
    await reachState(narrow, archetype);
    const o = await narrow.page.evaluate(() => window.__a11yConditions.overflow("[data-a11y-root]"));
    const measurements = [{ viewportWidth: o.viewportWidth, scrollWidth: o.scrollWidth, overflowingElements: o.offenderCount }];
    const problems = [];
    if (o.scrollWidth > o.viewportWidth + 1) problems.push(`the page scrolls sideways (it is ${o.scrollWidth}px wide in a ${o.viewportWidth}px window)`);
    if (o.offenders.length) problems.push(`${plural(o.offenderCount, "element")} reach${o.offenderCount === 1 ? "es" : ""} past the right edge: ${list(o.offenders.map((e) => `${e.element} ends at ${e.right}px`))}`);
    if (o.root && (o.root.right > o.viewportWidth + 1 || o.root.left < -1)) problems.push(`${o.root.element} spans ${o.root.left}px to ${o.root.right}px`);
    if (problems.length) return fail(`In a 320px window, ${problems.join(", and ")}. ${criterionRef("1.4.10")} exempts two-dimensional content such as data tables and maps, so a person should judge whether that applies.`, { measurements });
    return pass(`In a 320px window, nothing reaches past the right edge and the page doesn't scroll sideways${o.root ? `. The ${o.root.element} fits (${o.root.left}px to ${o.root.right}px)` : ""}.`, { measurements });
  },
});

// ---- text spacing ----

const textSpacing = (archetype) => ({
  name: "text-spacing-no-clipping",
  criteria: ["1.4.12"],
  async run(ctx) {
    await ctx.settle(200);
    await reachState(ctx, archetype);
    const before = await ctx.page.evaluate(() => window.__a11yConditions.clipping());
    await ctx.page.evaluate(() => window.__a11yConditions.applySpacing());
    await ctx.settle(200);
    const after = await ctx.page.evaluate(() => window.__a11yConditions.clipping());
    if (before.length !== after.length) return undetermined("The page's elements changed while the spacing was applied, so the before and after can't be compared.");
    const clipped = (e) => (e.hidesX && e.overX > 1) || (e.hidesY && e.overY > 1);
    const cut = [];
    after.forEach((now, index) => {
      const was = before[index];
      if (clipped(now) && now.text && !now.visuallyHidden && (!clipped(was) || now.overX - was.overX > 1 || now.overY - was.overY > 1)) cut.push(`${now.element} ("${now.text}")`);
    });
    const measurements = [{ elementsChecked: after.length, clipped: cut.length }];
    const settings = "line height 1.5, letter spacing 0.12em, word spacing 0.16em, and paragraph spacing 2em";
    return cut.length
      ? fail(`With ${settings}, text in ${plural(cut.length, "element")} gets cut off: ${list(cut)}. Overlapping text isn't checked.`, { measurements })
      : pass(`With ${settings}, no element cut off its text (${after.length} elements checked). Overlapping text isn't checked.`, { measurements });
  },
});

/** The conditions checks for an archetype. Whole pages use the name "page". */
export function conditionChecksFor(archetype) {
  return [reducedMotion(archetype), colorScheme(), forcedColors(archetype), reflow(archetype), textSpacing(archetype)];
}
