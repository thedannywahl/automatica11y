[![automatica11y Open Graph preview](https://automatica11y.dev/og.png)](https://automatica11y.dev/)

# automatica11y

Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.

automatica11y helps answer two questions:

- How accessible is this? (`audit`)
- How do these compare? (`compare`)

## Quick start

Run it from your terminal:

```bash
npx -y automatica11y audit npm:@instructure/ui-buttons
```

Install the [skill](skills/automatica11y/SKILL.md) and use it with an agent:

```text
/automatica11y compare "example.com/a.html" "example.com/b.html"
```
Add it to your CD/CI pipeline:

```bash
automatica11y audit ./dist --fail-on-axe serious
```

**[Read the documentation](https://automatica11y.dev/)**

## Why use it

Most accessibility tools scan one page and hand back one score. automatica11y is built for the questions that come before and after that scan.

### It compares

Pick two component libraries, two versions of one component, or two sites, and `compare` runs them under the same settings, side by side. "Is this library's dialog better than that one?" gets an answer you can check.

### It tests components, not just pages

Point it at an npm package. It installs the package on its own, finds the components, builds the test fixtures it needs (React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, and web components), then opens the dialogs and menus and presses the keys.

### It's' composable

Out of the box it looks at standard accessibility interactions and archetypes (buttons, links, dialogs, contrast, etc.) and you can bring your own simple fixtures for more complex components.

### An AI agent can run it

The tool prints its own instructions, so you can ask an agent "how accessible is Radix Dialog?" and it knows what to do.

## What a result looks like

automatica11y generates a machine-readable json findings report, and a human-readable markdown version. Here's an excerpt from a real run on the carousel in shadcn/ui:

| Check | Result | Detail |
|---|---|---|
| `focus-indicator-contrast` | fail | The border has 2.58:1 against what's next to it (needs 3:1). |
| `forced-colors-focus-visible` | fail | With forced colors on, only four of 156 changed pixels reach 3:1 against their unfocused color. |
| `boundary-contrast` | pass | The strongest mark is its icon stroke, at 19.79:1 (needs 3:1). |

> axe-core found no automated violations on that component. IBM Equal Access found one: the carousel's region has no label.

## Limits

automatica11y is not an attestation or certification tool. Automated checks cover only part of WCAG. They can't judge whether alt text is meaningful, whether the reading order makes sense, or how real screen readers behave, and the screen reader it runs is simulated. A person has to check those.

A report says "no automated violations found" where an engine found none, and never says "accessible." A gap, an error, or a result that isn't testable is a finding, not a pass.

## License

MIT. See [LICENSE](LICENSE). The WCAG data below has its own terms.

## Attribution

automatica11y reads WCAG criterion numbers, names, levels, and versions from the W3C's published JSON, [wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json). The package ships that file in `src/data/` without changes.

Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. The JSON is used under the [terms in the W3C WCAG repository](https://github.com/w3c/wcag/blob/main/11ty/json/README.md): the source is credited with a link, and the content isn't changed. See also the [W3C Document License](https://www.w3.org/copyright/document-license/) and [W3C Intellectual Rights](https://www.w3.org/copyright/intellectual-rights/). The links that reports build to each criterion are added by automatica11y and aren't part of the W3C data.

Every report repeats this credit in its closing section. To refresh the data, run `npm run update-wcag`.
