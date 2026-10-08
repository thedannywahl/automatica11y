// A Vue 3 dialog controlled with the open prop and an update:open event, the usual model for a single component.
import { defineComponent, h } from "vue";

export const Dialog = defineComponent({
  props: { open: Boolean },
  emits: ["update:open"],
  setup(props, { emit, slots }) {
    return () => (props.open ? h("div", { role: "dialog", "aria-modal": "true", "aria-label": "Edit profile" }, [slots.default?.(), h("button", { type: "button", onClick: () => emit("update:open", false) }, "Close")]) : null);
  },
});
