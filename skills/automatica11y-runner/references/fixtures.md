# Writing fixtures

A fixture renders one archetype (a dialog, a set of tabs, a menu) in its starting state, so the tool can test it. You write one when the tool can't build the component from a template. The tool only fills in `button` and `link`.

Write fixtures from the library's public documentation. Don't copy from memory when you aren't sure of the API.

## Where fixtures go

`fixtures/<target id>/<archetype>.jsx` for React, in the folder where you run the command. Use `.js` for web components. The target id is the label (`radix=npm:@radix-ui/react-dialog` has the id `radix`), or the package name with `/` turned into `-`, such as `radix-ui-react-dialog`. The report's **Targets** list shows each id.

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

## The contract

1. The file's default export renders the archetype in its **initial state**.
2. Mark **exactly one** element with `data-a11y-trigger`. This is what a person would focus and activate: the button that opens a dialog, the first tab, the combobox input, the form control.
3. Mark the **primary surface** with `data-a11y-root`. Put it on the element that carries the role (`role="dialog"`, `role="menu"`, `role="tooltip"`), not on an overlay or a portal wrapper. It's fine if the root doesn't exist until the trigger fires, and fine if it renders in a portal. The tool looks in the whole document.
4. Mount without console errors. The tool treats errors as a broken fixture.
5. Don't import CSS. The tool doesn't link it.
6. Include the parts the library warns about (for example, a dialog title and description), so its warnings stay quiet.

The attributes have to reach the DOM. Pass `data-a11y-trigger` to the component that renders the real element. If a wrapper drops unknown props, put the attribute on a plain element inside it.

## Examples

A React example and a web component example are in `SKILL.md`, in the section on npm packages. They follow the contract above.

For React, JSX works without importing React. Import the library from its package name. The tool installs it for you.

For web components, export a function, `mount(container)`, that adds the archetype to the container. The tool imports the package first, so its elements are defined before `mount` runs. Hooks can sit on a host element, a slotted child, or an element inside an **open** shadow root. A **closed** shadow root hides its content from every tool, so the report lists it as not testable.

## Library accessibility options

Some libraries ship accessibility features you have to switch on (a chart library's accessibility module, for example). Declare it in the mapping file with `"libA11y": true`. The fixture then receives a `libA11y` value, `true` or `false`. In React it's a prop. In web components it's a second argument, `mount(container, { libA11y })`. The tool runs the fixture both ways with `--lib-a11y on,off` and labels each result.

```jsx
export default function Fixture({ libA11y }) {
  return <Chart data-a11y-root accessibility={libA11y} />;
}
```

## States

For a dialog, menu, tooltip, or combobox, the tool tests the closed state, then activates the trigger and tests the open state. For an accordion it tests collapsed, then expanded. Make sure activating the trigger really opens the surface, and that `data-a11y-root` is visible then. Otherwise the open state fails, and the report says why.

## Check your fixture

Run the audit and look at the report's **Archetypes** table. `ran` means it worked. A `gap` row says what went wrong, such as "didn't render an element with data-a11y-trigger" or "didn't bundle." Fix the file and run again.
