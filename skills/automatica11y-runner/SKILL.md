---
name: automatica11y-runner
compatibility: Needs Node 20 or newer, Chrome or Chromium, a shell that can run npx or the installed automatica11y command, and network access to the npm registry.
description: The full steps for running automatica11y audits and comparisons, from building the command to writing the report. Use it when the automatica11y skill or AGENTS.md sends you here, or when you've already been told to run automatica11y and need the steps.
---

# automatica11y runner

This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results. The tool does the testing. This skill never guesses at results.

It's plain Markdown, and it isn't tied to one agent. It needs an agent that can run shell commands (including `npx`) and read and write files. Paths such as `references/fixtures.md` are relative to this file.

The tool is **not** an attestation or certification tool. Automated checks cover only part of WCAG. Never say a target is "accessible" or "compliant." Where an engine reports zero violations for a target, say "no automated violations found" for that engine. Where it reports violations, list them as the tool reports them, and don't use that phrase for that engine.

## 1. Check the version

Do sections 1 and 2 before you run an audit. A question to the user about a missing target or an unsupported setting (section 3) can come before or after them.

This skill works with automatica11y **0.5.x**. Run:

```bash
npx --yes automatica11y@latest --version
```

If the command exits with an error or prints nothing, tell the user it failed, include the error text, and stop. If the output doesn't start with `0.4.`, stop. Tell the user the version you got and the series this copy expects (`0.5.x`). If this copy came from a file, offer to read the matching steps with `npx --yes automatica11y@latest guide skill`. Don't run an audit until the user confirms how to proceed.

If the user installed the tool globally (`npm i -g automatica11y`), `automatica11y` is on the `PATH` (so is the short name `a11y`), and it runs the same commands as `npx --yes automatica11y@latest`. Every command in this skill is written with `npx`, so replace that prefix with `automatica11y` only when `automatica11y --version` passes the check above. If the installed version is the wrong series, or nothing is installed, use `npx`.

## 2. Check the setup

```bash
npx --yes automatica11y@latest doctor
```

Relay any fix it prints, then stop until the user has applied it. Exit code 3 means a problem with the environment: Node older than 20, or no Chrome or Chromium. Don't install or configure anything yourself. That logic lives in the tool.

## 3. Turn the request into a command

Only two commands run audits:

```bash
npx --yes automatica11y@latest audit <target> [options]
npx --yes automatica11y@latest compare <target> <target> [<target>...] [options]
```

Use `audit` for one target and `compare` for two or more, even when they're different kinds, such as a live page and an npm package. The report then opens with a warning that the evidence isn't equivalent. A target is `[label=]<spec>`. The label is optional and names the target in the report.

| The user means | The spec is |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder. |
| A Storybook | its URL, or a local folder with `index.json` |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. To test one entry of a package, add a sub-path after the version: `npm:@scope/pkg/button` or `npm:@scope/pkg@1.2.3/button/v2`. The sub-path is what a person would import (`import ... from "@scope/pkg/button"`), and it has to be something the package exports. |

A bare word such as `button` is a path: the folder or file `./button`. Always write an npm package with the `npm:` prefix. If a word could mean a package or a folder, ask the user which one before you run anything.

Options you can set, and nothing else:

| Option | Default | Use it when |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The user names a WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The user names a level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | The user wants one rule engine. |
| `--tiers rules,interactions,computed,conditions,vsr` | all five | The user wants fewer checks. |
| `--archetypes a,b` | all | The user cares about some components. Choose from button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, live-region, chart. |
| `--lib-a11y on,off` | both | Only for libraries with opt-in accessibility features. |
| `--mapping <file>` | none | You wrote or edited a mapping file. |
| `--no-generate` | off | The user wants only authored fixtures and the `button` and `link` templates, with no generated ones. |
| `--max-stories <n>` | 200 | A large Storybook. |
| `--out <dir>` | `./a11y-report` | The user names a folder. |
| `--plan` | off | You want to see how targets classify without running anything. |
| `--fail-on-axe <impact>` | off | CI-style gating on axe impact (`minor`, `moderate`, `serious`, `critical`). |
| `--fail-on-ibm <1\|2\|3>` | off | Gating on IBM Toolkit level. |
| `--fail-mode any\|all` | `any` | How to combine the two fail flags. |

Use the target and the settings the user already gave, and ask only for what's missing. If the user doesn't name a target to test (a URL, a Storybook, a local page or site, or an npm package), ask for one before you run anything. Don't pick a target for them.

Pass only the options in the table above, with the values it lists. If the user names a setting the tool doesn't have, or a value outside those lists (for example, WCAG 3.0), tell them which setting is unsupported, list the supported values, and ask which to use. Don't substitute a default or invent a value.

Show the user the exact command before you run it. If you have questions (a target that could mean two things, a missing target, an unsupported setting), ask them together in one message, then go on.

Don't set the fail flags unless the user asks for gating. They change the exit code. They don't change the results.

## 4. npm packages need fixtures

A package's components can't be guessed from its name alone. The first run installs the package, loads it in the browser, finds its exports (or custom elements), and writes a candidate mapping to `<out>/mapping.json`. It then fills each archetype from the first source that applies:

- **Authored.** A **fixture** you write: a small file that assembles the component the way the library intends. It always wins.
- **Template.** The tool builds `button` and `link` from the export name.
- **Generated.** For dialog, menu, tooltip, tabs, accordion, combobox, form-field, and live-region, the tool builds candidates from the package's compound parts (or from what a custom element says about itself), runs each in the browser, and keeps the first that behaves: one trigger, no errors, a root that appears with a fitting role. The `--no-generate` option turns this off.
- **Gap.** If none of those worked, the report lists what was tried and why each attempt failed.

1. Run the audit once. Read `<out>/mapping.json` and the report's **Archetypes** table, which has a **Fixture** column.
2. Treat the mapping as a guess. Check each `export` or `tag` against what the user asked about.
3. Each archetype in `mapping.json` has a status. `generated` means the tool built a fixture that passed its checks, and the source is in `<out>/generated/`. `needs-fixture` means the tool found the component but couldn't build a working fixture. `no-match` means no export or custom element looks like that archetype. For each archetype marked `needs-fixture` that matters to the request, write `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) in the working directory. Follow the contract and the examples below. `references/fixtures.md` has more: the mapping file, states, and library accessibility options. It should sit next to this file. If you can't open it, run `npx --yes automatica11y@latest guide fixtures` to print it. The contract here is enough for the first fixture.
4. Run the same command again. The tool finds fixtures in that folder without `--mapping`.
5. For an archetype that matters, read the generated source before you rely on it. If it looks wrong for the library, write an authored fixture from the documentation. To keep a generated one, copy it from `<out>/generated/<target id>/` into `fixtures/<target id>/`.
6. Don't invent fixtures for archetypes the user didn't ask about. For a `no-match` archetype, write a fixture only if the library's documentation names a component, or a documented way, to make it. Otherwise leave it as a gap. A gap is an honest result.

**The fixture contract, in brief.**

- The default export renders the archetype in its starting state. For web components, the default export is the function `mount(container)`.
- Mark **exactly one** element `data-a11y-trigger`. It's what a person would focus and activate. If nothing can be activated, as with a chart, put both attributes on the same outermost element.
- Mark the main surface `data-a11y-root`, on the element that carries the role (`dialog`, `menu`, `tooltip`), not on an overlay or portal wrapper. It may appear only after the trigger fires, and it may render in a portal.
- Mount without console errors. If the library's documentation says to load a stylesheet, import it. When it comes from another package, list that package under `install` in the mapping file (`references/fixtures.md` has the shape).
- The attributes have to reach the DOM. If a component drops unknown props, use the library's documented way to render your own element in its place (such as `asChild` in Radix, or the `as` prop in Headless UI), and mark that element. If the library has none, leave the archetype as a gap. Don't wrap the library's component in an element you add and mark that.

A React fixture. JSX works without importing React. Import the library from its package name, and the tool installs it:

```jsx
import * as Dialog from "@radix-ui/react-dialog";

export default function Fixture() {
  return (
    <Dialog.Root>
      <Dialog.Trigger data-a11y-trigger>Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content data-a11y-root>
          <Dialog.Title>Edit profile</Dialog.Title>
          <Dialog.Description>Update your details.</Dialog.Description>
          <Dialog.Close>Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

A Vue 3 fixture. It's also JSX, and a function default export is a functional component. The tool turns JSX into `h()` calls and supplies `h` and `Fragment`, so **don't import `h`**. Children become the default slot. A fixture that needs a plugin or global setup can also export `setup(app)`, which runs before the app mounts. Import the library from its package name, and the tool installs it along with Vue:

```jsx
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from "reka-ui";

export default function Fixture() {
  return (
    <DialogRoot>
      <DialogTrigger data-a11y-trigger>Open dialog</DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent data-a11y-root>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your details.</DialogDescription>
          <DialogClose>Close</DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
```

A web component fixture. The tool imports the package first, so its elements are defined before `mount` runs. The `data-a11y-trigger` and `data-a11y-root` attributes can sit on a host, a slotted child, or an element inside an open shadow root. A closed shadow root hides its content from every tool:

```js
export default function mount(container) {
  container.innerHTML = `
    <my-dialog>
      <button slot="trigger" data-a11y-trigger type="button">Open</button>
      <div slot="content" data-a11y-root role="dialog" aria-label="Details">...</div>
    </my-dialog>`;
}
```

Fixtures are code that the tool bundles and runs in a browser on the user's machine. Write them from the library's public documentation. If the documentation doesn't cover the API you need, don't guess, and don't stand in a plain element for the library's component, which would test the element and not the library. Leave the archetype as a gap and tell the user what you couldn't find. Tell the user the files exist and where. Package installs run with scripts turned off.

If the user asked for a comparison, give every target the same archetypes.

## 5. Run, then read the results

Run the command. Note the exit code:

| Code | Meaning |
|---|---|
| 0 | The run completed. Findings don't change this unless a fail flag was set. A target that failed while others ran still exits 0, and the failure is in the results. |
| 1 | The run completed and a fail flag tripped. |
| 2 | The command was wrong. Read the message, fix it, and run again. |
| 3 | An environment problem. Relay the fix. |
| 4 | No target produced results. Say why, from `results.json`. |

Then read `<out>/results.json`. It's the source for everything you write. Read `<out>/report.md` too. It's a complete report the tool wrote on its own.

## 6. Write the report

Write the narrative from `results.json`. Never write from memory, and never repeat a number you didn't read.

1. Put the run date and tool versions first. Say that results are a snapshot.
2. For a comparison, say that every target used the same archetypes, WCAG version, level, and rules.
3. Open with the coverage matrix (target by archetype by tier). Then give the findings.
4. Keep violations, needs-review items, and passes in separate lists. Never merge them.
5. Break findings out by archetype. Within an archetype, order axe-core findings by impact and IBM findings by Toolkit level.
6. Use "no automated violations found" only for an engine that reported none for that target. For an engine that reported violations, list them as the tool reports them. Never say "accessible," "compliant," or "passes WCAG."
7. Don't print a single score. If someone insists, pair any number with the coverage matrix and the automated-coverage caveat.
8. Label virtual screen reader output **simulated**. Label library accessibility options **on** or **off** on every result that has one.
9. Treat a gap, a not-testable result, an error, or a failed target as a finding. It never counts as a pass.
10. If the comparison mixes component targets and page targets, open with a warning that the evidence isn't equivalent.
11. Label every rule finding with its engine. Report axe-core and IBM Equal Access separately. Never add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (1 is essential, high-impact requirements). Don't convert one into the other.
12. Report computed checks (contrast measured from resolved styles) in their own section. Give the measured ratio next to the ratio the criterion needs, and name the state or the method. Never add them to axe-core or IBM counts. Treat `undetermined` as a gap, never as a pass. When a control has visible text and a pale edge, the result is `not-applicable`, because the text identifies the control. Say that, and leave it for a person to confirm.
13. Report conditions checks (reduced motion, dark mode, more and less contrast, reduced transparency, forced colors, reflow at 320 pixels, text spacing) in their own section, with the numbers from `results.json`. Never add them to axe-core or IBM counts. "Not applicable" means the page doesn't use the feature, such as a page with no dark theme, so don't list it as a failure or a pass. Say what each check can't see: JavaScript-driven motion, overlapping text, and two-dimensional content that WCAG exempts from reflow.
14. Say which results come from generated fixtures. A generated fixture is a guess about how the library is assembled, so a failure may come from the wiring and not from the library. Call those results lower evidence than an authored fixture, name the recipe from the **Fixture** column, and don't compare a generated result with an authored one as if they were equal. If the user wants a result to stand on its own, write an authored fixture for it.
15. When you name a WCAG criterion, use the number and name exactly as `report.md` prints them, and keep its "WCAG data" credit to the W3C. Don't write criterion names or levels from memory.
16. End with a plain method note. Say what automated tools can't catch: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, and how real screen readers behave. Those need a person.

Use the structure of `report.md`. Quote selectors and rule IDs exactly as `results.json` has them.

## 7. When a target can't be tested

Say these things plainly. Don't soften them, and don't fill in a result.

- **Unsupported framework.** The package needs a framework other than React, Vue 3, Angular 22 and newer, or web components. Name it, and say which version is unsupported (Vue 2 or Angular 21, for example). This version covers React, Vue 3, Angular 22 and newer, and web components. A Storybook for the library still works, whatever the framework.
- **Not applicable.** The package has no rendering surface, such as a utility library. There's nothing to test.
- **Not testable.** The content is a canvas with no alternative, or sits in a closed shadow root. The rule engines can't see it, so the result is untested, not clean. The virtual screen reader also can't read open shadow roots.
- **Gap.** The archetype has no usable fixture or no matching export. Say what the archetype needs.
- **Error.** An interaction or computed check couldn't finish. It's untested, not failed.
- **Undetermined.** A computed check found a gradient, an image, or transparency behind the control, so it can't reduce the page to one color. It's untested, not clean.
- **Failed target.** The target can't be reached, isn't a web page, or couldn't be built. The tool records it as failed with a reason. Tell the user which target failed, using the reason from `results.json`. Don't retry with guesses. If an npm target failed with a network or install error (for example `ETARGET`), you may run the same command once more. If it fails again, report it. If every target failed (exit code 4), stop. If others ran, report them, and list the failed target as a gap in coverage.

## 8. Stay out of setup

Anything about installing, configuring, or repairing tools belongs to the tool. If `doctor` doesn't cover it, tell the user what failed and stop.
