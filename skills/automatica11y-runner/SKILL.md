---
name: automatica11y-runner
compatibility: Needs Node 20 or newer, Chrome or Chromium, a shell that can run npx, and network access to the npm registry.
description: The full steps for running automatica11y audits and comparisons, from building the command to writing the report. Use it when the automatica11y skill or AGENTS.md sends you here, or when you've already been told to run automatica11y and need the steps.
---

# automatica11y runner

This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results. The tool does the testing. This skill never guesses at results.

It's plain Markdown, and it isn't tied to one agent. It needs an agent that can run shell commands (including `npx`) and read and write files. Paths such as `references/fixtures.md` are relative to this file.

The tool is **not** an attestation or certification tool. Automated checks cover only part of WCAG. Never say a target is "accessible" or "compliant." Where an engine reports zero violations for a target, say "no automated violations found" for that engine. Where it reports violations, list them as the tool reports them, and don't use that phrase for that engine.

## 1. Check the version

This skill works with automatica11y **0.2.x**. Run:

```bash
npx --yes automatica11y@latest --version
```

If the command exits with an error or prints nothing, tell the user it failed, include the error text, and stop. If the output doesn't start with `0.2.`, stop. Tell the user this skill and the tool are out of step. Run `npx --yes automatica11y@latest guide skill` and follow what it prints instead of this copy. Don't run the audit with a mismatched version.

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

Use `audit` for one target and `compare` for two or more. A target is `[label=]<spec>`. The label is optional and names the target in the report.

| The user means | The spec is |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist` (a path starts with `./`, `../`, `/`, `~`, or `file:`) |
| A Storybook | its URL, or a local folder with `index.json` |
| An npm package | `name`, `@scope/name`, or `name@version` |

A bare word such as `button` is always an npm package, never a folder. Ask the user for the package name or path if the word could be either.

Options you can set, and nothing else:

| Option | Default | Use it when |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The user names a WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The user names a level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | The user wants one rule engine. |
| `--tiers rules,interactions,vsr` | all three | The user wants fewer checks. |
| `--archetypes a,b` | all | The user cares about some components. Choose from button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, chart. |
| `--lib-a11y on,off` | both | Only for libraries with opt-in accessibility features. |
| `--mapping <file>` | none | You wrote or edited a mapping file. |
| `--max-stories <n>` | 200 | A large Storybook. |
| `--out <dir>` | `./a11y-report` | The user names a folder. |
| `--plan` | off | You want to see how targets classify without running anything. |
| `--fail-on-axe <impact>` | off | CI-style gating on axe impact (`minor`, `moderate`, `serious`, `critical`). |
| `--fail-on-ibm <1\|2\|3>` | off | Gating on IBM Toolkit level. |
| `--fail-mode any\|all` | `any` | How to combine the two fail flags. |

If the user doesn't name a target to test (a URL, a Storybook, a local page or site, or an npm package), ask for one before you run anything. Don't pick a target for them.

Show the user the exact command before you run it. If a target is ambiguous, ask one question, then go on.

Don't set the fail flags unless the user asks for gating. They change the exit code. They don't change the results.

## 4. npm packages need fixtures

A package's components can't be guessed from its name. The first run installs the package, loads it in the browser, finds its exports (or custom elements), and writes a candidate mapping to `<out>/mapping.json`. It tests `button` and `link` from a template. Every other archetype needs a **fixture**, a small file that assembles the component the way the library intends.

1. Run the audit once. Read `<out>/mapping.json` and the report's **Archetypes** table.
2. Treat the mapping as a guess. Check each `export` or `tag` against what the user asked about.
3. For each archetype marked `needs-fixture` that matters to the request, write `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) in the working directory. Follow the contract and the examples below. `references/fixtures.md` has more: the mapping file, states, and library accessibility options. It should sit next to this file. If you can't open it, run `npx --yes automatica11y@latest guide fixtures` to print it. The contract here is enough for the first fixture.
4. Run the same command again. The tool finds fixtures in that folder without `--mapping`.
5. Don't invent fixtures for archetypes the user didn't ask about. A gap is an honest result.

**The fixture contract, in brief.**

- The default export renders the archetype in its starting state. For web components it's a function, `mount(container)`.
- Mark **exactly one** element `data-a11y-trigger`. It's what a person would focus and activate.
- Mark the main surface `data-a11y-root`, on the element that carries the role (`dialog`, `menu`, `tooltip`), not on an overlay or portal wrapper. It may appear only after the trigger fires, and it may render in a portal.
- Mount without console errors. Don't import CSS.
- The attributes have to reach the DOM. If a wrapper drops unknown props, put them on a plain element inside it.

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

A web component fixture. The tool imports the package first, so its elements are defined before `mount` runs. Hooks can sit on a host, a slotted child, or an element inside an open shadow root. A closed shadow root hides its content from every tool:

```js
export default function mount(container) {
  container.innerHTML = `
    <my-dialog>
      <button slot="trigger" data-a11y-trigger type="button">Open</button>
      <div slot="content" data-a11y-root role="dialog" aria-label="Details">...</div>
    </my-dialog>`;
}
```

Fixtures are code that the tool bundles and runs in a browser on the user's machine. Write them from the library's public documentation. Tell the user the files exist and where. Package installs run with scripts turned off.

If the user asked for a comparison, give every target the same archetypes.

## 5. Run, then read the results

Run the command. Note the exit code:

| Code | Meaning |
|---|---|
| 0 | The run completed. Findings don't change this unless a fail flag was set. |
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
5. Break findings out by archetype and by impact.
6. Use "no automated violations found" only for an engine that reported none for that target. For an engine that reported violations, list them as the tool reports them. Never say "accessible," "compliant," or "passes WCAG."
7. Don't print a single score. If someone insists, pair any number with the coverage matrix and the automated-coverage caveat.
8. Label virtual screen reader output **simulated**. Label library accessibility options **on** or **off** on every result that has one.
9. Treat a gap, a not-testable result, an error, or a failed target as a finding. It never counts as a pass.
10. If the comparison mixes component targets and page targets, open with a warning that the evidence isn't equivalent.
11. Label every rule finding with its engine. Report axe-core and IBM Equal Access separately. Never add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (1 is essential, high-impact requirements). Don't convert one into the other.
12. End with a plain method note. Say what automated tools can't catch: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, and how real screen readers behave. Those need a person.

Use the structure of `report.md`. Quote selectors and rule IDs exactly as `results.json` has them.

## 7. When a target can't be tested

Say these things plainly. Don't soften them, and don't fill in a result.

- **Unsupported framework.** The package needs a framework other than React or web components. Name it. v1 covers React and web components.
- **Not applicable.** The package has no rendering surface, such as a utility library. There's nothing to test.
- **Not testable.** The content is a canvas with no alternative, or sits in a closed shadow root. The rule engines can't see it, so the result is untested, not clean. The virtual screen reader also can't read open shadow roots.
- **Gap.** The archetype has no usable fixture or no matching export. Say what the archetype needs.
- **Error.** An interaction check couldn't finish. It's untested, not failed.
- **Failed target.** The target can't be reached, isn't a web page, or couldn't be built. The tool records it as failed with a reason. Tell the user which target failed, using the reason from `results.json`. Don't retry with guesses. If every target failed (exit code 4), stop. If others ran, report them, and list the failed target as a gap in coverage.

## 8. Stay out of setup

Anything about installing, configuring, or repairing tools belongs to the tool. If `doctor` doesn't cover it, tell the user what failed and stop.
