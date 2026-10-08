# Writing fixtures

A fixture renders one archetype (a dialog, a set of tabs, a menu) in its starting state, so the tool can test it. You write one when the tool can't build the component from a template. The tool only fills in `button` and `link`.

Write fixtures from the library's public documentation. Don't copy from memory when you aren't sure of the API. If the documentation doesn't cover the API you need, or you can't read it, don't guess. Leave the archetype without a fixture, so the report lists it as a gap, and tell the user what you couldn't find. Don't stand in a plain element for the library's component. That would test the plain element, and the result would say nothing about the library.

## Where fixtures go

`fixtures/<target id>/<archetype>.jsx` for React and Vue 3, in the working folder: the folder where you run `automatica11y audit` or `automatica11y compare`. Use `.js` for web components. The target id is the label (`radix=npm:@radix-ui/react-dialog` has the id `radix`), or the package name with `/` turned into `-`, such as `radix-ui-react-dialog`. The report's **Targets** list shows each id.

To keep a fixture somewhere else, name it in a mapping file and pass `--mapping`:

```json
{
  "radix": {
    "dialog": { "fixture": "my-fixtures/radix-dialog.jsx" },
    "button": { "export": "Button" }
  }
}
```

The keys are target ids, then archetypes. `export` (React) or `tag` (web components) changes which export or element a template uses.

## Start from a generated fixture

You often don't need to write a fixture from nothing. For dialog, menu, tooltip, tabs, accordion, combobox, form-field, and live-region, the tool tries to build one from the package's exports and keeps it only if it works. The source is written to `<out>/generated/<target id>/<archetype>.jsx` (`.js` for web components). To make one an authored fixture, copy it to `fixtures/<target id>/` and edit it. It will carry a block of marking code at the top (`startMarking`). That code marks the trigger and root by role, because a generated fixture can't know how the library forwards props. In an authored fixture you can drop it and put `data-a11y-trigger` and `data-a11y-root` on the right elements yourself, which is clearer and doesn't depend on timing.

If the tool couldn't build a working fixture, the report's **Archetypes** table says what it tried and why each attempt failed. That's a good place to start reading.

## The contract

1. The file's default export renders the archetype in its **initial state**.
2. Mark **exactly one** element with `data-a11y-trigger`. This is what a person would focus and activate: the button that opens a dialog, the first tab, the combobox input, the form control. If nothing in the archetype can be activated, as with a chart, put `data-a11y-trigger` and `data-a11y-root` on the same element: the outermost one the library renders.
3. Mark the **primary surface** with `data-a11y-root`. Put it on the element that carries the role (`role="dialog"`, `role="menu"`, `role="tooltip"`), not on an overlay or a portal wrapper. It's fine if the root doesn't exist until the trigger fires, and fine if it renders in a portal. The tool looks in the whole document.
4. Mount without console errors. The tool treats errors as a broken fixture.
5. A stylesheet the fixture imports is bundled and linked. If the library needs one (a token file, a theme) and its documentation says to load it, import it. If that stylesheet is in another package, list the package under `install` in the mapping (see below). Without the stylesheet the library renders unstyled, and the results describe that, not the library.
6. Include every part the library's documentation marks as required (for example, a dialog's title and description), so the component doesn't log warnings.

The attributes have to reach the DOM. Pass `data-a11y-trigger` to the component that renders the real element. If a component drops unknown props, use the library's documented way to render your own element in its place (for example, `asChild` in Radix, or the `as` prop in Headless UI), and put the attribute on that native element. If the library has no such way, leave the archetype as a gap. Don't wrap the library's component in an element you add and mark that element, because the fixture would then test your element and not the library.

## Examples

A React example and a web component example are in `SKILL.md`, in the section on npm packages. They follow the contract above.

For React, JSX works without importing React. Import the library from its package name. The tool installs it for you.

For Vue 3, a fixture is also JSX, and the default export is a component: a function that returns JSX is a functional component, or you can export a component object. The tool turns JSX into `h()` calls and supplies `h` and `Fragment` itself, so don't import them. Importing `h` fails the bundle with "symbol already declared". JSX children become the default slot. Vue's reactivity works, so `import { ref } from "vue"` for state, and wrap the JSX in `defineComponent({ setup() { ... return () => (<jsx/>) } })`. A library that needs a plugin, a theme, or global components can export a function named `setup(app)`, which runs before the app mounts, for example `export function setup(app) { app.use(plugin) }`. Named slots and `v-model` aren't JSX syntax. Pass a slots object as the children, or set `modelValue` and `onUpdate:modelValue` with a spread, for example `{...{ "onUpdate:open": (next) => (open.value = next) }}`.

For web components, make `mount(container)` the file's default export. It adds the archetype to the container. The tool imports the package first, so its elements are defined before `mount` runs. The `data-a11y-trigger` and `data-a11y-root` attributes can sit on a host element, a slotted child, or an element inside an **open** shadow root. A **closed** shadow root hides its content from every tool, so the report lists it as not testable.

## Library accessibility options

Some libraries ship accessibility features you have to switch on (a chart library's accessibility module, for example). Declare it at the archetype level in the mapping file, next to `fixture` or `export`, for example `{ "charts": { "chart": { "libA11y": true } } }`. The first key is the target id, and the second is the archetype. The fixture then receives a `libA11y` value, `true` or `false`. In React it's a prop. In web components it's a second argument, `mount(container, { libA11y })`. The tool runs the fixture both ways with `--lib-a11y on,off` and labels each result.

```jsx
export default function Fixture({ libA11y }) {
  return <Chart data-a11y-trigger data-a11y-root accessibility={libA11y} />;
}
```

## Companion packages

Some libraries need another package beside them, such as a design token stylesheet or a theme. Name it under `install` in the mapping file, next to `fixture`. The first key is the target id, and the second is the archetype. The tool installs it into the same folder as the library, with install scripts off, and the fixture can import it:

```json
{
  "lib": {
    "live-region": { "fixture": "fixtures/lib/live-region.js", "install": ["@scope/tokens"] }
  }
}
```

```js
import "@scope/tokens/style.css";
```

List only what the library's documentation asks you to load. Each entry has to be a package name with an optional version. Flags, paths, and URLs are refused.

## States

For a dialog, menu, tooltip, or combobox, the tool tests the closed state, then activates the trigger and tests the open state. For an accordion it tests collapsed, then expanded. The tool activates the trigger by clicking it. For a tooltip it focuses the trigger instead, so a tooltip has to open on focus. If it opens only on pointer hover, the open state never appears. Make sure activating the trigger really opens the surface, and that the element with `data-a11y-root` is then attached to the document, isn't `display: none` or `hidden`, and isn't `visibility: hidden`. The tool also counts the surface as open if the trigger has `aria-expanded="true"`. If neither holds, the open state is reported as failed, with the reason. The interaction checks also press keys and hover, but they don't change how the open state is reached.

## Live regions

The `live-region` archetype covers any message that appears, changes, or goes away without moving focus: alerts, status messages, toasts, snackbars, and other `role="alert"`, `role="status"`, `role="log"`, or `aria-live` content. A library's alert component is a fixture for this archetype. The archetype isn't named after any one component.

- `data-a11y-trigger` goes on the control that makes the message appear or change, such as a "Save" button. It can't be the message itself. A message that's on the page from the start has nothing to announce, so the tool reports a gap and asks for a trigger.
- `data-a11y-root` goes on the message: the element that carries the role, or the element whose text changes. It may already be in the page and empty, or the trigger may insert it.
- If the message has a dismiss control, put it inside the root. The tool presses Enter on it and checks that the message goes away and that focus lands somewhere sensible.
- The tool checks that the message sits in a live region, that the region was in the page before the message arrived (except for `role="alert"`, which is announced on insertion), that the politeness fits the role, and that focus stays on the trigger.
- The states are "before message" and "message shown". The tool activates the trigger by clicking it, then waits for the message to have text.

## Check your fixture

Run the audit and look at the report's **Archetypes** table. `ran` means it worked. A `gap` row says what went wrong, such as "didn't render an element with data-a11y-trigger" or "didn't bundle." Fix the file and run again.
