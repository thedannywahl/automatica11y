---
url: /options.md
---
# Options and exit codes

## Options

| Option | Default | What it does |
|---|---|---|
| `--config <file>` | `.automatica11y.yml` if present | Shared YAML configuration. Explicit missing files are errors. Paths use the working directory. |
| `--wcag 2.0\|2.1\|2.2` | `2.2` | The WCAG version. |
| `--level A\|AA\|AAA` | `AA` | The conformance level. IBM Equal Access has no AAA rules, so it runs its AA rules and says so. |
| `--engine axe,ibm` | both | Which rule engines run. |
| `--tiers rules,interactions,computed,conditions,vsr` | all | Which tiers run. |
| `--screenshots` / `--no-screenshots` | off | Save annotated full-page screenshots for rule violations and link them from the report. YAML: `options.screenshots`. |
| `--allow-old-browser` | off | Explicitly use an outdated Chrome or Chromium. Records a warning in `results.json` and the report header. Launch and engine self-tests must still succeed. |
| `--archetypes a,b` | all | Limit npm and Storybook targets to these archetypes. |
| `--lib-a11y on,off` | both | For libraries with opt-in accessibility features. See [Writing fixtures](writing-fixtures.md). |
| `--mapping <file>` | none | A mapping file for npm targets. |
| `--local-package <name=path>` | none | Use a local package directory or `.tgz` for a named npm package. Repeat for companions; unmapped packages still resolve from npm. |

* `plan.json` records what ran, the resolved tool and package versions, and local package source paths.
  | `--no-generate` | off | Don't build fixtures for npm packages. Only authored fixtures and the `button` and `link` templates run. |
  | `--generate` | on | Enable generated fixtures, overriding YAML `generate: false`. |
  | `--max-stories <n>` | `200` | The Storybook story cap. The cap spreads over components. |
  | `--out <dir>` | `./a11y-report/<unique-run>` | Where results go. Each default run gets its own timestamped folder. An explicit folder is used exactly as given. |
  | `--plan` | off | Classify the targets and write `plan.json`, then stop. Nothing installs and no browser launches. |
  | `--fail-on-axe <impact>` | off; `serious` in CI | Exit 1 if axe-core reports a violation at or above `minor`, `moderate`, `serious`, or `critical`. `none` disables the gate. |
  | `--fail-on-ibm <1\|2\|3\|none>` | off; `1` in CI | Exit 1 if IBM reports a violation at or below that Toolkit level. `none` disables the gate. |
  | `--fail-mode any\|all` | `any` | `any` trips when either engine's check trips. `all` trips only when both do, on the same target. |
  | `--fail-on-incomplete true\|false` | off; on in CI | Exit 5 for execution or coverage gaps when at least one target ran. Independent of engine threshold combination. |
  | `--fail-on-review true\|false` | off | Exit 1 for engine findings needing review or simulated-screen-reader review flags. |
  | `--fail-on-checks true\|false` | off | Exit 1 for explicit interaction, computed, or condition check failures. |
  | `--server-command <cmd>` | none | CI only: trusted local server shell command. Requires a loopback readiness URL. |
  | `--server-url <url>` | none | CI only: HTTP(S) loopback URL that must not already respond. |
  | `--server-timeout <seconds>` | `60` | CI only: positive integer readiness timeout. |
  | `--server-working-directory <dir>` | working directory | CI only: server command directory. |

Run `automatica11y run --plan <plan.json>` to repeat a saved plan. It warns if tool versions have changed.

## Output

* `report.md` is a complete report, written without any model. It opens with a coverage matrix, then lists findings, then ends with a method note.
* With `--screenshots`, `report.md` links to annotated PNGs beside the relevant findings, and `results.json` records their paths relative to the output directory.
* `results.json` holds everything, including element selectors and announcement logs.
* `plan.json` records what ran and the resolved tool and package versions.
* `mapping.json` appears for npm targets. See [Writing fixtures](writing-fixtures.md).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No configured CI gate tripped. This does not mean accessible or fully tested. |
| 1 | A violation, review, or non-rule check gate tripped. |
| 2 | The command line was wrong. |
| 3 | An environment problem, such as a missing browser or an old Node. The message says how to fix it. |
| 4 | No target produced results. |
| 5 | At least one target ran, but the enabled incomplete-coverage gate tripped. Takes precedence over exit 1. |

One failing target doesn't stop a comparison. It's recorded with its reason, and the others run. Reports are written before findings or coverage cause a nonzero exit. Environment and all-resolution failures can produce only a plan or no files.
