/**
 * What differs between JSX frameworks when a fixture is generated: how it holds state, how it starts the marking code
 * and wraps the result, and how a prop is spelled. The recipes in jsx-recipes.js are shared and ask the dialect for these.
 */
import { markingSource } from "./marking.js";

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const indentBy = (text, spaces) => text.split("\n").map((line) => (line ? " ".repeat(spaces) + line : line)).join("\n");

/** @typedef {{ id: string, extension: string, openProps: string[][], labelFor: string, click: (action: string) => string, fragment: (inner: string) => string, when: (condition: string, markup: string) => string, declare: (name: string, init: string) => string, read: (name: string) => string, write: (name: string, value: string) => string, attr: (name: string, expr: string) => string, frame: (archetype: string, pkg: string, body: string, hooks?: string) => string }} Dialect */

/** @type {Dialect} */
export const reactDialect = {
  id: "react",
  extension: "jsx",
  openProps: [["open", "onClose"], ["open", "onOpenChange"], ["isOpen", "onOpenChange"], ["isOpen", "onClose"], ["opened", "onClose"]],
  labelFor: "htmlFor",
  click: (action) => `onClick={() => ${action}}`,
  fragment: (inner) => `<>\n${indentBy(inner, 2)}\n</>`,
  when: (condition, markup) => `{${condition} && ${markup}}`,
  declare: (name, init) => `const [${name}, set${cap(name)}] = useState(${init});`,
  read: (name) => name,
  write: (name, value) => `set${cap(name)}(${value})`,
  attr: (name, expr) => `${name}={${expr}}`,
  frame(archetype, pkg, body, hooks = "") {
    return `import * as Lib from ${JSON.stringify(pkg)};
import { useEffect, useState } from "react";
${markingSource(archetype)}
export default function Fixture() {
  useEffect(() => startMarking(), []);
${hooks ? `${indentBy(hooks, 2)}\n` : ""}  return (
${indentBy(body, 4)}
  );
}
`;
  },
};

/** @type {Dialect} */
export const vueDialect = {
  id: "vue",
  extension: "jsx",
  // Vue components usually take a model value and say they changed it with an update event, or take `open` and emit `update:open`.
  openProps: [["open", "onUpdate:open"], ["modelValue", "onUpdate:modelValue"], ["visible", "onUpdate:visible"], ["show", "onUpdate:show"], ["open", "onClose"], ["isOpen", "onClose"]],
  labelFor: "for",
  click: (action) => `onClick={() => ${action}}`,
  fragment: (inner) => `<>\n${indentBy(inner, 2)}\n</>`,
  when: (condition, markup) => `{${condition} && ${markup}}`,
  declare: (name, init) => `const ${name} = ref(${init});`,
  read: (name) => `${name}.value`,
  write: (name, value) => `(${name}.value = ${value})`,
  // A name with a colon (onUpdate:open) can't be written as a JSX attribute name, so it goes in through a spread.
  attr: (name, expr) => (/^[\w-]+$/.test(name) ? `${name}={${expr}}` : `{...{ ${JSON.stringify(name)}: ${expr} }}`),
  frame(archetype, pkg, body, hooks = "") {
    return `import * as Lib from ${JSON.stringify(pkg)};
import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
${markingSource(archetype)}
export default defineComponent({
  setup() {
    let stop = null;
    onMounted(() => { stop = startMarking(); });
    onBeforeUnmount(() => { if (stop) stop(); });
${hooks ? `${indentBy(hooks, 4)}\n` : ""}    return () => (
${indentBy(body, 6)}
    );
  },
});
`;
  },
};

/** @type {Dialect} */
export const svelteDialect = {
  id: "svelte",
  extension: "svelte",
  // A Svelte component takes `open` and calls back when it changes, or takes `open` and calls `onclose`.
  openProps: [["open", "onOpenChange"], ["open", "onclose"], ["visible", "onclose"], ["isOpen", "onclose"], ["opened", "onclose"]],
  labelFor: "for",
  click: (action) => `onclick={() => ${action}}`,
  // Svelte 5 markup can have several top-level nodes, so a fragment is just its children.
  fragment: (inner) => inner,
  when: (condition, markup) => `{#if ${condition}}${markup}{/if}`,
  declare: (name, init) => `let ${name} = $state(${init});`,
  read: (name) => name,
  write: (name, value) => `${name} = ${value}`,
  attr: (name, expr) => `${name}={${expr}}`,
  frame(archetype, pkg, body, hooks = "") {
    return `<script>
  import * as Lib from ${JSON.stringify(pkg)};
  import { onMount } from "svelte";
${indentBy(markingSource(archetype), 2)}
  onMount(() => startMarking());
${hooks ? `${hooks}\n` : ""}</script>

${body}
`;
  },
};
