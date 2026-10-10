# Quick start

## CLI {#quick-start-cli}

You need Node 20 or newer and Chrome or Chromium.

Install it once with `npm i -g automatica11y`; `automatica11y` is on your `PATH`, with the short name `a11y` too:

```bash
npm i -g automatica11y
```

A global install doesn't update itself, so run `npm i -g automatica11y@latest` to upgrade and `automatica11y --version` to see what you have. If you skip the install, put `npx` in front of every command.

```bash
npx automatica11y doctor
npx automatica11y audit https://example.com
npx automatica11y compare radix=npm:@radix-ui/react-dialog aria=npm:react-aria-components
```

`doctor` checks your setup. If it can't find a browser, it prints the command to install one. Each run writes `report.md`, `results.json`, and `plan.json` to `./a11y-report` by default. [Read a report](/reports) to understand the results.

## CI {#quick-start-ci}

Install the tool and audit your built site:

```bash
npm i -g automatica11y
automatica11y ci ./dist
```

The CI command fails on serious-or-higher axe violations, IBM Toolkit level 1 violations, and incomplete execution or coverage. All policies are configurable. Your CI environment also needs Chrome or Chromium; run `automatica11y doctor` to check the setup.

For GitHub Actions on Ubuntu, use the [reusable Action](/github-action), which installs the tool and Chromium and uploads the reports:

```yaml
- uses: thedannywahl/automatica11y@main
	with:
		targets: ./dist
```

For production, replace `main` with a reviewed commit containing the Action.

## AI {#quick-start-ai}

Automatica11y provides an evergreen bootstrap skill you can add to your agent of choice. Automatica11y cli bundles the latest version of the runner skill and its references, so every invocation is always compatible.

<<< ../skills/automatica11y/SKILL.md{ai}

Once the skill is installed in your agent you can prompt it with the same commands and flags that are available to the cli.

### Audit a web page

You can audit web pages, static html files, Storybooks, and npm packages. To audit a live web page, simply provide the URL.

```prompt
/automatica11y audit "https://instructure.design/"
```

### Compare two packages

Automatica11y can compare two packages, even across different frameworks. It also supports versioning, sub-component exports, and aliases. Here's an example of comparing two different versions of a button from the same package:

```prompt
/automatica11y compare next-gen=npm:@instructure/ui-button/Button/v2 canvas=npm:@instructure/ui-buttons/Button/v1
```

The runner skill and references guide the Agent on how to write custom fixtures, how to interpret results, and how to turn the machine results (`report.json`) into a human-readable templated report.

See [Using it with an AI agent](/agents) for additional details.