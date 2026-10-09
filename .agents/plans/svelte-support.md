# Plan: Svelte support.

Status: proposed, October 9, 2026. **Svelte 5 and newer.** Based on [the Svelte spike](../notes/spike-svelte.md), which showed a real Svelte 5 library (bits-ui) bundling with the tool's existing esbuild step plus a 40-line compiler plugin, and running in the browser.

**Support floor: Svelte 5.** Svelte 5 changed how components are written and compiled (runes, snippets, `mount`). A library whose peer range excludes 5 is reported as unsupported with its range, the way Vue 2 and Angular before 22 are. Today every Svelte package says "unsupported framework."

**Scope: every archetype**, as with Angular and plain HTML. Archetypes are the standard building blocks of HTML and ARIA patterns. They aren't a list of components.

## 1. What a fixture is, for Svelte.

A fixture is a `.svelte` file whose component renders one archetype using the library under test. It marks the control a keyboard user presses with `data-a11y-trigger` and the surface that appears with `data-a11y-root`. The five tiers run against it.

A fixture comes from the first of these that applies:

1. **Authored.** `fixtures/<id>/<archetype>.svelte`, written from the library's documentation. Works for every archetype on day one.
2. **Template.** Button and link, built from the export name: `<Button data-a11y-trigger>Save</Button>`.
3. **Generated.** The shared recipes (compound parts, controlled `open` props, single components), run with a Svelte dialect, and kept only if the probe confirms them.

## 2. How the tool handles it.

| Member | Svelte |
|---|---|
| detect | A `svelte` peer or dependency. A range that allows 5 is supported. `^3 \|\| ^4` is unsupported, with its range. |
| install | npm adds the peer. When the library brings none, the latest `svelte` is added, and every installed top-level package is pinned (the lesson from Angular). |
| bundle | An esbuild plugin that compiles `.svelte` and `.svelte.js` with the compiler from the target's own `svelte` install, the `svelte` and `browser` conditions, one copy of `svelte` for the library and the fixture, and `css: "injected"` so component styles travel with the bundle. |
| entry | `mount(Fixture, { target: root })`. |
| discover | The same page-load listing React uses: each export's type and, for objects, their parts. A Svelte 5 component is a function with no metadata, so discovery has names and parts only. |
| template | Button and link. |
| generate | The shared recipes and a `svelteDialect`: state with `$state`, props spelled `name={expr}`, marking started in `onMount`. |

## 3. Phases.

1. **Foundations.** Detection and the unsupported message, install, the compiler plugin, the entry, discovery, button and link templates, and authored fixtures for every archetype. Fake Svelte libraries for tests, plus a real bits-ui test. Docs and the runner skill.
2. **Generated fixtures.** The dialect, the eight generatable archetypes, and real runs on bits-ui, Melt UI, Skeleton, and Flowbite Svelte, with their gaps recorded.
3. **Polish.** Plain sentences for common Svelte errors (a missing context, a component used outside its parent), SvelteKit-only imports reported as unsupported with the import named, and the weekly latest-dependencies job.

## 4. Decisions.

- **Compiler from the target's install, not ours.** The compiler and the runtime then always match. Nothing ships; Svelte is a dev dependency for tests only.
- **shadcn-svelte is out of scope as a package.** It copies component source into a project, so there's nothing to install. A local folder of those components can be tested as a path target, which is a separate feature.
- **Compiler warnings** (Svelte's own accessibility warnings, unused CSS) are not results. They would describe the library's source, not the rendered page, and the tiers measure the page.

## 5. Risks.

| Risk | What reduces it |
|---|---|
| A library imports SvelteKit modules (`$app/environment`, `$app/stores`). | Detect the unresolved import and report it with its name as the reason. |
| A new Svelte release changes compiler options. | The weekly latest-dependencies job, and the plugin passes only options that have been stable across 5.x. |
| Libraries mix Svelte 4 syntax and runes. | The Svelte 5 compiler handles both. A mixed library compiles per file. |
| Snippet props (`{#snippet}`) are how some libraries take content. | The recipes use `children` content first, and a snippet candidate is added for libraries whose parts say they want one. |

## 6. Still open.

1. Which Svelte libraries matter most to you, as proof the adapter is generic. I'd start with bits-ui, Melt UI, Skeleton, and Flowbite Svelte.

## 7. Phase 1 and 2 notes (October 9, 2026).

Built: `src/frameworks/svelte.js`, a `svelteDialect` for the shared recipes (with `click`, `fragment`, and `when` helpers added to every dialect), and `Button.Root`-style templates for React and Svelte.

**Speed.** Two caches took a full bits-ui audit from more than 290 seconds (it hit a timeout) to 86 seconds, and a bundle of the whole library from 3.7 seconds to 0.9 seconds cold and 80 milliseconds warm. The compiler's output is kept per file for the run, because a run bundles the same library once per generated candidate. And the single-copy resolver looks each `svelte/...` path up once per build, because a thousand modules ask for the same few. The Angular resolver had the same shape and got the same fix.

**Real libraries on Svelte 5.57** (no library-specific code):

| Library | Generated or templated | Gap, and why |
|---|---|---|
| bits-ui 2.19.5 | dialog, menu, tabs, accordion; button through `Button.Root` | combobox and tooltip (the probe saw no root; tooltip needs keyboard focus and a provider), form-field (a checkbox namespace isn't a field), live-region (no export matches) |
| Skeleton 5.0.1 | dialog, menu, tabs, accordion, tooltip | combobox, form-field, live-region (toast), button and link (no export named for them) |
| Flowbite Svelte 1.33.1 | button, link, dialog, form-field, live-region | menu, tabs, combobox, accordion (its parts aren't named the way the recipes look), tooltip |
| Melt 0.44.0 | none | Melt gives builders (`new Dialog()`) whose attributes you spread onto your own elements, so no generator can guess the fixture. An authored fixture with the builder worked: the real `melt/builders` dialog ran with closed and open states. |

Left for phase 3: plain sentences for common Svelte errors, SvelteKit-only imports named as the reason, and the weekly latest-dependencies job.
