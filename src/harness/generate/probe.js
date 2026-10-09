import { installHelpers } from "../../tiers/interactions/helpers.js";
import { openPage } from "../url.js";
import { ROOT_ROLES } from "./marking.js";

/** Archetypes whose root appears after the trigger is activated, as the audit expects. */
const OPENS = new Set(["dialog", "menu", "tooltip", "accordion", "combobox", "live-region"]);

const FOCUSABLE_FIELD = "input:not([type=hidden]), textarea, select, [contenteditable=true], [role=textbox], [role=combobox], [role=checkbox], [role=switch], [role=radio], [role=slider], [role=spinbutton]";

/**
 * Check that a generated fixture does what the audit needs, before the audit trusts it.
 * It loads the page, then checks that exactly one element is marked as the trigger, that nothing logged an error,
 * that activating the trigger shows a root, and that the root carries a role that fits the archetype.
 * A fixture that fails any of these isn't used, and the reason says which.
 * @param {import("playwright-core").Browser} browser
 * @param {string} url
 * @param {string} archetype
 * @returns {Promise<{ ok: boolean, reason: string | null }>}
 */
export async function probeFixture(browser, url, archetype) {
  const errors = [];
  /** @type {Awaited<ReturnType<typeof openPage>> | null} */
  let opened = null;
  try {
    opened = await openPage(browser, url, {
      waitUntil: "load",
      beforeGoto: async (page) => {
        page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
        page.on("console", (message) => {
          if (message.type() === "error" && !/favicon|Failed to load resource/i.test(message.text())) errors.push(message.text().split("\n")[0]);
        });
        await page.addInitScript(installHelpers);
      },
    });
    const page = opened.page;
    try {
      await page.waitForFunction(() => window.__a11y?.queryAllDeep("[data-a11y-trigger]").length > 0, undefined, { timeout: 4000 });
    } catch {
      return { ok: false, reason: errors.length ? `it logged an error and rendered nothing to mark as the trigger: ${errors[0]}` : "no element could be marked as the trigger" };
    }
    await page.waitForTimeout(150);
    const count = await page.evaluate(() => window.__a11y.queryAllDeep("[data-a11y-trigger]").length);
    if (count !== 1) return { ok: false, reason: `${count} elements were marked as the trigger` };
    if (errors.length) return { ok: false, reason: `it logged an error: ${errors[0]}` };

    if (archetype === "form-field") {
      const field = await page.evaluate((selector) => window.__a11y.queryDeep("[data-a11y-trigger]")?.matches(selector) ?? false, FOCUSABLE_FIELD);
      return field ? { ok: true, reason: null } : { ok: false, reason: "the element marked as the trigger isn't a field a person can type in" };
    }
    if (archetype === "tabs") {
      const role = await page.evaluate(() => window.__a11y.queryDeep("[data-a11y-trigger]")?.getAttribute("role") ?? null);
      return role === "tab" ? { ok: true, reason: null } : { ok: false, reason: `the element marked as the trigger has ${role ? `role ${role}` : "no role"}, not tab` };
    }
    if (!OPENS.has(archetype)) return { ok: true, reason: null };

    const trigger = page.locator("[data-a11y-trigger]").first();
    try {
      if (archetype === "tooltip") await trigger.focus();
      else await trigger.click({ timeout: 3000 });
    } catch (error) {
      return { ok: false, reason: `the trigger couldn't be activated: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
    }
    /** Wait for the surface. A tooltip gets a second chance below, so this one is short for it. */
    const waitForSurface = (timeout) => page.waitForFunction(
        ({ live, needsRoot }) => {
          const state = window.__a11y.live();
          if (live) return state.present && state.visible && Boolean(state.text || state.named);
          // The trigger can say it's expanded an instant before the root is marked, so a role-carrying root has to be there itself.
          if (needsRoot) return state.present && state.visible;
          const trigger = window.__a11y.queryDeep("[data-a11y-trigger]");
          return (state.present && state.visible) || trigger?.getAttribute("aria-expanded") === "true";
        },
        { live: archetype === "live-region", needsRoot: Boolean(ROOT_ROLES[archetype]) },
        { timeout },
      );
    try {
      try {
        await waitForSurface(archetype === "tooltip" ? 1500 : 4000);
      } catch (error) {
        if (archetype !== "tooltip") throw error;
        // Some tooltips open only for focus that came from the keyboard, so focus the trigger again the way a person would.
        await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
        await page.keyboard.press("Tab");
        await waitForSurface(3000);
      }
    } catch {
      return { ok: false, reason: `activating the trigger showed no ${archetype === "live-region" ? "message" : "element marked as the root"}${ROOT_ROLES[archetype] ? ` (looked for an element with role ${ROOT_ROLES[archetype].join(", ")})` : ""}, which can also mean the library doesn't set that role` };
    }
    const roles = ROOT_ROLES[archetype];
    if (roles) {
      const fits = await page.evaluate((allowed) => {
        const root = window.__a11y.queryDeep("[data-a11y-root]");
        if (!root) return null;
        const role = root.getAttribute("role");
        return { role, fits: Boolean(role && allowed.includes(role)) || root.localName === "dialog" || root.hasAttribute("aria-live") };
      }, roles);
      if (!fits) return { ok: false, reason: "the root wasn't marked" };
      if (!fits.fits) return { ok: false, reason: `the element marked as the root has ${fits.role ? `role ${fits.role}` : "no role"}, not ${roles.join(" or ")}` };
    }
    if (errors.length) return { ok: false, reason: `it logged an error when the trigger was activated: ${errors[0]}` };
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  } finally {
    await opened?.close();
  }
}
