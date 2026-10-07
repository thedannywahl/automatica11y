// Two custom elements for tests. fake-button wraps a native button. fake-dialog is built from slots.
class FakeButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<button type="button" style="min-width:44px;min-height:44px"><slot></slot></button>';
  }
}
customElements.define("fake-button", FakeButton);

class FakeDialog extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = '<slot name="trigger"></slot><div role="dialog" aria-label="Details" hidden><slot name="content"></slot></div>';
    this.addEventListener("click", (event) => {
      if (event.target.closest('[slot="trigger"]')) root.querySelector("[role=dialog]").hidden = false;
    });
  }
}
customElements.define("fake-dialog", FakeDialog);
