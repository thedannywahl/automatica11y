# Spike: can the tool bundle and run a real Svelte 5 library?

Date: October 9, 2026. Throwaway code in the scratchpad, not in the repository. This note keeps what it showed.

## The question.

Svelte libraries ship **source**: `.svelte` files (and `.svelte.js` modules that use runes) that a consumer's bundler compiles. The tool has esbuild and nothing that reads `.svelte`. Can a small esbuild plugin run a real library?

## What I ran.

A scratch folder with `svelte` 5.57.2 and `bits-ui` 2.19.5 (a headless library with namespaced parts, `Dialog.Root`, `Dialog.Trigger`, and so on). A 40-line esbuild plugin that compiles `.svelte` with `compile()` and `.svelte.js` with `compileModule()` from the installed `svelte/compiler`, and builds with the `svelte` and `browser` conditions. A fixture written as a `.svelte` file, mounted with `mount(App, { target })`. Loaded in Chrome through the tool's own browser launcher and static server.

```svelte
<script>
  import { Dialog } from "bits-ui";
  let open = $state(false);
</script>
<Dialog.Root bind:open>
  <Dialog.Trigger data-a11y-trigger>Open dialog</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Content data-a11y-root>
      <Dialog.Title>Edit profile</Dialog.Title>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

## What it showed.

1. **A compiler plugin is enough.** The build took 1.2 seconds and produced a 311 KB bundle. No SvelteKit, no Vite, no Svelte-specific esbuild package.
2. **Real bits-ui ran.** The trigger rendered with `aria-haspopup="dialog"` and `aria-expanded="false"`. Clicking it opened a surface with `role="dialog"` and `aria-modal="true"`, holding the title and the close button.
3. **The compiler comes from the target's own install.** `import("svelte/compiler")` resolved from the scratch folder's `node_modules`, so the compiler and the runtime are always the same version, and the tool needs no Svelte dependency of its own at run time. Like React, Vue, and Angular, Svelte would be a dev dependency for tests only.
4. **Namespaced parts work like React's.** `import { Dialog } from "bits-ui"` gives an object with the parts as properties, which is the shape the React discovery and generation code already reads.
5. **Dotted component names are valid Svelte 5 markup**, so a generated fixture can write `<Lib.Dialog.Root>` the way a React one writes `<Lib.Dialog.Root>`. That makes the shared JSX recipes reusable with a Svelte dialect.

## What it didn't show.

Libraries other than bits-ui (Melt UI, Skeleton, Flowbite Svelte, and others), libraries that import SvelteKit modules (`$app/...`), Svelte 4 libraries, component CSS from `<style>` blocks (compiled with `css: "injected"` here), TypeScript in `<script lang="ts">`, and snippet props.

## To repeat it.

Install `svelte` and `bits-ui` into an empty folder, write the plugin and the fixture above, and build with esbuild using `conditions: ["svelte", "browser"]`.
