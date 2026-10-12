# AI {#quick-start-ai}

Automatica11y provides an evergreen bootstrap skill you can add to your agent of choice. Automatica11y cli bundles the latest version of the runner skill and its references, so every invocation is always compatible.

<<< ../skills/automatica11y/SKILL.md{skill}

Once the skill is installed in your agent you can prompt it with the same commands and flags that are available to the cli.

## Audit a web page

You can audit web pages, static html files, Storybooks, and npm packages. To audit a live web page, simply provide the URL.

```prompt
/automatica11y audit "https://iywahl.com/"
```

## Compare two packages

Automatica11y can compare two packages, even across different frameworks. It also supports versioning, sub-component exports, and aliases. Here's an example of comparing two different versions of a button from the same package:

```prompt
/automatica11y compare next-gen=npm:@instructure/ui-button/Button/v2 canvas=npm:@instructure/ui-buttons/Button/v1
```

The runner skill and references guide the Agent on how to write custom fixtures, how to interpret results, and how to turn the machine results (`report.json`) into a human-readable templated report.

See [Using it with an AI agent](/agents) for additional details.