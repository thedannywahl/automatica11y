// Button, Link, and the Dialog parts pass props through. Tabs is data-driven and drops unknown props.
import { createContext, createElement as h, useContext, useRef, useState } from "react";

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

/**
 * @param {{ label: string, items: Array<{ label: string, content: unknown }>, defaultIndex?: number, listProps?: object, tabProps?: (index: number) => object }} props
 */
export function Tabs({ label, items, defaultIndex = 0, listProps = {}, tabProps = () => ({}) }) {
  const [selected, setSelected] = useState(defaultIndex);
  const refs = useRef([]);
  const move = (index) => {
    const next = (index + items.length) % items.length;
    setSelected(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event) => {
    const keys = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: items.length - 1 };
    if (event.key in keys) {
      event.preventDefault();
      move(keys[event.key]);
    }
  };
  return h(
    "div",
    { className: "widgets-tabs" },
    h(
      "div",
      { role: "tablist", "aria-label": label, onKeyDown, ...listProps },
      items.map((item, index) =>
        h(
          "button",
          {
            key: item.label,
            type: "button",
            role: "tab",
            id: `widgets-tab-${index}`,
            "aria-selected": index === selected,
            "aria-controls": `widgets-panel-${index}`,
            tabIndex: index === selected ? 0 : -1,
            ref: (el) => {
              refs.current[index] = el;
            },
            onClick: () => setSelected(index),
            ...tabProps(index),
          },
          item.label,
        ),
      ),
    ),
    items.map((item, index) =>
      h("div", { key: item.label, role: "tabpanel", id: `widgets-panel-${index}`, "aria-labelledby": `widgets-tab-${index}`, hidden: index !== selected }, item.content),
    ),
  );
}
