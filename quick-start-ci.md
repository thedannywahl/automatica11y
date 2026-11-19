---
url: /quick-start-ci.md
---
# CI/CD {#quick-start-ci}

Using `automatica11y` in your CI/CD pipeline can be done using the `ci` command, or by using the provided Github Action.

### `ci` command

The `ci` command provides a wrapper around the `audit` command and provides a number of non-zero exit codes to help inform what failed.

deno run automatica11y ci ./dist
yarn dlx automatica11y ci ./dist
::: code-group

```bash [<span class="instui-icon -icon-vite-plus" aria-hidden="true"></span> vp]
vpx automatica11y ci ./dist
```

```bash [<span class="instui-icon -icon-pnpm" aria-hidden="true"></span> pnpm]
pnpm dlx automatica11y ci ./dist
```

```bash [<span class="instui-icon -icon-bun" aria-hidden="true"></span> bun]
bunx automatica11y ci ./dist
```

```bash [<span class="instui-icon -icon-npm" aria-hidden="true"></span> npm]
npx -y automatica11y ci ./dist
```

```bash [<span class="instui-icon -icon-deno" aria-hidden="true"></span> deno]
deno run automatica11y ci ./dist
```

```bash [<span class="instui-icon -icon-yarn" aria-hidden="true"></span> yarn]
yarn dlx automatica11y ci ./dist
```

:::

To audit packages built from the current workspace, build them first and map each package name to its output directory:

```bash
automatica11y ci ui=npm:@scope/components,@scope/interactions \
  --local-package @scope/components=./packages/components/dist \
  --local-package @scope/interactions=./packages/interactions/dist
```

For the GitHub Action, pass one mapping per line with `local-packages`:

```yaml
- uses: thedannywahl/automatica11y
  with:
    targets: ui=npm:@scope/components,@scope/interactions
    local-packages: |
      @scope/components=./packages/components/dist
      @scope/interactions=./packages/interactions/dist
```

Alternatively, set `localPackages` in `.automatica11y.yml` as in [Targets](/targets#auditing-local-workspace-packages).

The CI command fails (non-zero exit code) on serious-or-higher axe violations, IBM Toolkit level 1 violations, and incomplete execution or coverage by default. All policies are configurable. See [Options](/options#exit-codes) for more details.

## Github Action

For GitHub Actions on Ubuntu, use the reusable action, which installs the tool and Chromium and uploads the reports for review:

```yaml
- uses: thedannywahl/automatica11y
  with:
    targets: ./dist
```

See [Github Action](/github-action) for more details.
