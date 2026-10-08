import { createElement as h } from "react";
export function Link(props) {
  return h("a", { "data-entry": "es-extra", ...props });
}
