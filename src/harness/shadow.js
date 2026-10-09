/**
 * Runs before any page script. It notes every closed shadow root, because axe and IBM can't see inside one
 * and would report nothing, which reads as clean.
 */
export function recordClosedShadowRoots() {
  const original = Element.prototype.attachShadow;
  const hosts = [];
  Object.defineProperty(window, "__a11yClosedShadowHosts", { value: hosts, configurable: true });
  Element.prototype.attachShadow = function attachShadow(init) {
    if (init && init.mode === "closed") hosts.push(this.localName);
    return original.call(this, init);
  };
}

/**
 * The closed shadow roots the page created, as host tag names with counts, for example `{ "x-thing": 2 }`.
 * @param {import("playwright-core").Page} page
 * @returns {Promise<Record<string, number>>}
 */
export async function closedShadowHosts(page) {
  const hosts = await page.evaluate(() => window.__a11yClosedShadowHosts ?? []).catch(() => []);
  /** @type {Record<string, number>} */
  const counts = {};
  for (const host of hosts) counts[host] = (counts[host] ?? 0) + 1;
  return counts;
}

/** A readable not-testable entry for each host tag. */
export function notTestableEntries(counts) {
  return Object.entries(counts).map(([tag, n]) => `closed shadow root in <${tag}> (${n}): its content isn't visible to the rule engines`);
}

/** Runs before any page script. Notes every custom element the page or a package defines. */
export function recordCustomElements() {
  const original = customElements.define.bind(customElements);
  const tags = [];
  Object.defineProperty(window, "__a11yDefined", { value: tags, configurable: true });
  customElements.define = (name, constructor, options) => {
    tags.push(name);
    return original(name, constructor, options);
  };
}
