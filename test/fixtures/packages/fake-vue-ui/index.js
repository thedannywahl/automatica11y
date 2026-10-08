// A small Vue 3 library for tests. Button and Link fall their attributes through to the element they render.
// The dialog is a flat family of parts (DialogRoot, DialogTrigger, and so on) with no export named Dialog.
import { defineComponent, h, inject, provide, ref } from "vue";

const OPEN = Symbol("open");

export const Button = defineComponent({ setup: (_, { slots }) => () => h("button", { type: "button" }, slots.default?.()) });
export const Link = defineComponent({ setup: (_, { slots }) => () => h("a", null, slots.default?.()) });

export const DialogRoot = defineComponent({
  setup(_, { slots }) {
    provide(OPEN, ref(false));
    return () => slots.default?.();
  },
});
export const DialogTrigger = defineComponent({
  setup(_, { slots }) {
    const open = inject(OPEN);
    return () => h("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": String(open.value), onClick: () => (open.value = true) }, slots.default?.());
  },
});
export const DialogPortal = defineComponent({ setup: (_, { slots }) => () => slots.default?.() });
export const DialogOverlay = defineComponent({ setup: () => () => h("div", { "aria-hidden": "true" }) });
export const DialogContent = defineComponent({
  setup(_, { slots }) {
    const open = inject(OPEN);
    return () => (open.value ? h("div", { role: "dialog", "aria-modal": "true" }, slots.default?.()) : null);
  },
});
export const DialogTitle = defineComponent({ setup: (_, { slots }) => () => h("h2", null, slots.default?.()) });
export const DialogDescription = defineComponent({ setup: (_, { slots }) => () => h("p", null, slots.default?.()) });
export const DialogClose = defineComponent({
  setup(_, { slots }) {
    const open = inject(OPEN);
    return () => h("button", { type: "button", onClick: () => (open.value = false) }, slots.default?.());
  },
});

// A message that renders as an alert when it is mounted.
export const Alert = defineComponent({ setup: (_, { slots }) => () => h("div", { role: "alert" }, slots.default?.()) });
