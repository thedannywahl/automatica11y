# automatica11y.

Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.

automatica11y answers two questions:

- How accessible is this? (`audit`)
- How do these compare? (`compare`, two or more targets)

It's **not** an attestation or certification tool. Automated checks cover only part of WCAG, so a report says "no automated violations found" only where an engine found none, and never says "accessible." See [Limits](#limits).

## Quick start.

You need Node 20 or newer and Chrome or Chromium.

```bash
npx automatica11y doctor
npx automatica11y audit https://example.com
npx automatica11y compare radix=npm:@radix-ui/react-dialog aria=npm:react-aria-components
```

`doctor` checks your setup. If it can't find a browser, it prints the command that installs one:

```bash
npx playwright-core install --only-shell chromium
```

Each run writes a folder (`./a11y-report` by default) with `report.md`, `results.json`, and `plan.json`.

## Targets.

A target is `[label=]<spec>`. The label is optional, and names the target in the report.

| Target | Spec |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder, so `dist` means `./dist`. Prefixes `../`, `/`, `~`, and `file:` work too. |
| A Storybook | Its URL, or a local folder with `index.json` or `stories.json`. |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. React and web component libraries work. |

A bare word such as `button` is a path: the folder or file `./button`. Write `npm:button` to pick the package. The prefix is what chooses a package, so a folder with the same name never gets in the way. A bare word that isn't a path fails with a hint, such as "If you meant the npm package, write npm:react."

A local `.html` file is served over `http://localhost`, never `file://`. A static site audits its `index.html` only.

## What it checks.

Four tiers run by default. Use `--tiers` to pick fewer.

- **Rules.** axe-core and IBM Equal Access run side by side. They overlap, and each catches things the other misses. Their findings are reported separately and never added together. axe-core reports an impact (`minor` to `critical`). IBM reports its Toolkit level, a staged adoption scale where level 1 is essential, high-impact requirements. The two scales aren't comparable.
- **Interactions.** Keyboard and focus checks for nine archetypes: button, link, dialog, menu, tabs, combobox, form-field, accordion, and tooltip. Each check runs on a fresh page.
- **Computed checks.** automatica11y's own measurements from resolved styles in the browser, for the trigger of each archetype fixture: text contrast in rest, hover, keyboard focus, and pressed states (1.4.3), the contrast of the control's edge, fill, or icon (1.4.11), and the contrast and thickness of the focus indicator (1.4.11, and 2.4.13 at level AAA). A page that uses a gradient, an image, or transparency behind the control can't be reduced to one color, so that check reports `undetermined`, which is a gap and never a pass. These results are reported on their own and never added to the rule engines' counts.
- **Virtual screen reader.** The announcements a simulated screen reader makes, recorded as data. The output is simulated. It isn't a real screen reader, and real ones announce things differently.

Every result says what it ran, or why it didn't. A gap, a failure, or a result that can't be tested is a finding. It never counts as a pass.

## Options.

| Option | Default | What it does |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The conformance level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | Which rule engines run. |
| `--tiers rules,interactions,computed,vsr` | all | Which tiers run. |
| `--archetypes a,b` | all | Limit npm and Storybook targets to these archetypes. |
| `--lib-a11y on,off` | both | For libraries with opt-in accessibility features. See [the fixture guide](skills/automatica11y-runner/references/fixtures.md). |
| `--mapping <file>` | none | A mapping file for npm targets. |
| `--max-stories <n>` | `200` | The Storybook story cap. The cap spreads over components. |
| `--out <dir>` | `./a11y-report` | Where results go. |
| `--plan` | off | Classify the targets and write `plan.json`, then stop. Nothing installs and no browser launches. |
| `--fail-on-axe <impact>` | off | Exit 1 if axe-core reports a violation at or above `minor`, `moderate`, `serious`, or `critical`. |
| `--fail-on-ibm <1\|2\|3>` | off | Exit 1 if IBM reports a violation at or below that Toolkit level. |
| `--fail-mode any\|all` | `any` | `any` trips when either engine's check trips. `all` trips only when both do, on the same target. |

Run `automatica11y run --plan <plan.json>` to repeat a saved plan. It warns if tool versions have changed.

## Output.

- `report.md` is a complete report, written without any model. It opens with a coverage matrix, then lists findings, then ends with a method note.
- `results.json` holds everything, including element selectors and announcement logs.
- `plan.json` records what ran and the resolved tool and package versions.
- `mapping.json` appears for npm targets. See below.

## Exit codes.

| Code | Meaning |
|---|---|
| 0 | The run completed. Findings don't change this unless a fail flag is set. |
| 1 | The run completed and a fail check tripped. |
| 2 | The command line was wrong. |
| 3 | An environment problem, such as a missing browser or an old Node. The message says how to fix it. |
| 4 | No target produced results. |

One failing target doesn't stop a comparison. It's recorded with its reason, and the others run.

## npm packages and fixtures.

The tool installs each package into its own temporary folder (with install scripts turned off), loads it in the browser, and finds its exports or custom elements. It writes its guesses to `mapping.json`.

It builds `button` and `link` tests on its own. Every other archetype is built from parts that differ by library (`Dialog.Root`, `Dialog.Trigger`, and so on), so it needs a **fixture**: a small file you or your agent write, following [the fixture guide](skills/automatica11y-runner/references/fixtures.md). Put fixtures at `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) and run again. An archetype without a fixture is a gap in the report.

Fixtures are code that the tool bundles and runs in a browser on your machine. Write them from the library's documentation, and read ones you didn't write.

## Use it with an AI agent.

The tool prints its own guidance, so any agent that can run `npx` can learn to use it:

```bash
npx automatica11y@latest guide           # where to start (the AGENTS.md file)
npx automatica11y@latest guide skill     # the full steps: build the command, run it, write the report
npx automatica11y@latest guide fixtures  # how to write the fixtures an npm package needs
```

The guidance ships with the tool, so it always matches the version you run. Tell your agent to run `npx automatica11y@latest guide` and follow it, then ask for things like "How accessible is Radix Dialog?" or "Compare the accessibility of React Aria and Headless UI." The agent needs to run shell commands and read and write files. Nothing here is tied to one agent.

**Skills.** If your agent loads skills from a folder, copy [`skills/automatica11y`](skills/automatica11y) into it. That's one small file, `SKILL.md`. It advertises the tool to the agent, and sends it to `guide skill`. It names no version, so it doesn't go stale. The full steps are the [`automatica11y-runner`](skills/automatica11y-runner) skill, which ships in the package and is what `guide skill` prints. Copy it too if you want the steps available without the network.

**AGENTS.md.** [`AGENTS.md`](AGENTS.md) is for agents that read it but don't load skills. It points to the same steps, and tells contributors how to run and change the code.

## Limits.

- Automated rules find only part of what WCAG covers. They can't judge whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, or how real screen readers behave. A person has to check those.
- Components are tested in the states a fixture shows. Dialogs, menus, tooltips, and comboboxes run closed and open. Other states aren't visited.
- Content on a canvas with no alternative, or inside a closed shadow root, can't be tested, and the report says so. The virtual screen reader can't read inside shadow roots at all.
- Vue, Svelte, Angular, and other frameworks report "unsupported framework."
- Native screen readers aren't part of this version.
- Results are a snapshot. The tools run at their latest versions, and the report records them.

## Using it in CI.

```bash
npx automatica11y audit ./dist --fail-on-axe serious --fail-on-ibm 1 --fail-mode any
```

The run exits 1 when the check trips. Needs-review items never trip it.

## License.

MIT. See [LICENSE](LICENSE). The WCAG data below has its own terms.

## Attribution.

automatica11y reads WCAG criterion numbers, names, levels, and versions from the W3C's published JSON, [wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json). The package ships that file in `src/data/` without changes.

Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. The JSON is used under the [terms in the W3C WCAG repository](https://github.com/w3c/wcag/blob/main/11ty/json/README.md): the source is credited with a link, and the content isn't changed. See also the [W3C Document License](https://www.w3.org/copyright/document-license/) and [W3C Intellectual Rights](https://www.w3.org/copyright/intellectual-rights/). The links that reports build to each criterion are added by automatica11y and aren't part of the W3C data.

Every report repeats this credit in its closing section. To refresh the data, run `npm run update-wcag`.
