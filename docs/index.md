# automatica11y.

Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.

automatica11y answers two questions:

- How accessible is this? (`audit`)
- How do these compare? (`compare`, two or more targets)

It's **not** an attestation or certification tool. Automated checks cover only part of WCAG, so a report says "no automated violations found" only where an engine found none, and never says "accessible." See [Limits](limits.md).

## Install.

You need Node 20 or newer and Chrome or Chromium.

Install it once, and `automatica11y` is on your `PATH`, with the short name `a11y` too:

```bash
npm i -g automatica11y
```

You can skip the install and put `npx` in front of every command instead, for example `npx automatica11y doctor`. `npx` fetches the tool the first time and checks the registry after that. A global install doesn't update itself, so run `npm i -g automatica11y@latest` to upgrade, and `automatica11y --version` to see what you have. These docs write the short form. Add `npx` if you didn't install it.

## Quick start.

```bash
automatica11y doctor
automatica11y audit https://example.com
automatica11y compare radix=npm:@radix-ui/react-dialog aria=npm:react-aria-components
```

`doctor` checks your setup. If it can't find a browser, it prints the command that installs one:

```bash
npx playwright-core install --only-shell chromium
```

Each run writes a folder (`./a11y-report` by default) with `report.md`, `results.json`, and `plan.json`. [Reading a report](reports.md) explains what's in them.

## Where to go next.

- [Targets](targets.md): what you can point it at, including one entry of an npm package.
- [What it checks](checks.md): the five tiers, and what each one can and can't see.
- [Options and exit codes](options.md): every flag, the exit codes, and how to use it in CI.
- [Reading a report](reports.md): coverage, statuses, and how much to trust each result.
- [npm packages and fixtures](npm-packages.md): how component libraries get tested.
- [Writing fixtures](fixtures.md): the contract for a fixture you write yourself.
- [Using it with an AI agent](agents.md): skills, `AGENTS.md`, and the guide commands.
- [The agent steps](agent-steps.md): the full steps an agent follows, word for word.
- [Limits](limits.md): what automated checks can't tell you.
