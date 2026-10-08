// A React library built like a set of flat, controlled components: Dialog takes open and onClose, and its parts share a prefix.
import { createElement as h, useId } from "react";

export function Dialog({ open, onClose, children }) {
  return open ? h("div", { role: "presentation", onKeyDown: (event) => event.key === "Escape" && onClose() }, children) : null;
}
export function DialogPanel({ children, ...rest }) {
  return h("div", { role: "dialog", "aria-modal": "true", ...rest }, children);
}
export function DialogTitle(props) {
  return h("h2", props);
}
export function DialogDescription(props) {
  return h("p", props);
}

// A message that renders as an alert when it's mounted.
export function Alert({ children, ...rest }) {
  return h("div", { role: "alert", ...rest }, children);
}

// A field that forwards its props to a native input.
export function TextInput(props) {
  return h("input", { type: "text", style: { minHeight: 44 }, ...props });
}
