// The package root. A test checks that asking for a sub-path tests that entry and not this one.
import { createElement as h } from "react";
export function Button(props) {
  return h("button", { type: "button", "data-entry": "root", ...props });
}
