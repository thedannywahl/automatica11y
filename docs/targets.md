# Targets.

A target is `[label=]<spec>`. The label is optional, and names the target in the report.

| Target | Spec |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder, so `dist` means `./dist`. Prefixes `../`, `/`, `~`, and `file:` work too. |
| A Storybook | Its URL, or a local folder with `index.json` or `stories.json`. |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. Add a sub-path to test one entry of a package: `npm:@scope/pkg/button` or `npm:@scope/pkg@1.2.3/button/v2`. React, Vue 3, and web component libraries work. |

A bare word such as `button` is a path: the folder or file `./button`. Write `npm:button` to pick the package. The prefix is what chooses a package, so a folder with the same name never gets in the way. A bare word that isn't a path fails with a hint, such as "If you meant the npm package, write npm:react."

A local `.html` file is served over `http://localhost`, never `file://`. A static site audits its `index.html` only.

## Evidence levels.

A page target gives **page** evidence: the whole page is tested, and the interaction and computed tiers say "not applicable", because a page carries no trigger to press. An npm package gives **component** evidence: each archetype runs from a fixture that marks the control to exercise. A comparison that mixes the two opens with a warning, because the evidence isn't equivalent.

## Sub-paths of an npm package.

`npm:name[@version][/sub/path]` tests one entry of a package, such as `npm:@scope/ui-buttons/button` or `npm:@scope/ui-buttons@11.7.8/button/v2`. That lets you compare two versions of a component side by side:

```bash
automatica11y compare v1=npm:@scope/ui-buttons/button v2=npm:@scope/ui-buttons/button/v2
```

The sub-path is what a person would import (`import ... from "@scope/pkg/button"`), and it has to be something the package exports. The version stops at the first slash, and a sub-path can't contain empty parts, `.`, `..`, or backslashes. Capital letters are fine.

The tool checks the sub-path twice. At plan time it reads the registry's `exports` field, so `--plan` rejects a wrong sub-path before anything installs. After the install it checks the package's own `package.json`, and a package with no exports map is checked against its files. A wrong sub-path names the package and version, suggests the closest exports, and lists what the package offers.
