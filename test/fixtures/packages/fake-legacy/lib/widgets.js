// A package with no exports map: any file in it can be imported.
import { createElement as h } from "react";
export function Button(props) {
  return h("button", { type: "button", "data-entry": "legacy-widgets", ...props });
}
