# Plan: plain HTML, CSS, and JavaScript components.

Status: proposed, October 9, 2026. Decisions from the user are marked **Decided**.

## 1. The problem.

Some libraries have no framework. `@pantoken/components` is stylesheets, and `@pantoken/interactions` is browser scripts that wire up behavior on plain markup. A consumer writes `<button class="instui-button">` and loads the CSS and the script. Today the tool has nothing to test: detection says "no rendering surface," and a hand-built page only gets page evidence, because nothing marks a trigger.

## 2. Targets: several packages in one.

**Decided: a comma-separated list.** `--archetypes a,b` already works that way, a comma can't appear in a package name or a semver range, and `+` can (`1.0.0+build`).

```bash
automatica11y audit pan=npm:@pantoken/components,@pantoken/interactions
```

- Each entry is a full npm spec: `name`, `name@version`, or `name@version/sub/path`. Everything installs into one folder, so the scripts and styles see each other.
- The first entry is the primary. It names the target in the report and decides the framework when the metadata says nothing. The rest are companions, listed under the target's **npm** details with their versions.
- A label works as before (`pan=npm:a,b`), and the target id is the label, or the primary's name.
- `compare` takes a list on each side, so two versions of a pair compare cleanly.
- One list, one flavor. If the entries disagree (a React package beside a plain CSS one), the primary decides, and the report warns.
- A single spec behaves as it does today. The mapping's `install` key stays for a companion that only one archetype needs.

## 3. The `html` adapter.

An adapter with the same shape as React, Vue, Angular, and web components.

| Member | Behavior |
|---|---|
| id, kind | `html`, `npm-html` |
| detect | No framework peers and no custom elements manifest, and the package ships a stylesheet or a browser script (`style`, `unpkg`, `jsdelivr`, `browser`, or a `.css` or `.js` entry in `exports`). Today this lands in "not applicable." |
| discover | Lists the package's stylesheets and browser scripts from its metadata, so the mapping can name them. Nothing is executed to discover. |
| bundle | No transform. Styles and scripts are copied from the install folder and served as they are. |
| entry | A page that loads the listed styles, then the listed scripts, then mounts the fixture's markup into the root, then fires `DOMContentLoaded`-style readiness so auto-initializing scripts find their elements. |
| fixture | An `.html` file holding markup, with `data-a11y-trigger` and `data-a11y-root`. An optional `<script>` inside it runs after the mount. |

**What loads.** The mapping names the files, resolved from the install folder:

```json
{ "pan": { "dialog": { "fixture": "fixtures/pan/dialog.html" }, "styles": ["@pantoken/components/dist/components.css"], "scripts": ["@pantoken/interactions/dist/interactions.iife.js"] } }
```

Without a mapping, the tool loads every stylesheet and script the primary's metadata names, and the report says which. A script that fails to load is a gap with the reason, never a silent pass.

## 4. Fixtures and templates.

**Decided: templates are the bare, native HTML and CSS only.** A template is plain native markup, with no class names and nothing guessed from the stylesheet. It tests what the package's styles and scripts do to ordinary elements. A component built on classes (`.instui-button`) needs a fixture the consumer brings.

| Archetype | Template (native markup) |
|---|---|
| button | `<button type="button">` |
| link | `<a href="#top">` |
| form-field | `<label for>` and `<input>` |
| dialog | `<button>` that calls `showModal()` on a `<dialog>` that has a heading and a close button |
| accordion | `<details>` and `<summary>` |
| live-region | a `<button>` that adds a `<div role="status">` message |
| menu | a `<button popovertarget>` that toggles a `popover` element with `role="menu"` and `role="menuitem"` buttons. The browser does the open and close. |
| tooltip | a `<button>` with `interestfor` pointing at a `popover="hint"` element with `role="tooltip"`, so it opens on focus. This needs a browser that supports interest invokers, so where the bundled browser doesn't, it's a gap that says so. |
| tabs, combobox, chart | No template. Native HTML has no element for tabs. A `<select>` or `<datalist>` draws its list outside the page, so there's no surface to test, and a chart has nothing to press. They are gaps with a reason, unless a fixture is brought. |

- A report marks these results as **native markup under the package's styles**, a lower claim than a result for a component the package built. The report never says the package's component passed.
- **Authored** fixtures win, as everywhere. They work for every archetype, and a consumer can bring a full set. The same recipe format as the other adapters (`fixtures/<id>/<archetype>.html`, or a path in the mapping).
- **Generated** fixtures are out of the first release. Without selectors or exports there is nothing to read from except class names, and that's the guessing the decision above rules out. A later release can revisit it with real runs in hand.

## 5. Phases.

1. **Targets.** The comma list in `classify` and `resolve-npm`, the install of several packages into one folder, the report's npm details, and `compare`. Tests with fake packages.
2. **Adapter.** Detection, asset discovery, the page entry, the `.html` fixture, and the mapping's `styles` and `scripts`. Tests with fake CSS and JavaScript packages, including a script that must run after mount and a script that fails to load.
3. **Templates.** The eight native templates, their report wording, and gaps for the rest.
4. **Real run.** `@pantoken/components` and `@pantoken/interactions` as the proof, with an authored `.instui-button` fixture to show a consumer fixture working. Docs, the runner skill, and a plan note.

## 6. Risks.

| Risk | What reduces it |
|---|---|
| Auto-initializing scripts run before the markup exists. | The entry mounts the markup first, then loads scripts, and the fixture can add its own readiness event. |
| A script mutates the DOM in ways that make the trigger or root move. | The probe and marking code already handle that for the other adapters. |
| A package's `exports` hides its stylesheets from the install folder. | Files resolve from the folder on disk, with the `exports` check applied only to import-style sub-paths. |
| A native template says nothing about the package's own components. | The report wording, and the docs say plainly what a template covers. |

## 7. Still open.

1. Whether a list on one side of `compare` should be allowed to pair with a single package on the other. I'd allow it, and the report would list each side's packages.
