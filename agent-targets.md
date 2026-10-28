---
url: /agent-targets.md
---
# Writing targets

Read this when a target is anything other than one live URL: a local page or folder, a Storybook, an npm package, or a comparison whose targets need grouping. A target is `[label=]<spec>`. The label is optional and names the target in the report.

## Specs

| The user means | The spec is |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder. |
| A Storybook | its URL, or a local folder with `index.json` |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. To test one entry of a package, add a sub-path after the version: `npm:@scope/pkg/button` or `npm:@scope/pkg@1.2.3/button/v2`. The sub-path is what a person would import (`import ... from "@scope/pkg/button"`), and it has to be something the package exports. |
| A local build or packed `.tgz` of a package | `npm:<name>` with `--local-package <name>=<path>`. The name is the `name` in the package's `package.json`. Add one `--local-package` for each package in the target that comes from disk. |

If a local folder is given as a Storybook but has no `index.json`, ask the user for its URL or for a different target before running anything.

If a word could mean a package or a folder, ask the user which one and do not run anything until they answer. Otherwise, use the path rule: A bare word such as `button` is a path: the folder or file `./button`. Always write an npm package with the `npm:` prefix.

## Local packages

For a local packed package, read any README the user supplies and keep `--local-package <name>=<path>` on the initial audit and every rerun. Audit first, then use the documented props to write only requested fixtures marked `needs-fixture` (the fixtures guide has the steps). For React, write `fixtures/<target id>/<archetype>.jsx`, not `.html`, and rerun the same command.

## Plain HTML libraries

A library with no framework, such as a stylesheet package and a script package, is tested by naming the files the page should load as sub-paths: `npm:pkg/base.css,pkg/components.css,other/behavior.iife.js`. A sub-path ending in `.css` is a stylesheet, and one ending in `.js` or `.mjs` is a script. Read the package's documentation or its `exports` to find the right files, and ask the user which stylesheets and scripts they use when the documentation doesn't say. Nothing is generated for plain HTML. Button, link, form-field, dialog, accordion, live-region, menu, and tooltip have templates of bare native markup, so they run with no fixture, and the report says what that does and doesn't show. Say so plainly: a pass on a native template never means the package's own components pass. Tabs, combobox, and chart need a fixture (`fixtures/<id>/<archetype>.html`) or they're gaps. To test the package's own components, write a fixture from its documentation.

## One target can be several packages

Some libraries ship in pieces, such as a stylesheet package and a script package. Join them with commas and no spaces: `npm:@scope/components,@scope/interactions`. They install into one folder and are tested as one target. The first is the primary: it names the target and decides the framework. Every other package is a companion. Each entry can have its own version and sub-path (`npm:a@1.2,b/button`). A list with a space, an empty entry, or the same package twice is rejected. Targets themselves are separated by spaces.

## Reading a comparison in plain language

People write "compare A, B and C and D." Work out the targets before you build the command:

* In plain language, commas can suggest companion packages, and the words "and", "vs", "versus", "against", and "compared with" can suggest separate targets. These are clues for a proposed grouping, not confirmation of it. For "compare A, B and C and D", one proposal is three targets: `A,B`, `C`, and `D`; ask the user to confirm it as described below.
* Give each target a short label that says what it is, such as `pantoken-html=npm:A,B instui=npm:C pantoken-wc=npm:D`. Use the framework or the library's own name, so the report reads clearly.
* Packages from the same organization are separate targets when they're alternatives for the same job (a React build and a web component build of one design system). They belong in one target only when the user says they work together, or when one package is the stylesheet or script half of the other.
* Treat package and target grouping as clear only when the user's words explicitly establish which packages work together and which are alternatives. A comma list, package names, or organization names alone don't establish that.
* Whenever multiple packages could be grouped in more than one way, show your best grouping in a short table of label, packages, and role, and ask the user to confirm it before running. Don't decide the grouping is obvious from names or punctuation. Ask this with any other needed questions in one message.
* Run the same archetypes on every target in a comparison. Say in the report which targets are made of several packages.
* Use `compare` for independent targets even when they're different kinds, such as a live page and an npm package. The comparison report opens with a warning that the evidence isn't equivalent.
