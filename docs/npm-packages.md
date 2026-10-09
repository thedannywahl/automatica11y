# npm packages and fixtures.

The tool installs each package into its own temporary folder (with install scripts turned off), loads it in the browser, and finds its exports or custom elements. It writes its guesses to `mapping.json`.

## Where a fixture comes from.

Each archetype's fixture comes from the first of these that applies:

1. **Authored.** A file you or your agent write at `fixtures/<target id>/<archetype>.jsx` (`.js` for Angular and web components, `.svelte` for Svelte, `.html` for plain HTML). The same `.jsx` works for React and for Vue 3, following [Writing fixtures](fixtures.md). It always wins.
2. **Template.** The tool builds `button` and `link` tests from the export name alone. For Angular it reads the class's own selector, so a button written as `button[matButton]` becomes a `<button matButton>`.
3. **Generated.** For dialog, menu, tooltip, tabs, accordion, combobox, form-field, and live-region, the tool builds candidate fixtures from what the package exports. It looks for compound parts by common names (a root, a trigger, a content part, a title, a close part, and so on), either as `Dialog.Root` or as `DialogRoot`, and it tries the usual ways of switching a component on (an `open` prop and a close handler). For Angular it reads each class's selectors, inputs, and `exportAs` names, and wires a trigger to the part it points at by template reference. For web components it reads what each element says about itself: its observed attributes, its members, and its slots. It then bundles each candidate, loads it, and checks that exactly one element is the trigger, that nothing logged an error, that activating the trigger shows a root, and that the root carries a role that fits. The first candidate that passes is used. If none does, the archetype is a gap, and the report lists what was tried and why each attempt failed.
4. **Gap.** Anything else is a gap in the report.

A generated fixture is a guess about how the library is meant to be assembled, so a failure may come from how it was wired and not from the library. Reports mark generated results and treat them as lower evidence than an authored fixture. The source of each generated fixture is written to `generated/<target id>/<archetype>.jsx` beside the report. Copy one to `fixtures/<target id>/` and edit it to make it an authored fixture. Use `--no-generate` to turn generation off, for example when you want a strict comparison of authored fixtures only.

Fixtures are code that the tool bundles and runs in a browser on your machine. Write them from the library's documentation, and read ones you didn't write.

## Frameworks.

| Framework | How it's recognized | Fixture |
|---|---|---|
| React | A `react` peer dependency or dependency. | JSX. Import the library and the tool installs it. |
| Vue 3 | A `vue` peer dependency or dependency that allows version 3. | JSX that becomes `h()` calls. Don't import `h`. An optional `setup(app)` export installs plugins. |
| Angular 22 and newer | An Angular core peer dependency or dependency whose range allows version 22 or later. | A `.js` file, or a `.ts` file with decorators (use `inject()` for services). Define the component by calling `Component({ ... })(Class)`, import the library, and export the class as the default. An optional `providers` export adds application providers. |
| Svelte 5 and newer | A `svelte` peer dependency or dependency that allows version 5. | A `.svelte` file. The tool compiles it, and the library's own `.svelte` source, with the compiler from the package's own `svelte` install. |
| Plain HTML | No framework, and the package ships a stylesheet or a browser script. Or a target list that names a `.css` or `.js` file. | An `.html` file of markup. The tool loads the target's styles, puts the markup on the page, then loads its scripts. |
| Web components | A custom elements manifest, or a base library such as Lit. | A `mount(container)` function. |

Vue 2, Svelte 4 and older, and Angular packages older than version 22 report "unsupported framework." Their Storybooks still work, because a Storybook renders stories in a page whatever the framework.

## Plain HTML, CSS, and JavaScript.

Some libraries have no framework: stylesheets, and scripts that wire up behavior on markup the page already has. Name what the page should load as sub-paths in a target list. A sub-path that ends in `.css` is a stylesheet, and one that ends in `.js` or `.mjs` is a script. They load in the order you write them, and the packages install into one folder:

```bash
automatica11y audit pan=npm:@pantoken/components/base.css,@pantoken/components/components.css,@pantoken/interactions/button.iife.js
```

A fixture is a snippet of markup, `fixtures/<target id>/<archetype>.html`. The tool loads the stylesheets with the page, puts your markup on it, then loads the scripts, so a script that looks for its elements when it starts finds them. Mark the control a keyboard user presses with `data-a11y-trigger` and the surface that appears with `data-a11y-root`. A `<script>` inside the snippet runs too.

```html
<button type="button" class="instui-button" data-a11y-trigger data-a11y-root>Save</button>
```

Plain HTML has no exports or selectors to read, so nothing is generated. Eight archetypes have a **template** of bare native markup, with none of the package's classes, so you get results with no fixture at all:

| Archetype | Template |
|---|---|
| button, link | a `<button>`, an `<a href>` |
| form-field | a `<fieldset>` with a labelled text input, a textarea, a select, a checkbox, a radio group, and an invalid field tied to its message |
| dialog | a `<dialog>` opened with `showModal()` |
| accordion | two `<details>` that share a `name` |
| live-region | a `role="status"` region that gets its text when a button is pressed |
| menu | a popover with `role="menu"` and `role="menuitem"` buttons |
| tooltip | a `popover="hint"` with `role="tooltip"`, opened by `interestfor` (needs a recent Chrome) |

These show what the package's styles and scripts do to ordinary elements. They don't test a component the package built, and the report says so. Native markup has no arrow-key menu behavior, so a menu's arrow-key check fails on it. Tabs, combobox, and chart have no native element, so they are gaps until you write a fixture. A script that fails to load or throws makes the archetype a gap with the error. Load every stylesheet the library's documentation names. A stylesheet that reads custom properties (design tokens) from another one looks unstyled without it, and the focus checks report a missing focus ring. For example, pantoken's components stylesheets need its token stylesheet first: `npm:@pantoken/css/style.lean.css,@pantoken/components/base.css,@pantoken/components/components.css,@pantoken/interactions/interactions.iife.js`. The report says how many stylesheets and scripts loaded.

## Components that aren't an npm package.

A component that's markup plus a script, such as Bootstrap's carousel, has no framework to import. Build a page from its documented markup, with the package's real CSS and JavaScript, and audit that page. It gets page evidence: the rule engines, the virtual screen reader, and the conditions checks, but not the interaction checks, because a page carries no trigger to press.

## One entry of a package.

Add a sub-path to test one entry, or to compare two versions of a component. See [Targets](targets.md).
