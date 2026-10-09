/**
 * The interaction checks, one table per archetype. A check is a name, the WCAG criteria it speaks to,
 * and a function that gets a context (`ctx`) and returns pass, fail, or not-applicable with a detail.
 * The runner in index.js owns everything else: fresh page for each check, timeouts, and errors.
 * Checks only use the two hooks (`data-a11y-trigger`, `data-a11y-root`) and ARIA roles.
 */

import { focusIndicatorChanges } from "./focus-indicator.js";

const pass = (detail, extra = {}) => ({ result: "pass", detail, ...extra });
const fail = (detail, extra = {}) => ({ result: "fail", detail, ...extra });
const na = (detail) => ({ result: "not-applicable", detail });

const where = (s) => (s.bodyActive ? "nothing (the page body)" : `${s.activeTag}${s.activeText ? ` "${s.activeText}"` : ""}`);
const quote = (list) => list.map((item) => `"${item}"`).join(", ");

// ---- Shared by every archetype ----

const COMMON = [
  {
    name: "trigger-reachable-by-tab",
    criteria: ["2.1.1"],
    async run(ctx) {
      const presses = await ctx.tabToTrigger();
      return presses === null ? fail("Pressing Tab 12 times never put focus on the trigger.") : pass(`Tab reached the trigger after ${presses} ${presses === 1 ? "press" : "presses"}.`);
    },
  },
  {
    name: "focus-indicator-visible",
    criteria: ["2.4.7"],
    async run(ctx) {
      if ((await ctx.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so its focus indicator wasn't checked.");
      const focused = await ctx.page.evaluate(() => window.__a11y.focusSnapshot());
      await ctx.page.evaluate(() => window.__a11y.remember());
      const clip = ctx.clipAround(focused.box);
      const shotFocused = await ctx.page.screenshot({ clip });
      await ctx.page.evaluate(() => {
        const last = window.__a11yLast;
        if (last && "blur" in last && typeof last.blur === "function") last.blur();
      });
      await ctx.settle();
      const unfocused = await ctx.page.evaluate(() => window.__a11y.lastSnapshot());
      const changed = focusIndicatorChanges(focused.parts, unfocused?.parts);
      if (changed.length) return pass(`Computed style changed on focus: ${changed.join("; ")}.`, { method: "computed-style" });
      const shotBlurred = await ctx.page.screenshot({ clip });
      if (!shotFocused.equals(shotBlurred)) return pass("The pixels around the trigger changed on focus, though no style property did.", { method: "screenshot" });
      return fail("Nothing visible changed when the trigger got keyboard focus. Checked computed styles first, then a screenshot comparison.", { method: "screenshot" });
    },
  },
  {
    name: "no-focus-trap",
    criteria: ["2.1.2"],
    async run(ctx) {
      if ((await ctx.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so focus-trap behavior wasn't checked.");
      for (let press = 1; press <= 12; press += 1) {
        await ctx.press("Tab");
        const s = await ctx.snap();
        if (!s.activeIsTrigger) return pass(`Focus moved on after ${press} more Tab ${press === 1 ? "press" : "presses"}.`);
      }
      return fail("Focus stayed on the trigger through 12 more Tab presses.");
    },
  },
];

// ---- button and link ----

const activates = (key, label) => async (ctx) => {
  const s0 = await ctx.snap();
  if (key === "Space" && (s0.triggerTag === "a" || s0.triggerRole === "link")) return na("Links activate with Enter only.");
  await ctx.focus();
  await ctx.press(key);
  const s1 = await ctx.snap();
  return s1.clicks > s0.clicks ? pass(`${label} activated the trigger.`) : fail(`${label} did not activate the trigger.`);
};

// ---- dialog and menu ----

/** Open with the keyboard and wait for the root to show. Returns the snapshot, or null. */
async function openWith(ctx, key = "Enter") {
  await ctx.focus();
  await ctx.press(key);
  return ctx.waitFor((s) => s.rootVisible || s.expanded === "true");
}

async function openMenu(ctx) {
  for (const key of ["Enter", "ArrowDown"]) {
    const s = await openWith(ctx, key);
    if (s) return { s, key };
  }
  return null;
}

// ---- live-region: a message that appears or changes without moving focus ----

/** Press Enter on the trigger and wait for the message. Returns what the page looked like before, and after. */
async function showMessage(ctx) {
  await ctx.focus();
  const before = await ctx.page.evaluate(() => window.__a11y.live());
  await ctx.press("Enter");
  const deadline = Date.now() + 2500;
  let after = await ctx.page.evaluate(() => window.__a11y.live());
  while (Date.now() < deadline && !(after.present && after.visible && (after.text || after.named))) {
    await ctx.settle(80);
    after = await ctx.page.evaluate(() => window.__a11y.live());
  }
  return { before, after, appeared: after.present && after.visible };
}

const NO_MESSAGE = "The message didn't appear when Enter was pressed on the trigger.";

const LIVE_REGION_CHECKS = [
  {
    name: "message-in-live-region",
    criteria: ["4.1.3"],
    async run(ctx) {
      const { after, appeared } = await showMessage(ctx);
      if (!appeared) return fail(NO_MESSAGE);
      if (!after.region) return fail("The message isn't inside an element with role alert, status, or log, or with an aria-live attribute, so a screen reader isn't told when it appears.");
      if (after.region.politeness === "off") return fail(`The message sits in a region that doesn't announce (${after.region.role ? `role ${after.region.role}` : "aria-live"}${after.region.ariaLive ? `, aria-live="${after.region.ariaLive}"` : ""}), so a screen reader isn't told when it appears.`);
      return pass(`The message is in a live region (${after.region.role ? `role ${after.region.role}, ` : ""}${after.region.politeness}).`);
    },
  },
  {
    name: "message-has-text",
    criteria: ["4.1.3"],
    async run(ctx) {
      const { after, appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Its text wasn't checked.`);
      return after.text || after.named ? pass(`The message says "${after.text || "(named by aria-label)"}".`) : fail("The message has no text and no accessible name, so there's nothing to announce.");
    },
  },
  {
    name: "region-exists-before-message",
    criteria: ["4.1.3"],
    async run(ctx) {
      const { before, after, appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Its region wasn't checked.`);
      if (!after.region || after.region.politeness === "off") return na("The message isn't in a live region, so the region's timing doesn't apply.");
      if (before.regionUids.includes(after.region.uid)) return pass("The live region was already in the page before the message, so assistive technology was watching it.");
      if (after.region.role === "alert") return pass("The live region was added together with its message. role=\"alert\" is announced when it's inserted, so this works.");
      return before.ancestorUids.includes(after.region.uid)
        ? fail("The element was in the page before the message, but it only became a live region when the message arrived. Screen readers often miss that. Put role or aria-live in the page's HTML, and change only what's inside the region.")
        : fail("The live region was added to the page together with its message. Screen readers often miss that. Keep the region in the page and change what's inside it.");
    },
  },
  {
    name: "live-politeness-fits-role",
    criteria: ["4.1.3"],
    async run(ctx) {
      const { after, appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Its politeness wasn't checked.`);
      const r = after.region;
      if (!r) return na("The message isn't in a live region, so there's no politeness to check.");
      if (r.role === "alert" && r.ariaLive && r.ariaLive.toLowerCase() !== "assertive") return fail(`role="alert" is assertive, but aria-live="${r.ariaLive}" on the same element overrides it.`);
      if (r.role === "status" && (r.ariaLive ?? "").toLowerCase() === "off") return fail('role="status" is polite, but aria-live="off" on the same element turns announcing off.');
      return pass(`The region announces ${r.politeness}${r.role ? `, as role ${r.role} implies` : ""}.`);
    },
  },
  {
    name: "focus-stays-on-trigger",
    criteria: ["4.1.3"],
    async run(ctx) {
      const { appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Focus wasn't checked.`);
      await ctx.settle(200);
      const s = await ctx.snap();
      return s.activeIsTrigger ? pass("Focus stayed on the trigger when the message appeared.") : fail(`Focus moved to ${where(s)} when the message appeared. A status message is announced without taking focus.`);
    },
  },
  {
    name: "dismiss-works-by-keyboard",
    criteria: ["2.1.1"],
    async run(ctx) {
      const { appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Its controls weren't checked.`);
      const found = await ctx.page.evaluate(() => window.__a11y.focusDismiss());
      if (!found.found) return na("The message has no control inside it, so there's nothing to dismiss.");
      await ctx.settle();
      await ctx.press("Enter");
      const gone = await ctx.waitFor((s) => !s.rootExists || !s.rootVisible, 1500);
      return gone ? pass(`Enter on the ${found.tag}${found.label ? ` "${found.label}"` : ""} removed the message.`) : fail(`Enter on the ${found.tag}${found.label ? ` "${found.label}"` : ""} didn't remove the message.`);
    },
  },
  {
    name: "focus-kept-after-removal",
    criteria: ["2.4.3"],
    async run(ctx) {
      const { appeared } = await showMessage(ctx);
      if (!appeared) return na(`${NO_MESSAGE} Focus after removal wasn't checked.`);
      const found = await ctx.page.evaluate(() => window.__a11y.focusDismiss());
      if (!found.found) return na("The message has no control inside it, so nothing removes it from the keyboard.");
      await ctx.settle();
      await ctx.press("Enter");
      if (!(await ctx.waitFor((s) => !s.rootExists || !s.rootVisible, 1500))) return na("Enter didn't remove the message, so where focus goes wasn't checked.");
      await ctx.settle(200);
      const s = await ctx.snap();
      return s.bodyActive ? fail("Focus fell back to the page when the message was removed. Move it to the trigger or another control.") : pass(`Focus moved to ${where(s)} when the message was removed.`);
    },
  },
];

// ---- The tables ----

export const ARCHETYPE_CHECKS = {
  "live-region": LIVE_REGION_CHECKS,

  button: [
    { name: "enter-activates", criteria: ["2.1.1"], run: activates("Enter", "Enter") },
    { name: "space-activates", criteria: ["2.1.1"], run: activates("Space", "Space") },
  ],

  link: [
    { name: "enter-activates", criteria: ["2.1.1"], run: activates("Enter", "Enter") },
    { name: "space-activates", criteria: ["2.1.1"], run: activates("Space", "Space") },
  ],

  dialog: [
    {
      name: "focus-moves-into-dialog",
      criteria: ["2.4.3"],
      async run(ctx) {
        if (!(await openWith(ctx))) return fail("The dialog didn't open when Enter was pressed on the trigger.");
        const s = await ctx.waitFor((x) => x.activeInRoot, 800);
        if (s) return pass("Focus moved into the dialog when it opened.");
        return fail(`Focus stayed outside the dialog, on ${where(await ctx.snap())}.`);
      },
    },
    {
      name: "tab-stays-inside-dialog",
      criteria: ["2.4.3", "2.1.2"],
      async run(ctx) {
        if (!(await openWith(ctx))) return na("The dialog didn't open with the keyboard, so Tab behavior wasn't checked.");
        await ctx.waitFor((x) => x.activeInRoot, 600);
        for (let press = 1; press <= 8; press += 1) {
          await ctx.press("Tab");
          const s = await ctx.snap();
          if (!s.activeInRoot) {
            const detail = `Focus left the dialog after ${press} Tab ${press === 1 ? "press" : "presses"}, onto ${where(s)}.`;
            return s.rootModal ? fail(detail) : na(`${detail} The dialog isn't marked aria-modal, so it counts as non-modal and the check doesn't apply.`);
          }
        }
        return pass("Focus stayed inside the dialog through 8 Tab presses.");
      },
    },
    {
      name: "escape-closes",
      criteria: ["2.1.1"],
      async run(ctx) {
        if (!(await openWith(ctx))) return na("The dialog didn't open with the keyboard, so Escape wasn't checked.");
        await ctx.waitFor((x) => x.activeInRoot, 600);
        await ctx.press("Escape");
        const closed = await ctx.waitFor((x) => !x.rootVisible && x.expanded !== "true", 800);
        return closed ? pass("Escape closed the dialog.") : fail("The dialog stayed open after Escape.");
      },
    },
    {
      name: "focus-returns-to-trigger",
      criteria: ["2.4.3"],
      async run(ctx) {
        if (!(await openWith(ctx))) return na("The dialog didn't open with the keyboard, so focus return wasn't checked.");
        await ctx.waitFor((x) => x.activeInRoot, 600);
        await ctx.press("Escape");
        if (!(await ctx.waitFor((x) => !x.rootVisible && x.expanded !== "true", 800))) return na("Escape didn't close the dialog, so focus return wasn't checked.");
        const back = await ctx.waitFor((x) => x.activeIsTrigger, 800);
        return back ? pass("Focus returned to the trigger.") : fail(`Focus went to ${where(await ctx.snap())} instead of the trigger.`);
      },
    },
  ],

  menu: [
    {
      name: "opens-with-enter-or-arrow",
      criteria: ["2.1.1"],
      async run(ctx) {
        const opened = await openMenu(ctx);
        return opened ? pass(`${opened.key} opened the menu.`) : fail("Neither Enter nor ArrowDown opened the menu.");
      },
    },
    {
      name: "arrow-keys-move-between-items",
      criteria: ["2.1.1"],
      async run(ctx) {
        if (!(await openMenu(ctx))) return na("The menu didn't open with the keyboard, so item navigation wasn't checked.");
        await ctx.settle(120);
        const items = (await ctx.items('[role^="menuitem"]')).filter((i) => i.visible);
        if (items.length < 2) return na(`The menu has ${items.length} visible menu ${items.length === 1 ? "item" : "items"}, so there is nothing to move between.`);
        const start = items.find((i) => i.active)?.uid ?? null;
        await ctx.press("ArrowDown");
        const afterDown = (await ctx.items('[role^="menuitem"]')).find((i) => i.active)?.uid ?? null;
        if (afterDown === null || afterDown === start) return fail("ArrowDown didn't move to another menu item.");
        await ctx.press("ArrowUp");
        const afterUp = (await ctx.items('[role^="menuitem"]')).find((i) => i.active)?.uid ?? null;
        return afterUp === start || (start === null && afterUp !== afterDown) ? pass("ArrowDown and ArrowUp moved between menu items.") : fail("ArrowUp didn't move back to the previous menu item.");
      },
    },
    {
      name: "escape-closes-and-returns-focus",
      criteria: ["2.1.1", "2.4.3"],
      async run(ctx) {
        if (!(await openMenu(ctx))) return na("The menu didn't open with the keyboard, so Escape wasn't checked.");
        await ctx.settle(120);
        await ctx.press("Escape");
        if (!(await ctx.waitFor((x) => !x.rootVisible && x.expanded !== "true", 800))) return fail("The menu stayed open after Escape.");
        const back = await ctx.waitFor((x) => x.activeIsTrigger, 800);
        return back ? pass("Escape closed the menu and focus returned to the trigger.") : fail(`Escape closed the menu, but focus went to ${where(await ctx.snap())} instead of the trigger.`);
      },
    },
  ],

  tabs: [
    {
      name: "arrow-keys-move-between-tabs",
      criteria: ["2.1.1"],
      async run(ctx) {
        const tabs = (await ctx.items('[role="tab"]')).filter((t) => t.visible);
        if (tabs.length === 0) return fail("The fixture has no elements with role=tab.");
        if (tabs.length < 2) return na("There is only one tab, so there is nothing to move between.");
        await ctx.focus();
        const vertical = await ctx.page.evaluate(() => window.__a11y.queryDeep('[role="tablist"]')?.getAttribute("aria-orientation") === "vertical");
        const [next, prev] = vertical ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
        const active = async () => (await ctx.items('[role="tab"]')).find((t) => t.active)?.uid ?? null;
        const start = await active();
        await ctx.press(next);
        const afterNext = await active();
        if (afterNext === null || afterNext === start) return fail(`${next} didn't move focus to another tab.`);
        await ctx.press(prev);
        return (await active()) === start ? pass(`${next} and ${prev} moved focus between tabs.`) : fail(`${prev} didn't move focus back to the previous tab.`);
      },
    },
    {
      name: "home-and-end-work",
      criteria: ["2.1.1"],
      async run(ctx) {
        const tabs = (await ctx.items('[role="tab"]')).filter((t) => t.visible);
        if (tabs.length < 2) return na("There are fewer than two tabs, so Home and End wouldn't show anything.");
        await ctx.focus();
        const activeIndex = async () => (await ctx.items('[role="tab"]')).filter((t) => t.visible).findIndex((t) => t.active);
        await ctx.press("End");
        const end = await activeIndex();
        await ctx.press("Home");
        const home = await activeIndex();
        const problems = [];
        if (end !== tabs.length - 1) problems.push("End didn't move to the last tab");
        if (home !== 0) problems.push("Home didn't move to the first tab");
        return problems.length ? fail(`${problems.join(". ")}.`) : pass("Home moved to the first tab and End to the last.");
      },
    },
    {
      name: "selected-state-exposed",
      criteria: ["4.1.2"],
      async run(ctx) {
        const tabs = await ctx.items('[role="tab"]');
        if (tabs.length === 0) return fail("The fixture has no elements with role=tab.");
        const missing = tabs.filter((t) => !t.hasSelected).length;
        const selected = tabs.filter((t) => t.selected).length;
        if (missing) return fail(`${missing} of ${tabs.length} tabs have no aria-selected attribute.`);
        return selected === 1 ? pass("Every tab has aria-selected, and exactly one is true.") : fail(`${selected} tabs are aria-selected="true". A tab list should have exactly one.`);
      },
    },
  ],

  combobox: [
    {
      name: "arrow-down-opens-list",
      criteria: ["2.1.1"],
      async run(ctx) {
        return (await ctx.openCombo()) ? pass("ArrowDown opened the list.") : fail("ArrowDown didn't open the list.");
      },
    },
    {
      name: "arrow-keys-change-active-option",
      criteria: ["2.1.1"],
      async run(ctx) {
        if (!(await ctx.openCombo())) return na("The list didn't open with ArrowDown, so option navigation wasn't checked.");
        const options = (await ctx.items('[role="option"]')).filter((o) => o.visible);
        if (options.length < 2) return na("The list has fewer than two visible options.");
        const active = async () => (await ctx.items('[role="option"]')).find((o) => o.active)?.uid ?? null;
        const start = await active();
        await ctx.press("ArrowDown");
        const afterDown = await active();
        if (afterDown === null || afterDown === start) return fail("ArrowDown didn't change the active option.");
        await ctx.press("ArrowUp");
        return (await active()) === start || (await active()) !== afterDown ? pass("ArrowDown and ArrowUp changed the active option.") : fail("ArrowUp didn't change the active option.");
      },
    },
    {
      name: "enter-selects",
      criteria: ["2.1.1"],
      async run(ctx) {
        if (!(await ctx.openCombo())) return na("The list didn't open with ArrowDown, so selection wasn't checked.");
        const before = await ctx.page.evaluate(() => window.__a11y.inputValue());
        await ctx.press("ArrowDown");
        await ctx.press("Enter");
        const closed = await ctx.waitFor((x) => x.expanded !== "true", 800);
        const after = await ctx.page.evaluate(() => window.__a11y.inputValue());
        const selected = (await ctx.items('[role="option"]')).some((o) => o.selected);
        if (!closed) return fail("The list stayed open after Enter.");
        return after !== before || selected ? pass("Enter chose an option and closed the list.") : fail("Enter closed the list, but nothing was chosen: the value didn't change and no option is selected.");
      },
    },
    {
      name: "escape-closes",
      criteria: ["2.1.1"],
      async run(ctx) {
        if (!(await ctx.openCombo())) return na("The list didn't open with ArrowDown, so Escape wasn't checked.");
        await ctx.press("Escape");
        return (await ctx.waitFor((x) => x.expanded !== "true", 800)) ? pass("Escape closed the list.") : fail("The list stayed open after Escape.");
      },
    },
  ],

  "form-field": [
    {
      name: "label-associated",
      criteria: ["1.3.1", "3.3.2", "4.1.2"],
      async run(ctx) {
        const sources = await ctx.page.evaluate(() => window.__a11y.nameSources());
        if (!sources) return fail("The fixture has no data-a11y-trigger control.");
        return sources.length ? pass(`The control has a name from: ${sources.join(", ")}.`) : fail("The control has no label element, aria-labelledby, aria-label, or title.");
      },
    },
    {
      name: "error-associated-on-invalid",
      criteria: ["3.3.1", "4.1.3"],
      async run(ctx) {
        const facts = await ctx.page.evaluate(() => {
          const c = window.__a11y.queryDeep("[data-a11y-trigger]");
          const validity = c && "checkValidity" in c && typeof c.checkValidity === "function" ? c.checkValidity() : undefined;
          return { tag: c?.localName, type: c?.getAttribute("type") ?? "text", required: c?.hasAttribute("required"), pattern: c?.hasAttribute("pattern"), minlength: c?.hasAttribute("minlength"), valid: validity ?? true };
        });
        const control = ctx.trigger;
        const before = await ctx.page.evaluate(() => window.__a11y.errorInfo());
        try {
          if (facts.required) await control.fill("");
          else if (facts.pattern || facts.minlength || ["email", "url", "tel"].includes(facts.type) || facts.tag === "input") await control.fill("x");
          else return na("The control has no validation to trigger. Add required, a type such as email, or a pattern to the fixture.");
        } catch {
          return na("The control couldn't be filled, so invalid input wasn't tried.");
        }
        await ctx.press("Tab");
        await ctx.settle(200);
        /** Error text that wasn't there before the input went wrong. A hint linked all along doesn't count. */
        const read = async () => {
          const now = await ctx.page.evaluate(() => window.__a11y.errorInfo());
          return { ...now, linked: now.linked.filter((t) => !before.linked.includes(t)), live: now.live.filter((t) => !before.live.includes(t)) };
        };
        let info = await read();
        if (!info.invalid && !info.linked.length && !info.live.length) {
          // Some fields only validate on submit.
          await ctx.trigger.press("Enter").catch(() => {});
          await ctx.settle(200);
          info = await read();
        }
        if (!info.invalid && !info.linked.length && !info.live.length) return na("Invalid input didn't put the field in an invalid state, so there was no error to check.");
        if (info.linked.length || info.live.length) {
          const how = [info.linked.length ? `linked by aria-describedby or aria-errormessage: ${quote(info.linked)}` : null, info.live.length ? `in an alert or live region: ${quote(info.live)}` : null].filter(Boolean).join("; ");
          return pass(`The error is ${how}.${info.ariaInvalid ? "" : " The field doesn't set aria-invalid."}`);
        }
        return fail("The field is invalid, but no error text is tied to it through aria-describedby or aria-errormessage, and no alert or live region shows one. If the field relies on the browser's built-in message, this check can't see it.");
      },
    },
  ],

  accordion: [
    {
      name: "expanded-state-exposed",
      criteria: ["4.1.2"],
      async run(ctx) {
        const s = await ctx.snap();
        return s.expanded === null ? fail("The trigger has no aria-expanded attribute, so the expanded state isn't exposed.") : pass(`The trigger exposes aria-expanded="${s.expanded}".`);
      },
    },
    { name: "enter-toggles", criteria: ["2.1.1", "4.1.2"], run: toggles("Enter") },
    { name: "space-toggles", criteria: ["2.1.1", "4.1.2"], run: toggles("Space") },
  ],

  tooltip: [
    {
      name: "appears-on-focus",
      criteria: ["1.4.13"],
      async run(ctx) {
        if ((await ctx.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so focus behavior wasn't checked.");
        return (await ctx.waitFor((s) => s.rootVisible, 1000)) ? pass("The tooltip appeared when the trigger got keyboard focus.") : fail("The tooltip didn't appear when the trigger got keyboard focus.");
      },
    },
    {
      name: "escape-dismisses",
      criteria: ["1.4.13"],
      async run(ctx) {
        if ((await ctx.tabToTrigger()) === null) return na("The trigger can't be reached with Tab, so Escape wasn't checked.");
        if (!(await ctx.waitFor((s) => s.rootVisible, 1000))) return na("The tooltip didn't appear on focus, so there was nothing to dismiss.");
        await ctx.press("Escape");
        return (await ctx.waitFor((s) => !s.rootVisible, 800)) ? pass("Escape dismissed the tooltip.") : fail("The tooltip stayed visible after Escape.");
      },
    },
    {
      name: "content-reachable-on-hover",
      criteria: ["1.4.13"],
      async run(ctx) {
        await ctx.trigger.hover();
        if (!(await ctx.waitFor((s) => s.rootVisible, 1000))) return na("The tooltip didn't appear on hover, so hoverable content wasn't checked.");
        const root = ctx.page.locator("[data-a11y-root]").first();
        const box = await root.boundingBox();
        if (!box) return na("The tooltip has no box to move onto.");
        await ctx.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await ctx.settle(400);
        return (await ctx.snap()).rootVisible ? pass("The tooltip stayed visible when the pointer moved onto it.") : fail("The tooltip disappeared when the pointer moved from the trigger onto it. Content shown on hover must stay reachable.");
      },
    },
  ],
};

/** An accordion toggle check for one key. The state flips on the first press and flips back on the second. */
function toggles(key) {
  return async (ctx) => {
    const read = async () => {
      const s = await ctx.snap();
      return { expanded: s.expanded, shown: s.rootVisible };
    };
    const before = await read();
    await ctx.focus();
    await ctx.press(key);
    await ctx.settle(150);
    const after = await read();
    const changed = (a, b) => (a.expanded !== null ? a.expanded !== b.expanded : a.shown !== b.shown);
    if (!changed(before, after)) return fail(`${key} didn't toggle the section.`);
    await ctx.press(key);
    await ctx.settle(150);
    const again = await read();
    return changed(after, again) ? pass(`${key} expanded and collapsed the section (aria-expanded ${before.expanded} then ${after.expanded}).`) : fail(`${key} opened the section but didn't close it again.`);
  };
}

export { COMMON };
