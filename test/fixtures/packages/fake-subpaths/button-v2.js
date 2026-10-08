// A second version of the button that can't be reached with the keyboard: a div with a role and no tabindex.
import { createElement as h } from "react";
export function Button(props) {
  return h("div", { role: "button", "data-entry": "button-v2", style: { minWidth: 44, minHeight: 44, display: "inline-block" }, ...props });
}
