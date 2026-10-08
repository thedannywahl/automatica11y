// A React library whose dialog never sets a role, so a generated fixture can't find a root to test.
import { createContext, createElement as h, useContext, useState } from "react";

const Ctx = createContext(null);
export const Dialog = {
  Root: ({ children }) => { const [open, setOpen] = useState(false); return h(Ctx.Provider, { value: { open, setOpen } }, children); },
  Trigger: (props) => { const { setOpen } = useContext(Ctx); return h("button", { type: "button", onClick: () => setOpen(true), ...props }); },
  Content: ({ children }) => { const { open } = useContext(Ctx); return open ? h("div", null, children) : null; },
};
export function Button(props) {
  return h("button", { type: "button", ...props });
}
