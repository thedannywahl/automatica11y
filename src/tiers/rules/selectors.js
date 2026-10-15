/** Helpers installed in the page; this function must be self-contained. */
export function browserSelectors() {
  /** @typedef {Pick<import("../../types.js").Finding["nodes"][number], "selector" | "selectorPath" | "selectorError">} Location */

  /** @param {Document | ShadowRoot} root @param {string} selector */
  const unique = (root, selector) => {
    const matches = root.querySelectorAll(selector);
    if (matches.length !== 1) throw new Error(`Selector matched ${matches.length} elements: ${selector}`);
    return matches[0];
  };

  /** @param {Element} element @param {Document | ShadowRoot} root */
  const selectorFor = (element, root) => {
    const parts = [];
    let current = element;
    while (current) {
      if (current.id) {
        const id = `#${CSS.escape(current.id)}`;
        if (root.querySelectorAll(id).length === 1) {
          parts.unshift(id);
          break;
        }
      }
      const siblings = [...current.parentNode?.children ?? []].filter((sibling) => sibling.localName === current.localName && sibling.namespaceURI === current.namespaceURI);
      parts.unshift(`${CSS.escape(current.localName)}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    const selector = parts.join(" > ");
    if (unique(root, selector) !== element) throw new Error("Selector did not identify the reported element.");
    return selector;
  };

  /** @param {Node | undefined} node @returns {Location} */
  const forNode = (node) => {
    try {
      if (!node || node.nodeType !== 1 || !node.isConnected) throw new Error("Reported node is not a connected element.");
      let element = /** @type {Element} */ (node);
      let selector = "";
      /** @type {NonNullable<Location["selectorPath"]>} */
      const selectorPath = [];
      while (element) {
        const root = element.getRootNode();
        if (root.nodeType !== 9 && !(root.nodeType === 11 && "host" in root)) throw new Error("Reported root is not queryable.");
        if (root.nodeType === 11 && /** @type {ShadowRoot} */ (root).mode !== "open") throw new Error("Reported shadow root is closed.");
        const currentSelector = selectorFor(element, /** @type {Document | ShadowRoot} */ (root));
        if (!selector) selector = currentSelector;
        else selectorPath[0].selector = currentSelector;
        if (root.nodeType === 11) {
          selectorPath.unshift({ selector: "", enter: "shadow" });
          element = /** @type {ShadowRoot} */ (root).host;
        } else if (root !== document) {
          const frame = /** @type {Document} */ (root).defaultView?.frameElement;
          if (!frame) throw new Error("Frame document is not accessible from the audited document.");
          selectorPath.unshift({ selector: "", enter: "frame" });
          element = frame;
        } else break;
      }
      return { selector, ...(selectorPath.length ? { selectorPath } : {}) };
    } catch (error) {
      return { selector: "", selectorError: error instanceof Error ? error.message : String(error) };
    }
  };

  /** @param {Location} location @returns {Element} */
  const resolve = (location) => {
    if (location.selectorError) throw new Error(location.selectorError);
    /** @type {Document | ShadowRoot} */
    let root = document;
    for (const step of location.selectorPath ?? []) {
      const host = unique(root, step.selector);
      const next = step.enter === "shadow" ? host.shadowRoot : (host.localName === "iframe" || host.localName === "frame") ? /** @type {HTMLIFrameElement} */ (host).contentDocument : null;
      if (!next) throw new Error(`${step.enter === "shadow" ? "Shadow root" : "Frame document"} is unavailable: ${step.selector}`);
      root = next;
    }
    return unique(root, location.selector);
  };

  return { forNode, resolve };
}

/** @param {import("../../types.js").Page} page */
export async function installSelectors(page) {
  await page.evaluate(`window.__a11ySelectors = (${browserSelectors.toString()})();`);
}