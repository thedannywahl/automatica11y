// A flat family of dialog parts. The sub-path is named dialog, so the package says what it is.
import { createContext, createElement as h, useContext, useState } from "react";
const Ctx = createContext(null);
export function DialogRoot({ children }) {
  const [open, setOpen] = useState(false);
  return h(Ctx.Provider, { value: { open, setOpen } }, children);
}
export function DialogTrigger(props) {
  const { open, setOpen } = useContext(Ctx);
  return h("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => setOpen(true), ...props });
}
export function DialogContent({ children, ...rest }) {
  const { open } = useContext(Ctx);
  return open ? h("div", { role: "dialog", "aria-modal": "true", ...rest }, children) : null;
}
export function DialogTitle(props) {
  return h("h2", props);
}
export function DialogClose(props) {
  const { setOpen } = useContext(Ctx);
  return h("button", { type: "button", onClick: () => setOpen(false), ...props });
}
