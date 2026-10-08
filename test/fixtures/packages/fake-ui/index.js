// A small React library for tests. Button and Link pass props through. The dialog is built from parts.
import { createContext, createElement as h, useContext, useState } from "react";

const DialogContext = createContext({ open: false, setOpen() {} });

export function Button(props) {
  return h("button", { type: "button", ...props });
}
export function Link(props) {
  return h("a", props);
}
export function Dialog({ children }) {
  const [open, setOpen] = useState(false);
  return h(DialogContext.Provider, { value: { open, setOpen } }, children);
}
export function DialogTrigger(props) {
  const { open, setOpen } = useContext(DialogContext);
  return h("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => setOpen(true), ...props });
}
export function DialogContent({ children, ...rest }) {
  const { open } = useContext(DialogContext);
  return open ? h("div", { role: "dialog", "aria-modal": "true", ...rest }, children) : null;
}
export function DialogTitle(props) {
  return h("h2", props);
}
export function DialogClose(props) {
  const { setOpen } = useContext(DialogContext);
  return h("button", { type: "button", onClick: () => setOpen(false), ...props });
}
