# automatica11y.

Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.

automatica11y helps answer two questions:

- How accessible is this? (`audit`)
- How do these compare? (`compare`)

```bash
npm i -g automatica11y
automatica11y compare radix=npm:@radix-ui/react-dialog aria=npm:react-aria-components
```

**[Read the documentation.](https://automatica11y.dev/)**

## Why use it.

Most accessibility tools scan one page and hand back one score. automatica11y is built for the questions that come before and after that scan.

- **It compares.** Pick two component libraries, two versions of one component, or two sites, and `compare` runs them under the same settings, side by side. "Is this library's dialog better than that one?" gets an answer you can check.
- **It tests components, not just pages.** Point it at an npm package. It installs the package on its own, finds the components, builds the test fixtures it needs (React, Vue 3, and web components), then opens the dialogs and menus and presses the keys.
- **It runs two rule engines and keeps them apart.** axe-core and IBM Equal Access catch different things. You get both, labeled, and their counts are never added into one number.
- **It looks past the rules.** Keyboard and focus checks, contrast measured from the styles the browser resolved in every state, how the page holds up under reduced motion, dark mode, forced colors, a 320 pixel window, and wider text spacing, and a transcript from a simulated screen reader.
- **Its reports say how much to trust them.** A gap, an error, or a result it couldn't determine is a finding, never a pass. Each result says whether it came from a whole page or a component, and whether the fixture was written by a person or generated. A report says "no automated violations found" only where an engine found none, and it never says "accessible."
- **It runs on your machine.** It drives your own Chrome. There's no account and nothing is uploaded. Exit codes and fail flags make it usable in CI.
- **An AI agent can run it.** The tool prints its own instructions, so you can ask an agent "how accessible is Radix Dialog?" and it knows what to do.

## What a result looks like.

From a real run on the carousel in shadcn/ui:

| Check | Result | Detail |
|---|---|---|
| `focus-indicator-contrast` | fail | The border has 2.58:1 against what's next to it (needs 3:1). |
| `forced-colors-focus-visible` | fail | With forced colors on, only four of 156 changed pixels reach 3:1 against their unfocused color. |
| `boundary-contrast` | pass | The strongest mark is its icon stroke, at 19.79:1 (needs 3:1). |

axe-core found no automated violations on that component. IBM Equal Access found one: the carousel's region has no label. Both facts are in the report, side by side and separate.

## Quick start.

You need Node 20 or newer and Chrome or Chromium.

Install it once, and `automatica11y` is on your `PATH`, with the short name `a11y` too:

```bash
npm i -g automatica11y
```

Then run it:

```bash
automatica11y doctor
automatica11y audit https://example.com
automatica11y compare radix=npm:@radix-ui/react-dialog aria=npm:react-aria-components
```

You can skip the install and put `npx` in front instead, for example `npx automatica11y doctor`. A global install doesn't update itself, so run `npm i -g automatica11y@latest` to upgrade, and `automatica11y --version` to see what you have.

`doctor` checks your setup, and prints the command that installs a browser if it can't find one. Each run writes a folder (`./a11y-report` by default) with `report.md`, `results.json`, and `plan.json`.

## Use it with an AI agent.

Any agent that can run shell commands can learn the tool from the tool: `automatica11y guide` prints where to start, and `automatica11y guide skill` prints the full steps. If your agent loads skills from a folder, copy [`skills/automatica11y`](skills/automatica11y) into it. It's one small file, and it sends the agent to the same steps. [`AGENTS.md`](AGENTS.md) does the same for agents that read it instead. The [documentation](https://automatica11y.dev/agents.html) has the details.

## What it won't do.

It's not an attestation or certification tool. Automated checks cover only part of WCAG. They can't judge whether alt text is meaningful, whether the reading order makes sense, or how real screen readers behave, and the screen reader it runs is simulated. A person has to check those. See [the limits](https://automatica11y.dev/limits.html).

## License.

MIT. See [LICENSE](LICENSE). The WCAG data below has its own terms.

## Attribution.

automatica11y reads WCAG criterion numbers, names, levels, and versions from the W3C's published JSON, [wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json). The package ships that file in `src/data/` without changes.

Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. The JSON is used under the [terms in the W3C WCAG repository](https://github.com/w3c/wcag/blob/main/11ty/json/README.md): the source is credited with a link, and the content isn't changed. See also the [W3C Document License](https://www.w3.org/copyright/document-license/) and [W3C Intellectual Rights](https://www.w3.org/copyright/intellectual-rights/). The links that reports build to each criterion are added by automatica11y and aren't part of the W3C data.

Every report repeats this credit in its closing section. To refresh the data, run `npm run update-wcag`.
