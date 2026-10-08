// A React library built like a set of namespaced compound components: Dialog.Root, Dialog.Trigger, and so on.
// Each part passes unknown props down to the element it renders.
import { createContext, createElement as h, useContext, useId, useState } from "react";

const Ctx = createContext(null);
const use = () => useContext(Ctx);

// ---- Dialog ----
function DialogRoot({ children }) {
  const [open, setOpen] = useState(false);
  return h(Ctx.Provider, { value: { open, setOpen } }, children);
}
const Dialog = {
  Root: DialogRoot,
  Trigger: (props) => { const { open, setOpen } = use(); return h("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => setOpen(true), ...props }); },
  Portal: ({ children }) => children,
  Overlay: () => h("div", { "aria-hidden": "true" }),
  Content: ({ children, ...rest }) => { const { open } = use(); return open ? h("div", { role: "dialog", "aria-modal": "true", ...rest }, children) : null; },
  Title: (props) => h("h2", props),
  Description: (props) => h("p", props),
  Close: (props) => { const { setOpen } = use(); return h("button", { type: "button", onClick: () => setOpen(false), ...props }); },
};

// ---- Menu ----
const Menu = {
  Root: DialogRoot,
  Trigger: (props) => { const { open, setOpen } = use(); return h("button", { type: "button", "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen(!open), ...props }); },
  Content: ({ children, ...rest }) => { const { open } = use(); return open ? h("div", { role: "menu", ...rest }, children) : null; },
  Item: (props) => h("div", { role: "menuitem", tabIndex: -1, ...props }),
};

// ---- Tooltip: opens on focus ----
const Tooltip = {
  Provider: ({ children }) => children,
  Root: DialogRoot,
  Trigger: (props) => { const { setOpen } = use(); return h("button", { type: "button", onFocus: () => setOpen(true), onBlur: () => setOpen(false), ...props }); },
  Content: ({ children, ...rest }) => { const { open } = use(); return open ? h("div", { role: "tooltip", ...rest }, children) : null; },
};

// ---- Tabs: matched by value ----
const TabsCtx = createContext(null);
const Tabs = {
  Root: ({ defaultValue, children }) => { const [value, setValue] = useState(defaultValue); return h(TabsCtx.Provider, { value: { value, setValue } }, children); },
  List: (props) => h("div", { role: "tablist", ...props }),
  Trigger: ({ value, ...rest }) => { const t = useContext(TabsCtx); return h("button", { type: "button", role: "tab", "aria-selected": t.value === value, tabIndex: t.value === value ? 0 : -1, onClick: () => t.setValue(value), ...rest }); },
  Content: ({ value, ...rest }) => { const t = useContext(TabsCtx); return t.value === value ? h("div", { role: "tabpanel", ...rest }) : null; },
};

// ---- Accordion: needs type="single" and collapsible, like some real ones ----
const AccCtx = createContext(null);
const ItemCtx = createContext(null);
const Accordion = {
  Root: ({ type, collapsible, children }) => {
    if (type !== "single") throw new Error('Accordion.Root needs type="single".');
    const [value, setValue] = useState(null);
    return h(AccCtx.Provider, { value: { value, setValue, collapsible } }, children);
  },
  Item: ({ value, children }) => h(ItemCtx.Provider, { value }, children),
  Header: (props) => h("h3", props),
  Trigger: (props) => {
    const a = useContext(AccCtx);
    const item = useContext(ItemCtx);
    const open = a.value === item;
    return h("button", { type: "button", "aria-expanded": open, "aria-controls": `panel-${item}`, onClick: () => a.setValue(open ? null : item), ...props });
  },
  Content: (props) => {
    const a = useContext(AccCtx);
    const item = useContext(ItemCtx);
    return h("div", { id: `panel-${item}`, role: "region", hidden: a.value !== item, ...props });
  },
};

export { Accordion, Dialog, Menu, Tabs, Tooltip };
