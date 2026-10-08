// Registers its element on import, and says nothing else. The package.json says only CSS has side effects, as some real packages do.
export const VERSION = "1";
if (typeof customElements !== "undefined") {
  customElements.define("quiet-note", class extends HTMLElement {});
}
