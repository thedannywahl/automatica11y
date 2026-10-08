/**
 * The code a generated fixture carries to mark its trigger and root.
 *
 * The harness needs exactly one element with `data-a11y-trigger` and, once the component is showing, one with
 * `data-a11y-root` on the element that carries the role. A generated fixture can't know how a library forwards props,
 * so it doesn't rely on that. It passes the trigger attribute where it can, and this code then marks whatever is missing,
 * by role, every 50 milliseconds, reaching into open shadow roots. The probe that follows checks the result.
 */

/** What to look for, per archetype. `root` is a selector, or "trigger", "parent", or "controls". */
export const MARKING = {
  dialog: { root: "dialog, [role=dialog], [role=alertdialog]", trigger: "[aria-haspopup], [aria-expanded], button, [role=button]" },
  menu: { root: "[role=menu]", trigger: "[aria-haspopup], [aria-expanded], button, [role=button]" },
  tooltip: { root: "[role=tooltip]", trigger: "button, [role=button], a[href], input" },
  tabs: { root: "trigger", trigger: "[role=tab]" },
  accordion: { root: "controls", trigger: "[aria-expanded], summary, button" },
  combobox: { root: "[role=listbox]", trigger: "input[role=combobox], [role=combobox], input" },
  "form-field": { root: "parent", trigger: "input:not([type=hidden]), textarea, select, [role=textbox], [role=combobox], [role=checkbox], [role=switch]" },
  "live-region": { root: "[role=alert], [role=status], [role=log], [aria-live=polite], [aria-live=assertive]", trigger: "button, [role=button]" },
};

/** The roles each archetype's root may carry, so the probe can tell a right mark from a wrong one. */
export const ROOT_ROLES = {
  dialog: ["dialog", "alertdialog"],
  menu: ["menu", "menubar"],
  tooltip: ["tooltip"],
  tabs: ["tab"],
  combobox: ["listbox", "combobox", "grid", "tree"],
  "live-region": ["alert", "status", "log"],
};

/** The source that goes at the top of a generated fixture. It defines `startMarking()`, which returns a function that stops it. */
export function markingSource(archetype) {
  const config = MARKING[archetype];
  return `function a11yDeepAll(selector, root) {
  const scope = root || document;
  const found = [...scope.querySelectorAll(selector)];
  for (const el of scope.querySelectorAll("*")) if (el.shadowRoot) found.push(...a11yDeepAll(selector, el.shadowRoot));
  return found;
}
function a11yMark() {
  const config = ${JSON.stringify(config)};
  if (a11yDeepAll("[data-a11y-trigger]").length === 0) {
    const fallback = a11yDeepAll(config.trigger).find((el) => el.getClientRects().length > 0);
    if (fallback) fallback.setAttribute("data-a11y-trigger", "");
  }
  const trigger = a11yDeepAll("[data-a11y-trigger]")[0];
  if (a11yDeepAll("[data-a11y-root]").length > 0) return;
  let root = null;
  if (config.root === "trigger") root = trigger;
  else if (config.root === "parent") root = trigger && trigger.parentElement;
  else if (config.root === "controls") {
    const id = trigger && trigger.getAttribute("aria-controls");
    root = (id && document.getElementById(id)) || a11yDeepAll("[role=region]")[0];
  } else root = a11yDeepAll(config.root)[0];
  if (root) root.setAttribute("data-a11y-root", "");
}
function startMarking() {
  a11yMark();
  const timer = setInterval(a11yMark, 50);
  return () => clearInterval(timer);
}
`;
}
