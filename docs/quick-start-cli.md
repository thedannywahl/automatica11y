# CLI Quick Start

The [automatica11y](https://www.npmjs.com/package/automatica11y) npm package provides everything needed to run from the command line.

## Requirements

<ul style="list-style-type: none;">
  <li><span class="instui-icon -icon-nodedotjs" aria-hidden="true"></span> Node 20 or newer</li>
  <li><span class="instui-icon -icon-googlechrome" aria-hidden="true"></span> A recent Chrome or Chromium (within two major versions of the one Playwright ships)</li>
</ul>

## Installation

You can install `automatica11y` and run it as a linked node.js binary, or you can invoke it with your package manager's script runner.

### Invocation

The preferred method of running `automatica11y` is to use your package manager's script runner and directly invoke the script. This prevents  drift and allows you to always use the latest version.

::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vpx automatica11y audit ./dist
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm dlx automatica11y audit ./dist
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bunx automatica11y audit ./dist
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npx -y automatica11y audit ./dist
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno run npm:automatica11y audit ./dist
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
yarn dlx automatica11y audit ./dist
```

:::

### Global install

A global install doesn't update itself, so run `npm i -g automatica11y@latest` (or whichever package manager you use) to upgrade and `automatica11y --version` to see what you have.

Install it once with `npm i -g automatica11y`; Make sure that `automatica11y` is on your `$PATH` and then run:

::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vp install -g automatica11y
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm add -g automatica11y
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bun add -g automatica11y
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npm i -g automatica11y
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno install -g -A npm:automatica11y
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
# Yarn v2 has no `global` command; use `yarn dlx automatica11y <command>`.
yarn dlx automatica11y <command>
```

:::

### Alias

When you install `automatica11y` it also provides an alias `a11y` with the exact same functionality.

```bash
a11y audit ./dist
```

## Commands

`automatica11y` includes three main commands: `audit`, `compare`, and `doctor`.

### `audit` command

The `audit` command takes an input which can be a static file or folder, a live website, an npm package, or a Storybook. `audit` knows how to install, build, and test npm packages that have a UI including: html, web components, React, Svelte, Vue, and Angular.

::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vpx automatica11y audit ./path/to/file.html
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm dlx automatica11y audit ./path/to/file.html
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bunx automatica11y audit ./path/to/file.html
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npx -y automatica11y audit ./path/to/file.html
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno run npm:automatica11y audit ./path/to/file.html
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
yarn dlx automatica11y audit ./path/to/file.html
```

:::

You can also use `check` as an alias for `audit`. The audit will generate a `plan.json`, `mappings.json`, and when it's complete it will save `results.json` (machine readable) and `report.md` (human readable) in `./a11y-report`.

To audit built packages in a workspace, build them first and map each npm package to its output directory:

```bash
automatica11y ci ui=npm:@scope/components,@scope/interactions \
  --local-package @scope/components=./packages/components/dist \
  --local-package @scope/interactions=./packages/interactions/dist
```

Use the same package-name-to-path mapping in root-level `.automatica11y.yml` for repeatable CI runs.

### `compare` command

deno run automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
yarn dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
The `compare` command performs two or more audits and provides a comparative report. You can compare across multiple sources and frameworks.

::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vpx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bunx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npx -y automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno run automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
yarn dlx automatica11y compare npm:react-aria-components npm:@instructure/ui-buttons
```

:::

### `doctor` command

yarn dlx automatica11y doctor
`doctor` checks your setup to make sure your system meets the [requirements](#requirements). If it can't find a browser, it prints the command to install one. If the browser is too old, it tells you to update it. Add `--install-browser` to download Chromium when the check fails.

::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vpx automatica11y doctor
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm dlx automatica11y doctor
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bunx automatica11y doctor
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npx -y automatica11y doctor
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno run automatica11y doctor
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
yarn dlx automatica11y doctor
```

:::

Each run writes `report.md`, `results.json`, and `plan.json` to `./a11y-report` by default. [Read a report](/reports) to understand the results.