---
url: /agent-steps.md
---
# automatica11y runner

This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results. The tool does the testing. This skill never guesses at results.

It's plain Markdown, and it isn't tied to one agent. It needs an agent that can run shell commands (including `npx`) and read and write files.

## Read only what the request needs

This file has what every run needs. The steps for particular cases are in references, so they don't fill your context when the request doesn't need them. When a row below applies, read that whole reference before you act on that part of the request. Paths such as `references/setup.md` are relative to this file. If you can't open the file, print it with the guide command in the last column, using the same command prefix that passed the version check. If neither works, say which reference you couldn't read and stop that part of the work; don't continue from memory.

| When | Read | Or print it with |
|---|---|---|
| `doctor --json` reports a `state` other than `ok`, or the user already said yes to downloading Chromium | `references/setup.md` | `npx --yes --prefer-online automatica11y@latest guide setup` |
| A target is anything other than one live URL: a local page or folder, a Storybook, an npm package (including sub-paths, local builds, plain HTML, and several packages in one target), or a comparison whose targets need grouping | `references/targets.md` | `npx --yes --prefer-online automatica11y@latest guide targets` |
| The user asks to crawl a site, supplies a sitemap, sets discovery limits, or needs authenticated discovery | `references/site.md` | `npx --yes --prefer-online automatica11y@latest guide site` |
| An npm target needs a fixture: after the first run, an archetype the user cares about is `needs-fixture`, or a generated fixture looks wrong | `references/fixtures.md` | `npx --yes --prefer-online automatica11y@latest guide fixtures` |
| Before you write any report or summary of results, every time | `references/reporting.md` | `npx --yes --prefer-online automatica11y@latest guide reporting` |

## What results may claim

The tool is **not** an attestation or certification tool. Automated checks cover only part of WCAG. Never say a target is "accessible" or "compliant," and don't use those words or "passes WCAG" about a target even in a negative or hedged sentence ("I can't say whether the page is accessible"). Say what the results do and don't establish instead. If the user asks whether a target is accessible, open with exactly "Automated checks can't answer that." (ending at "that", never "can't answer whether…") followed by the caveat, then report what the engines found. Don't restate the question anywhere in the reply. For axe-core, say "no automated violations found" when it reports zero violations for a target it tested; otherwise list its violations as reported, and where no page was tested, say so without using that phrase. For IBM Equal Access, report what it found, including when it found no violations, without using that phrase.

For the caveat, write "These automated results do not establish that the page meets WCAG; manual review is still needed." Don't quote a positive accessibility claim just to disclaim it. Use this caveat rather than drawing an overall verdict from automated results, whether positive or negative.

## 1. Check the version

Do sections 1 and 2 before you run an audit. A question to the user about a missing target or an unsupported setting (section 3) can come before or after them. Run this section's version check in its own shell call and read its output and exit code before issuing any `doctor`, `audit`, or `compare` command. Never batch the version check with those commands or run them in parallel. If section 3 says not to run anything until the user answers, ask first and wait; otherwise, a clarification question does not replace the version check.

If the user only wants a report from existing results and says not to rerun the tool, skip sections 1 and 2 and go to sections 5 and 6 to read those files. The version check gates commands, not historical results. Preserve the recorded run date and versions, even when they differ from this skill's series; don't relabel them or require a new audit.

If the user asks only to see a command, such as the version check, and says not to run anything, show it exactly as written in this file, in a code block, and stop.

This skill works with automatica11y **0.12.x**. Run:

```bash
npx --yes --prefer-online automatica11y@latest --version
```

If the command exits with an error or prints nothing, report its exact error text (or say it printed nothing) and the series this copy expects (`0.12.x`), then end the turn. If the output doesn't start with `0.12.`, report the exact version and expected series above, then end the turn. In either case, do not run `doctor` or an audit. If this copy came from a file, offer to read the matching steps with `npx --yes --prefer-online automatica11y@latest guide skill`, but wait for the user's confirmation before running it.

If the user installed the tool globally (`npm i -g automatica11y`), `automatica11y` is on the `PATH` (so is the short name `a11y`), and it runs the same commands as `npx --yes --prefer-online automatica11y@latest`. Every command in this skill is written with `npx`, so replace that prefix with `automatica11y` only when `automatica11y --version` passes the check above. If the installed version is the wrong series, or nothing is installed, use `npx`.

## 2. Check the setup

If the user has already said yes to downloading Chromium, run this instead of the command below, once, and don't run plain `doctor` first:

```bash
npx --yes --prefer-online automatica11y@latest doctor --install-browser --json
```

Apply the exit-code and output checks below, then read `references/setup.md` and follow the row for the state it reports. Otherwise, run:

```bash
npx --yes --prefer-online automatica11y@latest doctor --json
```

For either `doctor` command, if it exits with any code other than 0 or 3, or its output is not a JSON object with a `state` field, report the exact error text (or the invalid output if there is no error text) and exit code, do not run `audit` or `compare`, and end the turn. Otherwise, read its `state`. If it's `ok` (exit code 0), continue. For any other state (exit code 3), read `references/setup.md` and follow the row for that state.

Don't install or configure anything yourself, try other installers, change network settings, or bypass sandbox restrictions. That logic lives in the tool. If the user asked to see the audit command without running it, keep that request in effect after the user chooses to install Chromium in section 2, and show the audit command without running it.

## 3. Turn the request into a command

Only two commands run audits:

```bash
npx --yes --prefer-online automatica11y@latest audit <target> [options]
npx --yes --prefer-online automatica11y@latest compare <target> <target> [<target>...] [options]
```

Use `audit` for one target. Use `compare` when the request names two or more separate targets (each a separate URL, local page or folder, Storybook, or npm package), even when they're different kinds. Pages discovered within one site, and packages grouped into one target, count as one target and use `audit`. A target is `[label=]<spec>`. The label is optional and names the target in the report. A live page's spec is its URL, such as `https://example.com/page`. For every other kind of target, read `references/targets.md` before you build the command. Always write an npm package with the `npm:` prefix.

Options the tool supports (crawl and discovery options are in `references/site.md`):

| Option | Default | Use it when |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The user names a WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The user names a level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | The user wants one rule engine. |
| `--tiers rules,interactions,computed,conditions,vsr` | all five | The user wants fewer checks. |
| `--screenshots` / `--no-screenshots` | off | Follow checklist step 4 below. |
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

Examples: `--fail-on-axe serious`, `--fail-on-ibm 1 --fail-mode all`, `--no-generate`, `--plan`, `--wcag 2.1`, and `--level AAA`.

Use this ordered checklist to decide whether to ask or run:

1. If the target is missing or ambiguous, ask for clarification. If the user doesn't name a target to test (a URL, a Storybook, a local page or site, or an npm package), ask for one; don't pick a target for them.
2. If grouping is unresolved for multi-package targets, show the proposed grouping and ask the user to confirm it.
3. If a setting is unsupported, identify it, list supported values, and ask which to use.
4. Handle screenshots as follows:
   1. If the user mentions screenshots, images, or a visual record of results without explicitly requesting annotated screenshots or declining screenshots, ask whether they want annotated screenshots and run nothing until they answer.
   2. Until they answer, show no command containing `--screenshots`, including conditional commands ("if yes, the command is…").
   3. Use `--screenshots` only when the user explicitly requests annotated screenshots of rule violations. If they say no or don't request them, run without `--screenshots`; use `--no-screenshots` when they disable screenshots configured in YAML.

Ask at most one combined question per turn, listing every unresolved item from steps 1–4 in that message. If none apply, run. Preserve any screenshot links from `report.md` next to the findings they support.

Pass only the options in the tables in this skill and its references, with the values they list. If the user names a setting the tool doesn't have, or a value outside those lists (for example, WCAG 3.0), tell them which setting is unsupported, list the supported values, and ask which to use. Don't substitute a default or invent a value.

Show the user the exact command before you run it. If the user only asks to see the command or says not to run it, show the command and stop. When you show a command, don't list or suggest options the user didn't name (no "tell me if you want `--wcag 2.1`…"); state the defaults it uses in plain words instead. If you have questions (a target that could mean two things, a missing target, an unsupported setting), ask them together in one message. Until the user answers every question about the target, grouping, or unsupported settings, don't run `audit` or `compare`; wait for their reply. When you ask to confirm a grouping, show the command for the proposed grouping with the table.

Don't set the fail flags unless the user asks for gating. They change the exit code. They don't change the results.

## 4. npm packages need fixtures

A package's components can't be guessed from its name alone. Run the audit once first: it installs the package, finds its components, writes `<out>/mapping.json`, and fills what it can from templates and generated fixtures. Then, if an archetype the user cares about is marked `needs-fixture`, or a generated fixture looks wrong for the library, read `references/fixtures.md`, write the fixture it describes, and run the same command again. Don't write fixtures before the first run, and don't invent fixtures for archetypes the user didn't ask about. A gap is an honest result. If the user asked for a comparison, give every target the same archetypes.

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

A target that can't be reached or built is recorded as failed, with a reason. Don't retry with guesses or substitute a different target. If an npm target failed with a network or install error (for example `ETARGET`), you may run the same command once more. If it fails again, report it. If every target failed (exit code 4), stop and report each failed target and its reason. If others ran, report them, and list the failed target as a gap in coverage.

## 6. Write the report

Read `references/reporting.md` before you write any report or summary, even a short one. Its rules aren't repeated here. These hold in every case:

* Write only from `results.json` and `report.md`. Never write from memory, and never repeat a number you didn't read.
* Report axe-core and IBM Equal Access separately. Never add their counts together or convert one engine's scale into the other's.
* A gap, an error, a not-testable result, or a failed target is a finding. It never counts as a pass.
* Use the caveat sentence above verbatim, and avoid positive accessibility verdicts in headings and summaries.

Always end the turn with a final message listing the report path, results path, and any fixture written. For each generated fixture, include its archetype, exact recipe from `results.json`, lower-evidence caveat, and exact IDs of failed interaction checks in that message, not only in a report file. When the user asks you to write up a report, put the full report, following every rule in `references/reporting.md`, in that final message. Saving a copy to a file is optional and never replaces it. Any shorter summary keeps the run date, the statement that results are a snapshot, any outdated-browser warning, and each WCAG criterion's number and name exactly as `report.md` prints them (for example, 1.1.1 Non-text Content). If a step cannot finish, say so and identify the remaining gaps. If an artifact was not written, say that instead of claiming it exists. For a resolution failure, report the failed target and reason from the results, never a clean audit verdict.

## 7. Stay out of setup

Anything about installing, configuring, or repairing tools belongs to the tool. If `doctor` doesn't cover it, tell the user what failed and stop.
