import { createElement as h } from "react";
export function Button(props) {
  return h("button", { type: "button", "data-entry": "button", style: { minWidth: 44, minHeight: 44 }, ...props });
}
