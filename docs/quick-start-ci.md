# CI/CD {#quick-start-ci}

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