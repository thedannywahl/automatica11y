# Plan: Angular support.

Status: proposed, revised October 9, 2026. **Angular 22 and newer.** Based on [the Angular spike](../notes/spike-angular.md), which showed that real Angular Material (versions 18 and 22) bundles with the tool's existing esbuild step and runs in the browser with no Angular linker and no TypeScript step. Angular becomes the fourth framework adapter, after React, Vue 3, and web components.

**Support floor: Angular 22.** Older Angular needs extra machinery (zone.js, an animations provider) that version 22 doesn't, and the spike showed 22 working with and without zone.js. A library whose peer range excludes 22 is reported as unsupported, with its range, the way Vue 2 is. Newer releases are covered by the weekly latest-dependencies job.

**Scope: every archetype.** Archetypes are the standard building blocks of HTML and ARIA patterns (button, link, dialog, menu, tabs, combobox, form-field, accordion, tooltip, live-region, and chart). They aren't a list of components. Angular support means each archetype can be tested on an Angular library, by an authored fixture, a template, or a generated fixture, with the same evidence labels as every other framework. Library names in this plan (Material, PrimeNG) are test subjects, never recipes.

## 1. What a fixture is, for Angular.

A fixture renders one archetype using the library under test. It marks the control a keyboard user presses with `data-a11y-trigger` and the surface that appears with `data-a11y-root`. The five tiers run against it. For Angular, a fixture is a plain JavaScript file that defines a standalone component by calling the `Component` decorator as a function (the spike ran this), with a template that uses the library:

```js
import { Component, inject } from "@angular/core";
import { DialogService, DialogContent } from "some-ui-kit/dialog";

class Fixture { dialog = inject(DialogService); open() { this.dialog.open(DialogContent); } }
Component({ selector: "app-fixture", standalone: true,
  template: `<button data-a11y-trigger type="button" (click)="open()">Open dialog</button>` })(Fixture);
export default Fixture;
```

A fixture comes from the first of these that applies:

1. **Authored.** A person or an agent writes it from the library's documentation. It works for every archetype from day one, because the tool doesn't care which archetype a fixture is for.
2. **Template.** The tool builds `button` and `link` from the export alone, because one element is enough to render them. For Angular the element and attributes come from the component's selector.
3. **Generated.** The tool builds candidates from the evidence discovery found, and keeps one only if the probe confirms it: one trigger, no errors, a root that appears with a fitting role.

## 2. What works already, and what doesn't.

Nothing in the browser, the five tiers, the probe, the marking code, the reports, sub-path targets, or the install and mapping flow knows about a framework. The adapter interface (`src/frameworks/`) was built for this. What's Angular-specific is the adapter itself and a few places that still say "React or Vue" in prose.

| Part | Angular needs |
|---|---|
| Detection | `@angular/core` as a peer dependency or dependency means `npm-angular`. It leaves the "unsupported framework" list. A custom elements manifest still wins, so Angular Elements packages stay web components. |
| Install | The runtime set, aligned to the installed `@angular/core`: `@angular/common`, `@angular/compiler`, `@angular/platform-browser`, and `rxjs`. Added when the peers left them out, and pinned so a loose install can't prune them. |
| Bundling | Plain esbuild. No linker, no TypeScript, no `ngDevMode` define. One copy of each `@angular/*` package, `rxjs`, and `zone.js` through aliases. |
| Mounting | An entry that loads the compiler first, then `zone.js` only if the library brought it in, then bootstraps the fixture with the fixture's own providers. |
| Discovery | Read each export's Ivy definition, and for services their methods. This is the evidence recipes use (see section 4). |
| Templates | Derived from selectors, not names: `button[matButton]` gives `<button matButton ...>`. |
| Generation | Recipes per archetype and per wiring pattern, over selectors, inputs, outputs, `exportAs`, and service methods. |
| Fixtures | Plain JavaScript that calls the `Component` decorator as a function. TypeScript with decorators later. |

## 3. Decisions I'd make, and why.

1. **The fixture is JavaScript, with the decorator called as a function.** No TypeScript transform, no decorator metadata. State and injection use `inject()` and signals, which need no constructor type metadata.
2. **The compiler runs in the browser.** It makes the bundle about 2.7 MB and costs about 100 ms of start-up. That's fine for a test harness, and it's the only way to avoid a build step.
3. **No zone.js unless a library asks for it.** Angular 22 runs without it (the spike ran 22 both with and without), so the install step doesn't add it. The entry imports `zone.js` only when a library peers on it and it's installed.
4. **No animations provider.** Angular 22 libraries don't need `provideNoopAnimations()`, and the `@angular/animations` package is deprecated in 22. A library that still needs it is an authored fixture that passes the provider in its `providers` export.
5. **Test the sub-path, not the root.** Most Angular libraries put components in secondary entry points. The "no rendering surface" message and the docs should say so, and list the sub-paths from the `exports` map.
6. **Support floor: Angular 22.** One version to support, test, and document. NgModule-based libraries still work, through a standalone fixture's `imports`.
7. **Dev dependencies, like React and Vue.** The Angular core set (about 50 MB installed) plus `@angular/material` and `@angular/cdk` (about 13 MB) for one integration test that proves the partly compiled path with a real library. Nothing ships in the package.
8. **Generation ships with the adapter, for all eight generatable archetypes.** Authored and template support land first inside the same release, and the recipes land behind them. The first release is the whole set.

## 4. The evidence discovery collects.

Discovery loads the compiler, imports the target, and for each export records what recipes need:

| Export is | Recorded |
|---|---|
| A component or directive | kind, every selector (as element and attributes), inputs (with their public names), outputs, `exportAs`, standalone |
| A service | its method names (`open`, `show`, `close`) |
| An NgModule | the declarations and exports it names, so a recipe can import the module |
| Anything else | ignored |

A selector comes in Ivy's array form (`[["button", "matButton", ""]]`). A small parser turns the simplest alternative into an element and attributes, and skips `:not()` forms. Inputs, outputs, and `exportAs` are what wire one part to another: an input named like its own attribute selector is a directive that takes a value on the host. An input whose name ends in `For` points at a template reference. A service with `open` shows something.

## 5. Phases.

Each phase ends with the full test suite and lint passing, and with a commit. The first release is phases 1 and 2 together.

### Phase 1: the adapter, the evidence, and the simple archetypes.

- **Detection.** Add an `angular` adapter with `detect(meta)`. Remove `@angular/core` from `OTHER_FRAMEWORKS` in `src/plan/resolve-npm.js`. A package whose peer range excludes 22 (for example `^20 || ^21`) is reported as unsupported with its range, like Vue 2.
- **Schema and registry.** `angular` in `FLAVORS`, `npm-angular` in `TARGET_KINDS`, an optional `angular` version in `results.npm`. The existing consistency test covers the registry.
- **Install** (`src/harness/npm-install.js`). Ensure the runtime set at the installed core's version, and extend `pinnedRuntime` to keep it. Return the Angular version.
- **A context from the install.** Add an optional `inspect(workDir)` to the adapter interface that returns what's installed (whether `zone.js` is there), and pass it to `entry(fixturePath, pkg, context)`. React, Vue, and web components ignore it. It's a small hook now, and it keeps the entry from guessing.
- **The entry.** Compiler first, then `zone.js` if a library brought it in, then `bootstrapApplication` with the fixture's own providers. It creates a host element in `#root` and reports a bootstrap failure on `window.__error`.
- **The fixture contract.** The default export is the component class. An optional `providers` export adds application providers, the same role `setup(app)` has for Vue. It marks trigger and root as everywhere.
- **Discovery** as in section 4, and the mapping's existing scoring works on class names (`MatButton`, `MatAnchor`).
- **Templates for button and link,** derived from selectors. A component with required inputs is a gap that names the input.
- **Authored fixtures for every archetype.** Tests write one authored fixture per archetype against fake libraries and run them in Chrome, so every archetype is proven to work with an Angular fixture before generation exists.
- **A better message when a package has no root components,** for every framework: list a few sub-paths from the `exports` map.
- **Bundling, report line, docs.** Aliases for each installed `@angular/*` package, `rxjs`, and `zone.js`. The report says "Angular (core 22.2.2)". Update the frameworks table, the runner skill (an Angular fixture example and the sub-path advice), the fixtures guide, and every "React, Vue 3, and web components" sentence.
- **Tests.** Angular dev dependencies, two fake libraries in plain JavaScript (one standalone, one NgModule-based), pure-function tests (selector parsing, version rules, entry text, pinning), real-browser tests, and one integration test against the real `@angular/material/button` sub-path.

### Phase 2: generated fixtures for every archetype.

Each archetype gets recipes per wiring pattern. Every candidate goes through the existing probe, so a wrong guess becomes a gap with a reason, not a wrong result.

| Archetype | Patterns |
|---|---|
| tooltip | A directive with a text input that matches its own attribute selector. The trigger is a plain `<button>` with the attribute. |
| live-region | A message component shown with `@if` when the trigger is pressed, a component with a visibility input, or a service with a `show` or `open` method. |
| form-field | A wrapper component with a label child and an input directive, a native `<input>` with a directive attribute and a `<label>`, or a component that is itself the field. |
| tabs | A group component with child tab components that take a `label` or `value` input, or a data-driven component with an items input. |
| accordion | A container with panel components and a header part, with a disclosure panel as the single-item case, or a data-driven component. |
| menu | A trigger directive with a `…For` input and a menu component with `exportAs` plus item parts, or a data-driven component with an items input. |
| combobox | An input directive linked to a panel component by template reference, with option parts, or a declarative component with a suggestions input. |
| dialog | A service with an `open` method and a small content component the recipe defines, a declarative component with a visibility input and a close output, or a trigger directive plus a template. |

- **Wiring for template references.** A recipe emits `#ref="exportAs"` on the part that owns it and passes `[input]="ref"` to the one that points at it. The pairs come from `…For`-style inputs and matching `exportAs` names, not from fixed names.
- **Data-driven patterns.** A recipe builds a small array for the items input and uses the simplest shape that the input name suggests (`label`, `value`). If the input's shape can't be inferred, it's a gap that names the input.
- **Marking.** The shared marking code works unchanged. The fixture starts it inside `NgZone.runOutsideAngular`, so its 50 ms polling doesn't trigger change detection.
- **Clear probe reasons for Angular's own errors.** A missing provider (`NG0201`, `NG0200`) becomes a reason such as "the library needs a provider the fixture doesn't give it", with the name Angular reports.
- **Attempt limit.** The existing limit of eight candidates per archetype applies, with the families ranked as for React and Vue.
- **Tests.** Fake libraries that implement each pattern in plain JavaScript, one good and one deliberately wrong per archetype (a menu with no role, a dialog service that never opens), so a candidate is proven to be rejected as well as accepted.

### Phase 3: real libraries on Angular 22.

- **Real libraries,** Material and CDK first, then PrimeNG, ng-bootstrap, Spartan UI, and Taiga UI. For each: what generated with no fixture, what needed an authored one, and what failed and why. Expect gaps. A library that needs global setup (a theme, a config provider, a locale) uses the `providers` export and the `install` mapping field.
- **Angular 22 and the one after.** Run the authored fixtures on 22.x now, and on the next release as soon as it's published, through the weekly job. The docs say "Angular 22 and newer."
- **Styles.** Theme CSS comes in through `install` and a CSS import in the fixture, as it did for the pantoken tokens. Add that case to the fixtures guide.
- **Weekly job.** Add the Angular set to `.github/workflows/latest-deps.yml`, so a release that breaks the private `ɵ` members discovery reads (`ɵcmp`, `ɵdir`, `ɵmod`, `ɵprov`) opens an issue before a user hits it.
- **Exit criteria.** A written compatibility table, and a real `compare` of two Angular libraries across several archetypes that I'd be willing to put in the docs.

### Phase 4: polish and release.

- **TypeScript fixtures.** Allow `fixtures/<id>/<archetype>.ts` with `@Component` decorators. esbuild strips the types, with `tsconfigRaw` set to `experimentalDecorators: true` and `useDefineForClassFields: false`. Own tests, because decorator semantics differ by version.
- **Error messages.** Plain sentences for the common bootstrap errors.
- **Zone.js either way.** Run the conditions checks with and without zone.js on a library that peers on it, and confirm the polling and animation settle behave the same.
- **Release.** A minor bump (0.5.0), the runner skill's series moves with it (`0.4.x` to `0.5.x`), and the docs site rebuilds.

## 6. Risks.

| Risk | Likelihood | What reduces it |
|---|---|---|
| The `ɵ` members that discovery reads change in a new Angular release. | Medium. They're private, and have been stable for years. | Read defensively and fall back to "unknown kind". The weekly latest-deps job. Pinned test versions. |
| Many libraries haven't moved to 22 yet, so the first evaluations have a short list. | High for the next few months. | Say so in the docs, report the range the library does allow, and let a person use an authored fixture on a newer-peered fork. |
| Runtime JIT differs from the library's AOT behavior. | Low to medium. | Say so in the report's method note. Compare against a Storybook build for the first real libraries. |
| Libraries that need app-level configuration have no generated fixture that works. | High. | Authored fixtures with the `providers` export, and a clear gap reason. A generated fixture is never presented as more than a guess. |
| Data-driven components with inputs of unknown shape. | High. | Infer from the input name, and otherwise report a gap that names the input. |
| Template-reference wiring picks the wrong pair. | Medium. | The probe confirms a root with a fitting role before a candidate counts. |
| Generation recipes produce false results because the wiring is wrong. | Medium. | The same labeling as every generated fixture (lower evidence, source written to `generated/`), and the probe. |
| Bundle size and start-up make slow tests. | Low. The spike was 223 ms to build and about 120 ms to bootstrap. | Re-measure in phase 3 with a larger library. |

## 7. Test and dependency cost.

Dev dependencies grow by the Angular core set (about 50 MB installed) and, for the integration test, `@angular/material` and `@angular/cdk` (about 13 MB), against 301 MB total today. CI install time grows by a few seconds. Nothing ships in the package. Each phase adds roughly 15 to 40 tests. Pure functions (selector parsing, version rules, the entry text, recipe text) run without a browser, and the rest run in Chrome and skip when it's missing.

## 8. Sizing.

My estimate, as focused sessions, not calendar time: phase 1 is two, phase 2 is two to three, phase 3 is one (one version to test, and mostly waiting on real libraries to surprise us), and phase 4 is one. The spike removed the biggest unknown, which was whether the runtime compiler would work at all.

## 9. Still open.

1. **Priority libraries,** as proof that the generic adapter works, never as special cases. Which Angular libraries matter most to you? I'd start with Material and CDK, then PrimeNG and Spartan UI. The rule for all of them: a failure is fixed with a general pattern or left as a gap, never with a rule that names the library.

Decided: Angular 22 and newer.

## 10. Phase 1 notes (October 9, 2026).

Done: detection by peer range (floor 22), install with every top-level package pinned (a loose install otherwise prunes peer-only packages such as the CDK), the entry with the runtime compiler first and zone.js only when a library brought it, discovery that records one entry per exported name (aliases such as `MatButton` and `MatAnchor` are one class), selector-derived button and link templates (module import for non-standalone classes), sub-path hints, and the unsupported message that names the range. Tests: `test/angular.test.js` runs fake libraries (`fake-ng-ui` for all archetypes, `fake-ng-modules`, `fake-ng-old`, `fake-ng-split`) and the real `@angular/material/button`. Authored fixtures pass for dialog, menu, tabs, accordion, combobox, form-field, tooltip, and live-region.

Phase 2 (generated fixtures) is in `src/harness/generate/angular-recipes.js`: selector and `exportAs` driven recipes for all eight generatable archetypes, probed like React and Vue. The fake library `fake-ng-ui` generates all eight, `fake-ng-wrong` shows a bad menu and a dead dialog service are rejected, and the real Material menu, dialog, tabs, and expansion panel generate. Known gaps on Material: the tooltip is aria-hidden with its role on a hidden description (a true finding, so a gap), and the autocomplete and form field need parts from other entry points (`MatOption`, `MatInput`), which a one-target run can't import. The probe now retries a tooltip with keyboard focus, because some libraries ignore programmatic focus.

Not done: `libA11y` for Angular fixtures, TypeScript fixtures.

## 11. Phase 3 notes (October 9, 2026).

Real libraries on Angular 22, run through the tool with no library-specific code (the same selector and `exportAs` recipes):

| Library | Generated | Gap, and why |
|---|---|---|
| Angular Material | menu, dialog, tabs, accordion | tooltip (the visible tooltip is `aria-hidden`), autocomplete and form field (need `MatOption` and `MatInput` from other entry points) |
| CDK | menu, dialog | not tried further |
| PrimeNG | dialog, tabs, accordion, form field, button template | menu, tooltip, autocomplete (a role isn't set or the parts don't assemble); message isn't matched by the live-region name pattern |
| Spartan (brain) | dialog, tabs, accordion | not tried further |
| Angular Aria | menu, tabs | accordion and combobox need providers from parent parts |

What those runs changed in the recipes: parts that keep their own element (`mat-tab`, `p-button`), a list part between a container and its children (`TabList`), header, trigger, and content parts for accordions (the header becomes a heading), a value carried on a directive's own attribute (`brnTabsTrigger="One"`), and pointer inputs named `menu` or `panel`. TypeScript fixtures (`.ts`, legacy decorators, `inject()` only) and plain sentences for Angular errors NG0200, NG0201, NG0303, NG0304, NG05105 are phase 4 work. Zone.js is verified: `fake-ng-zone` peers on zone.js (a dev dependency here), the entry loads it, and button, dialog, menu, and live-region give the same statuses, states, interaction checks, and conditions checks as the same library without it. The release bump (0.5.0, and the runner series `0.5.x`) is left to the person who publishes.

The weekly latest-dependencies job now installs the latest Angular, CDK, and Material.
