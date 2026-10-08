/**
 * Runs inside the page before any page script. It sets `window.__a11y`, a small kit the interaction checks use.
 * It reaches through open shadow roots, because fixtures often put the trigger or the options there.
 * This function is serialized and sent to the browser, so it can't use anything from outside itself.
 */
export function installHelpers() {
  let uidCounter = 0;
  const uids = new WeakMap();
  const uid = (el) => {
    if (!el) return null;
    if (!uids.has(el)) uids.set(el, (uidCounter += 1));
    return uids.get(el);
  };

  /** All matches in the document and in every open shadow root. */
  const queryAllDeep = (selector, root = /** @type {Document | ShadowRoot} */ (document)) => {
    const found = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) found.push(...queryAllDeep(selector, el.shadowRoot));
    return found;
  };
  const queryDeep = (selector) => queryAllDeep(selector)[0] ?? null;

  const deepActive = () => {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  /** True when `node` is `root` or sits inside it, across shadow boundaries. */
  const within = (root, node) => {
    while (node) {
      if (node === root) return true;
      node = node.assignedSlot || node.parentNode || node.host;
    }
    return false;
  };
  const visible = (el) => {
    if (!el || el.getClientRects().length === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const byId = (el, id) => (el.getRootNode().getElementById ? el.getRootNode().getElementById(id) : document.getElementById(id));
  const text = (el) => (el?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

  /** The element ARIA says is active: the focused element, or the descendant it points to. */
  const activeTarget = () => {
    const active = deepActive();
    if (!active) return null;
    const pointed = active.getAttribute?.("aria-activedescendant");
    return (pointed && byId(active, pointed)) || active;
  };

  window.__a11yClicks = 0;
  document.addEventListener("click", () => (window.__a11yClicks += 1), true);

  window.__a11y = {
    uid,
    queryDeep,
    queryAllDeep,
    deepActive,
    within,
    visible,
    /** What the page looks like to a check, right now. */
    snapshot() {
      const trigger = queryDeep("[data-a11y-trigger]");
      const root = queryDeep("[data-a11y-root]");
      const active = deepActive();
      const target = activeTarget();
      return {
        clicks: window.__a11yClicks,
        triggerTag: trigger?.localName ?? null,
        triggerRole: trigger?.getAttribute("role") ?? null,
        expanded: trigger?.getAttribute("aria-expanded") ?? null,
        rootExists: Boolean(root),
        rootVisible: visible(root),
        rootModal: root?.getAttribute("aria-modal") === "true" || root?.getAttribute("role") === "alertdialog",
        activeIsTrigger: Boolean(trigger && active && within(trigger, active)),
        activeInRoot: Boolean(root && active && within(root, active)),
        activeUid: uid(target),
        activeTag: active?.localName ?? null,
        activeText: text(target),
        activeRole: target?.getAttribute?.("role") ?? null,
        bodyActive: !active || active === document.body,
      };
    },
    /** Items for a role selector, with which one is active and which are selected. */
    items(selector) {
      const target = activeTarget();
      return queryAllDeep(selector).map((el) => ({
        uid: uid(el),
        text: text(el),
        active: Boolean(target && (el === target || within(el, target))),
        selected: el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true",
        hasSelected: el.hasAttribute("aria-selected"),
        visible: visible(el),
      }));
    },
    /** The name a control gets from its label, in the order browsers use. */
    nameSources() {
      const control = queryDeep("[data-a11y-trigger]");
      if (!control) return null;
      const sources = [];
      if (control.labels && control.labels.length) sources.push("label element");
      const labelledby = control.getAttribute("aria-labelledby");
      if (labelledby && labelledby.split(/\s+/).some((id) => text(byId(control, id)))) sources.push("aria-labelledby");
      if ((control.getAttribute("aria-label") ?? "").trim()) sources.push("aria-label");
      if ((control.getAttribute("title") ?? "").trim()) sources.push("title");
      return sources;
    },
    /** Error text tied to the control, if any. */
    errorInfo() {
      const control = queryDeep("[data-a11y-trigger]");
      if (!control) return null;
      const ids = [control.getAttribute("aria-errormessage"), ...(control.getAttribute("aria-describedby") ?? "").split(/\s+/)].filter(Boolean);
      const linked = ids.map((id) => text(byId(control, id))).filter(Boolean);
      const root = queryDeep("[data-a11y-root]") ?? document.body;
      const live = [...root.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [role="status"]')].map(text).filter(Boolean);
      return { invalid: control.getAttribute("aria-invalid") === "true" || control.matches(":invalid"), ariaInvalid: control.getAttribute("aria-invalid") === "true", linked, live };
    },
    /** Computed style properties that can show a focus indicator. */
    focusStyle() {
      const el = deepActive();
      if (!el) return null;
      const s = getComputedStyle(el);
      const pick = ["outlineStyle", "outlineWidth", "outlineColor", "outlineOffset", "boxShadow", "borderTopColor", "borderTopWidth", "backgroundColor", "color", "textDecorationLine"];
      const style = Object.fromEntries(pick.map((key) => [key, s[key]]));
      const box = el.getBoundingClientRect();
      return { style, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    },
    /** Remember the focused element, so its style can be read after it loses focus. */
    remember() {
      window.__a11yLast = deepActive();
    },
    lastStyle() {
      const el = window.__a11yLast;
      if (!el) return null;
      const s = getComputedStyle(el);
      const pick = ["outlineStyle", "outlineWidth", "outlineColor", "outlineOffset", "boxShadow", "borderTopColor", "borderTopWidth", "backgroundColor", "color", "textDecorationLine"];
      return Object.fromEntries(pick.map((key) => [key, s[key]]));
    },
    inputValue() {
      const el = queryDeep("[data-a11y-trigger]");
      return el ? (el.value ?? el.textContent ?? "").toString().trim() : null;
    },
  };
}
