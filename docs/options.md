# Options and exit codes.

## Options.

| Option | Default | What it does |
|---|---|---|
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The conformance level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | Which rule engines run. |
| `--tiers rules,interactions,computed,conditions,vsr` | all | Which tiers run. |
| `--archetypes a,b` | all | Limit npm and Storybook targets to these archetypes. |
| `--lib-a11y on,off` | both | For libraries with opt-in accessibility features. See [Writing fixtures](fixtures.md). |
| `--mapping <file>` | none | A mapping file for npm targets. |
| `--no-generate` | off | Don't build fixtures for npm packages. Only authored fixtures and the `button` and `link` templates run. |
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
- `mapping.json` appears for npm targets. See [npm packages and fixtures](npm-packages.md).

## Exit codes.

| Code | Meaning |
|---|---|
| 0 | The run completed. Findings don't change this unless a fail flag is set. |
| 1 | The run completed and a fail check tripped. |
| 2 | The command line was wrong. |
| 3 | An environment problem, such as a missing browser or an old Node. The message says how to fix it. |
| 4 | No target produced results. |

One failing target doesn't stop a comparison. It's recorded with its reason, and the others run.

## Using it in CI.

```bash
npx automatica11y audit ./dist --fail-on-axe serious --fail-on-ibm 1 --fail-mode any
```

The run exits 1 when the check trips. Needs-review items never trip it.
