# Plan: Angular support.

Status: proposed. Based on [the Angular spike](../notes/spike-angular.md), which showed that real Angular Material (versions 18 and 22) bundles with the tool's existing esbuild step and runs in the browser with no Angular linker and no TypeScript step. Angular becomes the fourth framework adapter, after React, Vue 3, and web components.

## 1. What works already, and what doesn't.

Nothing in the browser, the five tiers, the probe, the marking code, the reports, sub-path targets, or the install and mapping flow knows about a framework. The adapter interface (`src/frameworks/`) was built for this. What's Angular-specific is the adapter itself and a few places that still say "React or Vue" in prose.

| Part | Angular needs |
|---|---|
| Detection | `@angular/core` as a peer dependency or dependency means `npm-angular`. It leaves the "unsupported framework" list. A custom elements manifest still wins, so Angular Elements packages stay web components. |
| Install | The runtime set, aligned to the installed `@angular/core`: `@angular/common`, `@angular/compiler`, `@angular/platform-browser`, `rxjs`, and `zone.js` when the version needs it. Added when the peers left them out, and pinned so a loose install can't prune them. |
| Bundling | Plain esbuild. No linker, no TypeScript, no `ngDevMode` define. One copy of each `@angular/*` package, `rxjs`, and `zone.js` through aliases, so a fixture that imports shared local files can't load a second copy. |
| Mounting | An entry that loads the compiler first, then `zone.js` when installed, then bootstraps the fixture component with the providers the version needs. |
| Discovery | Read each export's Ivy definition: kind, selectors, inputs, `exportAs`, standalone. |
| Templates | Derived from selectors, not from names: `button[matButton]` gives `<button matButton ...>`. |
| Generation | Recipes built on selectors, inputs, and `exportAs`. Later phase. |
| Fixtures | Plain JavaScript that calls the `Component` decorator as a function. TypeScript with decorators later. |

## 2. Decisions I'd make, and why.

1. **The fixture is JavaScript, with the decorator called as a function.** It needs no TypeScript transform and no decorator metadata. `Component({...})(Fixture)` is what the decorator compiles to, and the spike ran it. State and injection use `inject()` and signals, which need no constructor type metadata.
2. **The compiler runs in the browser.** It makes the bundle about 2.7 MB and costs about 100 ms of start-up. That's fine for a test harness, and it's the only way to avoid a build step.
3. **Zone.js follows what's installed, not a guess.** The entry imports `zone.js` when it's installed. The install step adds it for older Angular versions and whenever a library peers on it. The spike ran 18 with zone.js, and 22 both with and without it. The exact version where zone.js stops being needed isn't known yet, and the version matrix in phase 3 settles it.
4. **Add `provideNoopAnimations()` when `@angular/animations` is installed.** It's needed on 18, harmless on 22, and it makes motion deterministic for the checks. The entry reads what's installed, so it doesn't hard-code a version.
5. **Test the sub-path, not the root.** Material, CDK, PrimeNG, and most Angular libraries put components in secondary entry points. The docs and the "no rendering surface" message should say so, and list the sub-paths from the `exports` map.
6. **Support floor: Angular 15.** Standalone components arrived in 14 and stabilized in 15, and NgModule libraries work through a standalone fixture's `imports`. The floor is confirmed by a version matrix in phase 3, not assumed.

## 3. Phases.

Each phase ends with the full test suite and lint passing, and with a commit that can ship.

### Phase 1: the adapter, authored fixtures, and button and link templates.

The smallest thing that's useful: a person (or an agent) can write a fixture for an Angular library and get every tier.

- **Detection.** Add an `angular` adapter with `detect(meta)`. Remove `@angular/core` from `OTHER_FRAMEWORKS` in `src/plan/resolve-npm.js`. Return `npm-angular` with the reason "The package lists @angular/core as a peer dependency." A package whose range excludes every supported major is reported with its range, like Vue 2.
- **Schema and registry.** Add `angular` to `FLAVORS`, `npm-angular` to `TARGET_KINDS`, and an optional `angular` version string to `results.npm`. Register the adapter in `src/frameworks/index.js`. The existing consistency test then covers it.
- **Install** (`src/harness/npm-install.js`). After the package installs, ensure the runtime set. Take the installed `@angular/core` version and install matching versions of `@angular/common`, `@angular/compiler`, and `@angular/platform-browser`, plus `rxjs` and `zone.js` as needed. Extend `pinnedRuntime` to keep all of them. Return the Angular version and a record of what's installed.
- **A context from the install.** The adapter's `entry` needs to know what's installed (zone.js, animations, major version). Add an optional `inspect(workDir)` to the adapter interface that returns those facts, and pass the result to `entry(fixturePath, pkg, context)`. React, Vue, and web components ignore it.
- **The entry.** Compiler first, then `zone.js` if installed, then `bootstrapApplication` with `provideNoopAnimations()` when animations are installed. Create a host element for the fixture's selector in `#root`. Report a bootstrap failure on `window.__error` so a failure says why.
- **The fixture contract.** The default export is the component class, with its `selector` optional (the entry reads it from the compiled definition, or sets one). An optional `providers` export adds application providers, the same role `setup(app)` has for Vue. A fixture marks its trigger and root with `data-a11y-trigger` and `data-a11y-root`, as everywhere.
- **Discovery.** `discoverEntry` loads the compiler, imports the target, and lists each export with its kind, selectors, inputs, `exportAs`, and standalone flag. The mapping already takes `exports`, so the existing scoring works on class names (`MatButton`, `MatAnchor`).
- **Templates for button and link.** Parse the chosen export's selector (Ivy's array form) into an element and attributes, and write `<tag attrs data-a11y-trigger data-a11y-root>Save</tag>` with the class in `imports`. Skip selectors with `:not()` parts. Prefer the simplest alternative. A component with required inputs is a gap that says which input.
- **Bundling.** The adapter's `bundle(workDir)` returns aliases for each installed `@angular/*` package, `rxjs`, and `zone.js`, and no defines.
- **Report.** `describe` says "Angular (core 22.2.2)".
- **A better message when a package has no root components.** When discovery finds no components and the package's `exports` lists sub-paths, say so and list a few: "Its components are in sub-paths such as `@angular/material/button`." This helps every framework, not just Angular.
- **Tests.** Add Angular packages as dev dependencies, the way Vue was added (`@angular/core`, `common`, `compiler`, `platform-browser`, `forms`, `rxjs`, `zone.js`). Write two fake libraries in plain JavaScript that define components by calling `Component` (one standalone, one NgModule-based) with selector-based templates and a trigger. Cover detection, install pinning, the entry for each combination (zone or not, animations or not), discovery output, template derivation from selectors, an authored fixture in a real browser, and the "wrong selector" gap. Add one integration test against the real `@angular/material/button` sub-path, to prove the partial-declaration path.
- **Docs.** Add Angular to the frameworks table, the runner skill (an Angular example fixture and the sub-path advice), and the fixtures guide. Update every "React, Vue 3, and web components" sentence, and the unsupported-framework wording.
- **Exit criteria.** `npx automatica11y audit npm:@angular/material/button` runs the button template through all five tiers. An authored fixture for a Material menu runs the interaction checks. Both are checked on a real run, not just in tests.

### Phase 2: generated fixtures from selectors, inputs, and `exportAs`.

Angular has no compound parts to match by name. It has selectors, inputs, and template references. The recipes read those.

- **Tooltip.** A directive whose name fits the tooltip pattern and whose input matches its own attribute selector (`matTooltip`). Template: `<button data-a11y-trigger matTooltip="Saves your work.">Save</button>`.
- **Menu.** A trigger directive with a `…For` input (`matMenuTriggerFor`), a menu component with an `exportAs`, and an item component or directive. Template: the trigger button with `[xTriggerFor]="m"`, then `<menu-selector #m="exportAs">` with two items.
- **Tabs and accordion.** Components found by name and selector, wired by their inputs (a `label` input on a tab). These are the least certain, and each candidate is probed like any generated fixture.
- **Dialog.** A service whose name fits the dialog pattern and which has an `open` method. The recipe defines a small content component and calls `inject(Service).open(Content)` from the trigger's click handler. The spike showed the shape works.
- **Form field.** A wrapper component with a label child and an input directive, or a label wired to a native `<input>` with a directive attribute. Highest risk. Ship it only if real libraries confirm the pattern.
- **Everything goes through the existing probe.** A candidate must bundle, bootstrap, show one trigger, and show a root with a fitting role. Angular adds one failure message worth a clear sentence: a missing provider (`NG05105`, `NG0201`), which the probe turns into a reason such as "the library needs the animations provider" or "needs an `@angular/forms` import."
- **Marking.** The shared marking code works unchanged. The fixture starts it outside Angular's zone (`NgZone.runOutsideAngular`) so its 50 ms polling doesn't trigger change detection.
- **Exit criteria.** Without any fixture written, `compare` on `@angular/material/menu`, `/tooltip`, and `/dialog` produces generated results marked as such, and the report says what was tried for anything that fell back to a gap.

### Phase 3: real libraries and a version matrix.

- **Real libraries.** Material and CDK first, then PrimeNG, ng-bootstrap, Spartan UI, and Taiga UI. For each, record what worked with no fixture, what needed an authored one, and what failed and why. Expect gaps. A library that needs global setup (a theme, a config provider, a locale) uses the same `providers` export and `install` mapping field that Vue's `setup(app)` and companion packages use.
- **Version matrix.** Run the same authored fixtures on Angular 15, 16, 17, 18, 19, 20, 21, and 22 with a library of the same era. Record the floor and any provider differences. The result goes in the docs as the supported range, and in the adapter's `detect` as the unsupported-range message.
- **Styles.** Theme CSS (Material's prebuilt themes) comes in through `install` and a CSS import in the fixture, as it did for the pantoken tokens. Add that case to the fixtures guide.
- **Weekly job.** Add the Angular set to `.github/workflows/latest-deps.yml`, so a new Angular release that breaks the private `ɵ` members discovery reads (`ɵcmp`, `ɵdir`, `ɵmod`) opens an issue before a user hits it.
- **Exit criteria.** A written compatibility table, and a real `compare` of two Angular libraries' buttons and menus that I'd be willing to put in the docs.

### Phase 4: polish.

- **TypeScript fixtures.** Allow `fixtures/<id>/<archetype>.ts` with `@Component` decorators. esbuild strips the types. It needs `tsconfigRaw` with `experimentalDecorators: true` and `useDefineForClassFields: false`. Add `ts` to the adapter's accepted extensions and the fixtures lookup. Keep it behind its own test, because decorator semantics differ by Angular version.
- **Error messages.** Turn the common Angular bootstrap errors into plain sentences in the gap reason.
- **Zoneless checks.** On 21 and later, run the conditions checks once with zone.js and once without, to be sure the polling and the animation settle behave the same.
- **Report wording.** Make sure the generated-fixture note and the page-versus-component warning read correctly for Angular targets.
- **Release.** A minor bump (the runner skill's series moves with it, for example `0.4.x` to `0.5.x`), a changelog line, and the docs site rebuild.

## 4. Risks.

| Risk | Likelihood | What reduces it |
|---|---|---|
| The `ɵ` members that discovery reads change in a new Angular release. | Medium. They're private, and have been stable for years. | Read defensively and fall back to "unknown kind". Run the weekly latest-deps job. Pin the test versions. |
| Runtime JIT differs from the library's AOT behavior (for example, tree-shaken providers). | Low to medium. | Say in the report's method note that Angular runs through the runtime compiler. Compare against a Storybook build for the first real libraries. |
| Libraries that need app-level configuration have no generated fixture that works. | High. | Authored fixtures with the `providers` export, and a clear gap reason. Don't pretend a generated one is right. |
| Bundle size and start-up make slow tests. | Low. The spike was 223 ms to build and about 120 ms to bootstrap. | None needed now. Re-measure in phase 3 with a larger library. |
| Peer dependency ranges on older libraries pick an old Angular that needs an older Node or TypeScript. | Low. Nothing here compiles TypeScript. | The version matrix. |
| Generation recipes produce false results because the wiring is wrong. | Medium. | The same labeling as every generated fixture (lower evidence, source written to `generated/`), and the probe. |

## 5. Test and dependency cost.

Dev dependencies grow by the Angular packages (about 50 MB installed) and, for the integration test, `@angular/material` and `@angular/cdk`. CI install time grows by a few seconds. The tests that need a browser already skip when Chrome is missing. Each phase adds roughly 15 to 30 tests: pure functions (selector parsing, version rules, the entry text) run without a browser, and the rest run in Chrome.

## 6. What I need from you.

1. **Dev dependency weight.** Are the Angular packages and Material as dev dependencies acceptable? The alternative is fake libraries only, which would not prove the partial-declaration path.
2. **Scope of generation.** Is phase 2 (generated fixtures for Angular) in scope for the first release, or should the first release be authored fixtures and templates only? I'd ship phase 1 alone as 0.5.0, and the rest as 0.5.x.
3. **Support floor.** Is Angular 15 and newer the right promise, pending the version matrix?
4. **Priority libraries.** Which Angular libraries do you most want to see evaluated first? I'd start with Material and CDK, and add PrimeNG and Spartan UI.

## 7. Sizing.

My estimate, as focused sessions, not calendar time: phase 1 is one to two, phase 2 is two, phase 3 is one to two (most of it waiting on real libraries to surprise us), and phase 4 is one. The spike removed the biggest unknown, which was whether the runtime compiler would work at all.
