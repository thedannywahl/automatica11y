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

Install the tool and audit your built site, failing the pipeline on serious axe findings:

```bash
npm i -g automatica11y
automatica11y audit ./dist --fail-on-axe serious
```

Your CI environment also needs Chrome or Chromium. Run `automatica11y doctor` to check the setup.

## AI {#quick-start-ai}

Give an AI agent the current instructions, then ask it to run a check:

```bash
npx automatica11y@latest guide skill
```

For example: "Audit https://example.com and summarize the findings."

See [Using it with an AI agent](/agents) for skill installation and version checks.