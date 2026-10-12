# CLI Quick Start

The [automatica11y](https://www.npmjs.com/package/automatica11y) npm package provides everything needed to run from the command line.

## Requirements

<ul style="list-style-type: none;">
  <li><span class="instui-icon -icon-nodedotjs" aria-hidden="true"></span> Node 20 or newer</li>
  <li><span class="instui-icon -icon-googlechrome" aria-hidden="true"></span> Chrome or Chromium</li>
</ul>

## Installation

You can install `automatica11y` and run it as a linked node.js binary, or you can invoke it with your package manager's script runner.

### Invocation

The preferred method of running `automatica11y` is to use your package manager's script runner and directly invoke the script. This prevents  drift and allows you to always use the latest version.

| Package manager | Command |
|---|---|
| Vite Plus | `vpx automatica11y audit ./dist` |
| pnpm | `pnpm dlx automatica11y audit ./dist` |
| bun | `bunx automatica11y audit ./dist` |
| npm | `npx -y automatica11y audit ./dist` |
| deno | `deno run npm:automatica11y audit ./dist` |
| yarn | `yarn dlx automatica11y audit ./dist` |

### Global install

A global install doesn't update itself, so run `npm i -g automatica11y@latest` (or whichever package manager you use) to upgrade and `automatica11y --version` to see what you have.

Install it once with `npm i -g automatica11y`; Make sure that `automatica11y` is on your `$PATH` and then run:

deno install -g -A npm:automatica11y
| Package manager | Command |
|---|---|
| Vite Plus | `vp install -g automatica11y` |
| pnpm | `pnpm add -g automatica11y` |
| bun | `bun add -g automatica11y` |
| npm | `npm i -g automatica11y` |
| deno | `deno install -g -A npm:automatica11y` |
| yarn | Yarn v2 has no `global` command; use `yarn dlx automatica11y <command>`. |

### Alias

When you install `automatica11y` it also provides an alias `a11y` with the exact same functionality.

```bash
a11y audit ./dist
```

## Commands

`automatica11y` includes three main commands: `audit`, `compare`, and `doctor`.

### `audit` command

The `audit` command takes an input which can be a static file or folder, a live website, an npm package, or a Storybook. `audit` knows how to install, build, and test npm packages that have a UI including: html, web components, React, Svelte, Vue, and Angular.

vpx automatica11y audit ./path/to/file.html
pnpm dlx automatica11y audit ./path/to/file.html
bunx automatica11y audit ./path/to/file.html
npx -y automatica11y audit ./path/to/file.html
deno run npm:automatica11y audit ./path/to/file.html
yarn dlx automatica11y audit ./path/to/file.html
| Package manager | Command |
|---|---|
| Vite Plus | `vpx automatica11y audit ./path/to/file.html` |
| pnpm | `pnpm dlx automatica11y audit ./path/to/file.html` |
| bun | `bunx automatica11y audit ./path/to/file.html` |
| npm | `npx -y automatica11y audit ./path/to/file.html` |
| deno | `deno run npm:automatica11y audit ./path/to/file.html` |
| yarn | `yarn dlx automatica11y audit ./path/to/file.html` |

You can also use `check` as an alias for `audit`. The audit will generate a `plan.json`, `mappings.json`, and when it's complete it will save `results.json` (machine readable) and `report.md` (human readable) in `./a11y-report`.

### `compare` command

deno run automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
yarn dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
The `compare` command performs two or more audits and provides a comparative report. You can compare across multiple sources and frameworks.

| Package manager | Command |
|---|---|
| Vite Plus | `vpx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |
| pnpm | `pnpm dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |
| bun | `bunx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |
| npm | `npx -y automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |
| deno | `deno run automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |
| yarn | `yarn dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons` |

### `doctor` command

deno run automatica11y doctor
yarn dlx automatica11y doctor
`doctor` checks your setup to make sure your system meets the [requirements](#requirements). If it can't find a browser, it prints the command to install one.

| Package manager | Command |
|---|---|
| Vite Plus | `vpx automatica11y doctor` |
| pnpm | `pnpm dlx automatica11y doctor` |
| bun | `bunx automatica11y doctor` |
| npm | `npx -y automatica11y doctor` |
| deno | `deno run automatica11y doctor` |
| yarn | `yarn dlx automatica11y doctor` |

Each run writes `report.md`, `results.json`, and `plan.json` to `./a11y-report` by default. [Read a report](/reports) to understand the results.