
# Targets.

For multiple pages within one site, see [site discovery](site-discovery.md): opt-in sitemap and rendered-link crawling, bounded scope, trusted authentication hooks and native crawl statistics..

## Auditing local workspace packages.

Build the package first, then map its package name to the directory that contains its built `package.json`, or to a packed `.tgz` file. The mapping applies to primary and companion packages by exact package name. Unmapped packages continue to resolve from npm; a mapped path or package identity error fails instead of falling back to the registry.

```bash
automatica11y audit ui=npm:@scope/components,@scope/interactions \
  --local-package @scope/components=./packages/components/dist \
  --local-package @scope/interactions=./packages/interactions/dist \
  --plan
automatica11y audit ui=npm:@scope/components,@scope/interactions \
  --local-package @scope/components=./packages/components/dist \
  --local-package @scope/interactions=./packages/interactions/dist
```

`--plan` reads local package metadata without installing packages or launching a browser. It reports each mapped package's resolved path and version. A requested npm version must exactly match the local package version. Relative paths use the command working directory.

For CI, the same mapping can be checked in as root-level YAML:

```yaml
version: 1
targets:
  - ui=npm:@scope/components,@scope/interactions
localPackages:
  "@scope/components": ./packages/components/dist
  "@scope/interactions": ./packages/interactions/dist
```
A target is `[label=]<spec>`. The label is optional, and names the target in the report.

| Target | Spec |
|---|---|
| A live page | `https://example.com/page` |
| A local page or site | `./page.html` or `./dist`. A path with no prefix is relative to the working folder, so `dist` means `./dist`. Prefixes `../`, `/`, `~`, and `file:` work too. |
| A Storybook | Its URL, or a local folder with `index.json` or `stories.json`. |
| An npm package | `npm:name`, `npm:@scope/name`, or `npm:name@version`. Add a sub-path to test one entry of a package: `npm:@scope/pkg/button` or `npm:@scope/pkg@1.2.3/button/v2`. React, Vue 3, Angular 22 and newer, Svelte 5 and newer, plain HTML, and web component libraries work. A library that ships in pieces is one target: join the packages with commas and no spaces, `npm:@scope/components,@scope/interactions`. The first is the primary and names the target, and the others install beside it into the same folder. |

A bare word such as `button` is a path: the folder or file `./button`. Write `npm:button` to pick the package. The prefix is what chooses a package, so a folder with the same name never gets in the way. A bare word that isn't a path fails with a hint, such as "If you meant the npm package, write npm:react."

A local `.html` file is served over `http://localhost`, never `file://`. A static site audits its `index.html` only.

## Comparing libraries that come in pieces.

Targets are separated by spaces. Packages inside one target are separated by commas, with no spaces. This compares a design system's plain HTML build (a stylesheet package and a script package) with its React build and its web component build:

```bash
automatica11y compare \
  pantoken-html=npm:@pantoken/components,@pantoken/interactions \
  instui=npm:@instructure/ui \
  pantoken-wc=npm:@pantoken/web-components
```

An agent reading "compare A, B and C and D" treats the comma as joining packages and "and" as separating targets, so that is three targets: `A,B`, `C`, and `D`. It shows that grouping and asks you to confirm it when the sentence could be read another way.

## Evidence levels.

A page target gives **page** evidence: the whole page is tested, and the interaction and computed tiers say "not applicable", because a page carries no trigger to press. An npm package gives **component** evidence: each archetype runs from a fixture that marks the control to exercise. A comparison that mixes the two opens with a warning, because the evidence isn't equivalent.

## Sub-paths of an npm package.

`npm:name[@version][/sub/path]` tests one entry of a package, such as `npm:@scope/ui-buttons/button` or `npm:@scope/ui-buttons@11.7.8/button/v2`. That lets you compare two versions of a component side by side:

```bash
automatica11y compare v1=npm:@scope/ui-buttons/button v2=npm:@scope/ui-buttons/button/v2
```

The sub-path is what a person would import (`import ... from "@scope/pkg/button"`), and it has to be something the package exports. The version stops at the first slash, and a sub-path can't contain empty parts, `.`, `..`, or backslashes. Capital letters are fine.

The tool checks the sub-path twice. At plan time it reads the registry's `exports` field, so `--plan` rejects a wrong sub-path before anything installs. After the install it checks the package's own `package.json`, and a package with no exports map is checked against its files. A wrong sub-path names the package and version, suggests the closest exports, and lists what the package offers.

For a package with no exports map, a directory uses its `index.js`, `index.mjs`, or `index.cjs` entry. For example, `npm:@instructure/ui-buttons/es/Button/v1/` and `npm:@instructure/ui-buttons/es/Button/v1/index.js` test the same entry. A directory without an index fails and lists available entries at that path, when present.
