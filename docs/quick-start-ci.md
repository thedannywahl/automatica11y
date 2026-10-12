# CI/CD {#quick-start-ci}

Using `automatica11y` in your CI/CD pipeline can be done using the `ci` command, or by using the provided Github Action.

### `ci` command

The `ci` command provides a wrapper around the `audit` command and provides a number of non-zero exit codes to help inform what failed.

vpx automatica11y ci ./dist
pnpm dlx automatica11y ci ./dist
bunx automatica11y ci ./dist
npx -y automatica11y ci ./dist
deno run automatica11y ci ./dist
yarn dlx automatica11y ci ./dist
| Package manager | Command |
|---|---|
| Vite Plus | `vpx automatica11y ci ./dist` |
| pnpm | `pnpm dlx automatica11y ci ./dist` |
| bun | `bunx automatica11y ci ./dist` |
| npm | `npx -y automatica11y ci ./dist` |
| deno | `deno run automatica11y ci ./dist` |
| yarn | `yarn dlx automatica11y ci ./dist` |

The CI command fails (non-zero exit code) on serious-or-higher axe violations, IBM Toolkit level 1 violations, and incomplete execution or coverage by default. All policies are configurable. See [Options](/options#exit-codes) for more details.

## Github Action

For GitHub Actions on Ubuntu, use the reusable action, which installs the tool and Chromium and uploads the reports for review:

```yaml
- uses: thedannywahl/automatica11y
  with:
    targets: ./dist
```

See [Github Action](/github-action) for more details.