// A library whose Button drops unknown props, so a template can't mark its trigger.
import { createElement as h } from "react";

export function Button({ children }) {
  return h("button", { type: "button" }, children);
}
