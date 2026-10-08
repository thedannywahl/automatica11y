// Custom elements that say how they work through observed attributes, members, and slots.
class GenModal extends HTMLElement {
  static observedAttributes = ["open"];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<dialog aria-label="Details"><slot name="title"></slot><slot></slot></dialog>';
  }
  attributeChangedCallback() {
    const dialog = this.shadowRoot.querySelector("dialog");
    if (this.hasAttribute("open")) dialog.setAttribute("open", "");
    else dialog.removeAttribute("open");
  }
}
customElements.define("gen-modal", GenModal);

class GenTooltip extends HTMLElement {
  static observedAttributes = ["tip"];
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = '<slot></slot><div role="tooltip" hidden></div>';
    this.addEventListener("focusin", () => { root.querySelector("[role=tooltip]").textContent = this.getAttribute("tip"); root.querySelector("[role=tooltip]").hidden = false; });
    this.addEventListener("focusout", () => { root.querySelector("[role=tooltip]").hidden = true; });
  }
}
customElements.define("gen-tooltip", GenTooltip);

class GenAlert extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<div role="status"><slot></slot></div>';
  }
}
customElements.define("gen-alert", GenAlert);

class GenTextfield extends HTMLElement {
  static observedAttributes = ["label", "value"];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<label><span class="l"></span> <input type="text" style="min-height:44px"></label>';
  }
  attributeChangedCallback(name, _old, value) {
    if (name === "label") this.shadowRoot.querySelector(".l").textContent = value;
  }
}
customElements.define("gen-textfield", GenTextfield);
