---
url: /agent-steps.md
---
# automatica11y runner

This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results. The tool does the testing. This skill never guesses at results.

It's plain Markdown, and it isn't tied to one agent. It needs an agent that can run shell commands (including `npx`) and read and write files. Paths such as `references/fixtures.md` are relative to this file.

The tool is **not** an attestation or certification tool. Automated checks cover only part of WCAG. Never say a target is "accessible" or "compliant." For axe-core, say "no automated violations found" when it reports zero violations; otherwise list its violations as reported. For IBM Equal Access, report what it found, including when it found no violations, without using that phrase.

For the caveat, write "These automated results do not establish that the page meets WCAG; manual review is still needed." Don't quote a positive accessibility claim just to disclaim it. Negative statements such as "not accessible" are not claims of a pass, but use the caveat above rather than drawing an overall verdict from automated results.

## 1. Check the version

Do sections 1 and 2 before you run an audit. A question to the user about a missing target or an unsupported setting (section 3) can come before or after them. Run this section's version check before any `doctor`, `audit`, or `compare` command. If section 3 says not to run anything until the user answers, ask first.

This skill works with automatica11y **0.11.x**. Run:

```bash
npx --yes --prefer-online automatica11y@latest --version
```

If the command exits with an error or prints nothing, report its exact error text (or say it printed nothing) and the series this copy expects (`0.11.x`), then end the turn. If the output doesn't start with `0.11.`, report the exact version and expected series above, then end the turn. In either case, do not run `doctor` or an audit. If this copy came from a file, offer to read the matching steps with `npx --yes --prefer-online automatica11y@latest guide skill`, but wait for the user's confirmation before running it.

If the user installed the tool globally (`npm i -g automatica11y`), `automatica11y` is on the `PATH` (so is the short name `a11y`), and it runs the same commands as `npx --yes --prefer-online automatica11y@latest`. Every command in this skill is written with `npx`, so replace that prefix with `automatica11y` only when `automatica11y --version` passes the check above. If the installed version is the wrong series, or nothing is installed, use `npx`.

## 2. Check the setup

If the user has already said yes to downloading Chromium, skip the plain `doctor` command and run exactly `npx --yes --prefer-online automatica11y@latest doctor --install-browser` once in the shell. Do not substitute `automatica11y` for `npx` for this command. Report what it prints. Don't run `doctor` first, invoke a standalone browser installer, or install anything else.

Otherwise, run:

```bash
npx --yes --prefer-online automatica11y@latest doctor
```

Exit code 3 means a problem with the environment: Node older than 22, no Chrome or Chromium, or a Chrome or Chromium more than two major versions behind the one Playwright ships. Relay the exact problem, then follow the matching row:

| Detected state | User consent given | Allowed next action | Stop condition |
|---|---|---|---|
| Outdated browser | The user chooses this browser, chooses a download, or has not chosen yet. | If they choose the outdated browser, name it and its version, explain that results may be unreliable and the report header will flag it, then use `--allow-old-browser` on the audit or comparison and every rerun. Do not install anything. If they choose a download, follow “Download accepted.” If they have not chosen, present both choices: use this browser or download a current Chromium through Playwright (about 100 MB); do not default to downloading. | If neither choice is authorized, wait for the user's choice. |
| No browser | The user accepts or declines a download. | If accepted, follow “Download accepted.” There is no outdated-browser fallback. | If declined, report that no browser is available and stop without running `doctor` again, auditing, or installing anything. |
| Setup error | No additional consent applies. | Relay the exact problem and the fix. The outdated-browser option bypasses only the browser version check, never a missing browser, unsupported Node, launch failure, or failed rule-engine self-test. | Stop until the user applies the fix. |
| Download accepted | The user explicitly agrees to download Chromium. | Run `npx --yes --prefer-online automatica11y@latest doctor --install-browser` once and report what it prints. If installation succeeds, continue. | If installation fails, follow “Download failed.” |
| Download failed | The user has or has not explicitly authorized using an outdated browser. | If an outdated browser is still found and the user already explicitly authorized that fallback, use it with `--allow-old-browser`. Otherwise, report the exact error and offer that browser with `--allow-old-browser`; wait for consent. If no browser remains, report the error. Choosing a download alone is not consent to use an outdated browser. | If no browser remains, stop. |
| Fallback declined | The user declines using the outdated browser. | None. | Stop without auditing. |

Add `--allow-old-browser` only after explicit consent to use the outdated browser. Never add it by default.

Do not try other installers, change network settings, or bypass sandbox restrictions. Don't install or configure anything else yourself. That logic lives in the tool.

## 3. Turn the request into a command

Only two commands run audits:

```bash
npx --yes --prefer-online automatica11y@latest audit <target> [options]
npx --yes --prefer-online automatica11y@latest compare <target> <target> [<target>...] [options]
```

Use `audit` for one target and `compare` for two or more, even when they're different kinds, such as a live page and an npm package. The report then opens with a warning that the evidence isn't equivalent. A target is `[label=]<spec>`. The label is optional and names the target in the report.

| The user means | The spec is |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder. |
| A Storybook | its URL, or a local folder with `index.json` |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. To test one entry of a package, add a sub-path after the version: `npm:@scope/pkg/button` or `npm:@scope/pkg@1.2.3/button/v2`. The sub-path is what a person would import (`import ... from "@scope/pkg/button"`), and it has to be something the package exports. |
| A local build or packed `.tgz` of a package | `npm:<name>` with `--local-package <name>=<path>`. The name is the `name` in the package's `package.json`. Add one `--local-package` for each package in the target that comes from disk. |

If a local folder is given as a Storybook but has no `index.json`, ask the user for its URL or for a different target before running anything.

If a word could mean a package or a folder, ask the user which one and do not run anything until they answer. Otherwise, use the path rule: A bare word such as `button` is a path: the folder or file `./button`. Always write an npm package with the `npm:` prefix.

For a local packed package, read any README the user supplies and keep `--local-package <name>=<path>` on the initial audit and every rerun. Follow section 4: audit first, then use the documented props to write only requested fixtures marked `needs-fixture`. For React, write `fixtures/<target id>/<archetype>.jsx`, not `.html`, and rerun the same command.

**Plain HTML libraries.** A library with no framework, such as a stylesheet package and a script package, is tested by naming the files the page should load as sub-paths: `npm:pkg/base.css,pkg/components.css,other/behavior.iife.js`. A sub-path ending in `.css` is a stylesheet, and one ending in `.js` or `.mjs` is a script. Read the package's documentation or its `exports` to find the right files, and ask the user which stylesheets and scripts they use when the documentation doesn't say. Nothing is generated for plain HTML. Button, link, form-field, dialog, accordion, live-region, menu, and tooltip have templates of bare native markup, so they run with no fixture, and the report says what that does and doesn't show. Say so plainly: a pass on a native template never means the package's own components pass. Tabs, combobox, and chart need a fixture (`fixtures/<id>/<archetype>.html`) or they're gaps. To test the package's own components, write a fixture from its documentation.

**One target can be several packages.** Some libraries ship in pieces, such as a stylesheet package and a script package. Join them with commas and no spaces: `npm:@scope/components,@scope/interactions`. They install into one folder and are tested as one target. The first is the primary: it names the target and decides the framework. Every other package is a companion. Each entry can have its own version and sub-path (`npm:a@1.2,b/button`). A list with a space, an empty entry, or the same package twice is rejected. Targets themselves are separated by spaces, as before.

**Reading a comparison in plain language.** People write "compare A, B and C and D." Work out the targets before you build the command:

* A comma joins packages into one target. The words "and", "vs", "versus", "against", and "compared with" separate targets. So "compare A, B and C and D" is three targets: `A,B`, `C`, and `D`.
* Give each target a short label that says what it is, such as `pantoken-html=npm:A,B instui=npm:C pantoken-wc=npm:D`. Use the framework or the library's own name, so the report reads clearly.
* Packages from the same organization are separate targets when they're alternatives for the same job (a React build and a web component build of one design system). They belong in one target only when the user says they work together, or when one package is the stylesheet or script half of the other.
* Treat package and target grouping as clear only when the user's words explicitly establish which packages work together and which are alternatives. A comma list, package names, or organization names alone don't establish that.
* Whenever multiple packages could be grouped in more than one way, show your best grouping in a short table of label, packages, and role, and ask the user to confirm it before running. Don't decide the grouping is obvious from names or punctuation. Ask this with any other needed questions in one message.
* Run the same archetypes on every target in a comparison. Say in the report which targets are made of several packages.

Options you can set, and nothing else:

| Option | Default | Use it when |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The user names a WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The user names a level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | The user wants one rule engine. |
| `--tiers rules,interactions,computed,conditions,vsr` | all five | The user wants fewer checks. |
| `--screenshots` / `--no-screenshots` | off | The user explicitly requests annotated screenshots of rule violations, or disables screenshots configured in YAML. |
| `--allow-old-browser` | off | The user explicitly agrees to use the outdated browser reported by `doctor`, including after a failed Chromium download. |
| `--archetypes a,b` | all | The user cares about some components. Choose from button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, live-region, chart. |
| `--lib-a11y on,off` | both | Only for libraries with opt-in accessibility features. |
| `--mapping <file>` | none | You wrote or edited a mapping file. |
| `--no-generate` | off | The user wants only authored fixtures and the `button` and `link` templates, with no generated ones. |
| `--max-stories <n>` | 200 | A large Storybook. |
| `--local-package <name=path>` | none | The user points at a local package folder or a packed `.tgz`. Repeat it for each such package. |
| `--out <dir>` | `./a11y-report/<unique-run>` | The user names a folder; use that folder directly. |
| `--plan` | off | You want to see how targets classify without running anything. |
| `--fail-on-axe <impact>` | off | CI-style gating on axe impact (`minor`, `moderate`, `serious`, `critical`). |
| `--fail-on-ibm <1\|2\|3>` | off | Gating on IBM Toolkit level. |
| `--fail-mode any\|all` | `any` | How to combine the two fail flags. |

Use the target and the settings the user already gave, and ask only for what's missing. When deciding whether to ask, grouping confirmation takes precedence over “ask only for what's missing.” Ask one combined message when any of these is unresolved: the target, a grouping for multi-package targets, or an unsupported setting. Otherwise, run without asking. Annotated screenshots are optional and off by default: use `--screenshots` when the user explicitly asks for them, and leave them off for ordinary audit requests. If the user mentions screenshots, images, or a visual record of results without explicitly requesting annotated screenshots, ask whether they want annotated screenshots. Don't enable them by default. Preserve any screenshot links from `report.md` next to the findings they support. If the user doesn't name a target to test (a URL, a Storybook, a local page or site, or an npm package), ask for one before you run anything. Don't pick a target for them.

Pass only the options in the table above, with the values it lists. If the user names a setting the tool doesn't have, or a value outside those lists (for example, WCAG 3.0), tell them which setting is unsupported, list the supported values, and ask which to use. Don't substitute a default or invent a value.

Show the user the exact command before you run it. If the user only asks to see the command or says not to run it, show the command and stop. If you have questions (a target that could mean two things, a missing target, an unsupported setting), ask them together in one message. Until the user answers every question about the target, grouping, or unsupported settings, don't run `audit` or `compare`; wait for their reply.

Don't set the fail flags unless the user asks for gating. They change the exit code. They don't change the results.

## 4. npm packages need fixtures

A package's components can't be guessed from its name alone. The first run installs the package, loads it in the browser, finds its exports (or custom elements), and writes a candidate mapping to `<out>/mapping.json`. It then fills each archetype from the first source that applies:

* **Authored.** A **fixture** you write: a small file that assembles the component the way the library intends. It always wins.
* **Template.** The tool builds `button` and `link` from the export name.
* **Generated.** For dialog, menu, tooltip, tabs, accordion, combobox, form-field, and live-region, the tool builds candidates from the package's compound parts (or from what a custom element says about itself), runs each in the browser, and keeps the first that behaves: one trigger, no errors, a root that appears with a fitting role. The `--no-generate` option turns this off.
* **Gap.** If none of those worked, the report lists what was tried and why each attempt failed.

1. Run the audit once. Read `<out>/mapping.json` and the report's **Archetypes** table, which has a **Fixture** column.
2. Treat the mapping as a guess. Check each `export` or `tag` against what the user asked about.
3. Each archetype in `mapping.json` has a status. `generated` means the tool built a fixture that passed its checks, and the source is in `<out>/generated/`. `needs-fixture` means the tool found the component but couldn't build a working fixture. `no-match` means no export or custom element looks like that archetype. For each archetype marked `needs-fixture` that matters to the request, write `fixtures/<target id>/<archetype>.jsx` (`.js` for web components) in the working directory. Follow the contract and the examples below. `references/fixtures.md` has more: the mapping file, states, and library accessibility options. It should sit next to this file. If you can't open it, run `npx --yes --prefer-online automatica11y@latest guide fixtures` to print it. The contract here is enough for the first fixture.

Read the exact target id from `<out>/plan.json` or the target keys in `<out>/mapping.json`; don't derive a different folder from the package scope or tarball filename. An explicit label is normalized into that id: `widgets=npm:@a11y-eval/widgets` uses `fixtures/widgets/tabs.jsx` for a React tabs fixture.
4\. Run the same command again. The tool finds fixtures in that folder without `--mapping`.
5\. For an archetype that matters, read the generated source before you rely on it. If it looks wrong for the library, write an authored fixture from the documentation. To keep a generated one, copy it from `<out>/generated/<target id>/` into `fixtures/<target id>/`.
6\. Don't invent fixtures for archetypes the user didn't ask about. For a `no-match` archetype, write a fixture only if the library's documentation names a component, or a documented way, to make it. Otherwise leave it as a gap. A gap is an honest result.

**The fixture contract, in brief.**

* The default export renders the archetype in its starting state. For web components, the default export is the function `mount(container)`.
* Mark **exactly one** element `data-a11y-trigger`. It's what a person would focus and activate. If nothing can be activated, as with a chart, put both attributes on the same outermost element.
* Mark the main surface `data-a11y-root`, on the element that carries the role (`dialog`, `menu`, `tooltip`), not on an overlay or portal wrapper. It may appear only after the trigger fires, and it may render in a portal.
* Mount without console errors. If the library's documentation says to load a stylesheet, import it. When it comes from another package, list that package under `install` in the mapping file (`references/fixtures.md` has the shape).
* The attributes have to reach the DOM. If a component drops unknown props, use the library's documented way to render your own element in its place (such as `asChild` in Radix, or the `as` prop in Headless UI), and mark that element. If the library has none, leave the archetype as a gap. Don't wrap the library's component in an element you add and mark that.

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
| 4 | No target was audited successfully. Read the failed targets and their reasons from `results.json`. |

Then read `<out>/results.json`. It's the source for everything you write. Read `<out>/report.md` too. It's a complete report the tool wrote on its own.

Without `--out`, each invocation uses a unique timestamped folder under `./a11y-report` in the working folder. Read `results.json` and `report.md` from the exact paths printed by that command; its `plan.json`, screenshots, and other artifacts stay in the same run folder. Do not select a different run's report. An explicit `--out` folder is used directly. A normal audit or comparison writes both files even when every target fails during resolution (exit code 4). Those targets are failed, not audited: their reasons are recorded without engine findings or passes. `--plan` writes only `plan.json` and never audit results. The tool writes these artifacts, not the agent. If an expected file is missing, report that gap and the command's error output; don't invent or create replacement results.

## 6. Write the report

Write the narrative from `results.json`. Never write from memory, and never repeat a number you didn't read.

Always end the turn with a final message listing the report path, results path, and any fixture written. If a step cannot finish, say so and identify the remaining gaps. If an artifact was not written, say that instead of claiming it exists. For a resolution failure, report the failed target and reason from the results, never a clean audit verdict.

Use the caveat sentence above verbatim, and avoid positive accessibility verdicts in headings and summaries. Quoted rule text is not itself a claim that a target passed; distinguish quotations and negated statements from an actual verdict.

A title, run metadata, and settings may precede the coverage matrix; the matrix comes before the findings. When IBM Equal Access reports no violations but reports needs-review items, write "IBM Equal Access reported no violations in this run" and list the needs-review items in their own section. Do not use "no automated violations found" for IBM. Never say an engine "found nothing" when it reported needs-review items.

1. Put the run date and tool versions first. Say that results are a snapshot. When `results.json` contains an outdated-browser warning, keep it in the report header before coverage and findings, name the browser version, and say results may be unreliable. Preserve that warning in any separate summary; do not hide it in a footer or describe the browser as supported.
2. For a comparison, say that every target used the same archetypes, WCAG version, level, and rules.
3. Open with the coverage matrix (target by archetype by tier). Then give the findings.
4. Keep violations, needs-review items, and passes in separate lists. Never merge them.
5. Break findings out by archetype. Within an archetype, order axe-core findings by impact and IBM findings by Toolkit level.
6. Use "no automated violations found" only for axe-core when it reports zero violations for that target; otherwise list its violations as reported. For IBM Equal Access, write "IBM Equal Access reported no violations in this run." when it reports zero. Never use "no automated violations found" for IBM. Never say "accessible," "compliant," or "passes WCAG."
7. Don't print a single score. If someone insists, pair any number with the coverage matrix and the automated-coverage caveat.
8. Label virtual screen reader output **simulated**. Label library accessibility options **on** or **off** on every result that has one.
9. Treat a gap, a not-testable result, an error, or a failed target as a finding. It never counts as a pass.
10. If the comparison mixes npm package or Storybook targets with live URL or local page or site targets, open the report with a warning that the evidence isn't equivalent.
11. Label every rule finding with its engine. Report axe-core and IBM Equal Access separately. Never add their counts together. Impact is axe-core's own label. IBM Toolkit level is IBM's staged adoption scale (1 is essential, high-impact requirements); report IBM's result even when it has zero violations, without saying "no automated violations found." Don't convert one scale into the other.
12. Report computed checks (contrast measured from resolved styles) in their own section. Give the measured ratio next to the ratio the criterion needs, and name the state or the method. Never add them to axe-core or IBM counts. Treat `undetermined` as a gap, never as a pass. When a control has visible text and a pale edge, the result is `not-applicable`, because the text identifies the control. Say that, and leave it for a person to confirm.
13. Report conditions checks (reduced motion, dark mode, more and less contrast, reduced transparency, forced colors, reflow at 320 pixels, text spacing) in their own section, with the numbers from `results.json`. Never add them to axe-core or IBM counts. "Not applicable" means the page doesn't use the feature, such as a page with no dark theme, so don't list it as a failure or a pass. Say what each check can't see: JavaScript-driven motion, overlapping text, and two-dimensional content that WCAG exempts from reflow.
14. Say which results come from generated fixtures. A generated fixture is a guess about how the library is assembled, so a failure may come from the wiring and not from the library. Call those results lower evidence than an authored fixture, name the recipe from the **Fixture** column, and don't compare a generated result with an authored one as if they were equal. If the user wants a result to stand on its own, write an authored fixture for it.
15. When you name a WCAG criterion, use the number and name exactly as `report.md` prints them, and keep its "WCAG data" credit to the W3C. Don't write criterion names or levels from memory.
16. End with a plain method note. Say what automated tools can't catch: whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, and how real screen readers behave. Those need a person.

Use the structure of `report.md`. Quote selectors and rule IDs exactly as `results.json` has them.
Keep `report.md` screenshot links attached to their relevant finding or story when writing a separate summary.

## 7. When a target can't be tested

Say these things plainly. Don't soften them, and don't fill in a result.

* **Unsupported framework.** The package needs a framework other than React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, or web components. Name it, and say which version is unsupported (Vue 2, Svelte 4, or Angular 21, for example). This version covers React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, and web components. A Storybook for the library still works, whatever the framework.
* **Not applicable.** The package has no rendering surface, such as a utility library. There's nothing to test.
* **Not testable.** The content is a canvas with no alternative, or sits in a closed shadow root. The rule engines can't see it, so the result is untested, not clean. The virtual screen reader also can't read open shadow roots.
* **Gap.** The archetype has no usable fixture or no matching export. Say what the archetype needs.
* **Error.** An interaction or computed check couldn't finish. It's untested, not failed.
* **Undetermined.** A computed check found a gradient, an image, or transparency behind the control, so it can't reduce the page to one color. It's untested, not clean.
* **Failed target.** The target can't be reached, isn't a web page, or couldn't be built. The tool records it as failed with a reason. Tell the user which target failed, using the reason from `results.json`, including when every target failed during resolution before auditing. Don't retry with guesses. If an npm target failed with a network or install error (for example `ETARGET`), you may run the same command once more. If it fails again, report it. If every target failed (exit code 4), stop. If others ran, report them, and list the failed target as a gap in coverage.

## 8. Stay out of setup

Anything about installing, configuring, or repairing tools belongs to the tool. If `doctor` doesn't cover it, tell the user what failed and stop.
