// A custom element with a closed shadow root. The rule engines can't see inside it.
class ClosedButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "closed" }).innerHTML = "<button></button><img src=x.png>";
  }
}
customElements.define("closed-button", ClosedButton);
