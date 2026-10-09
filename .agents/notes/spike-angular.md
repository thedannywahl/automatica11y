# Spike: can the tool bundle and run a real Angular library?

Date: October 9, 2026. Throwaway code in the scratchpad, not in the repository. This note keeps what it showed.

## The question.

Angular libraries ship **partially compiled** (Ivy partial declarations such as `ɵɵngDeclareComponent`). The usual build step is the Angular linker, a Babel plugin, or the AOT compiler. The tool has no build step beyond esbuild. Can it work with a real Angular library anyway?

## What I ran.

A scratch folder with `@angular/material` 22.2.2, `@angular/cdk`, `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/platform-browser`, `@angular/forms`, `rxjs`, and `zone.js`, and again with the whole set at version 18.2.14. A plain JavaScript fixture bundled with the repository's own esbuild, loaded in Chrome through the tool's own browser launcher and static server.

The fixture has no TypeScript and no decorator syntax. A component is defined by calling the decorator as a function:

```js
import "@angular/compiler";            // the runtime compiler, before any library loads
import "zone.js";                      // only for versions that need it
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { MatButton } from "@angular/material/button";

class Fixture {}
Component({ selector: "app-fixture", standalone: true, imports: [MatButton],
  template: `<button matButton data-a11y-trigger type="button">Save</button>` })(Fixture);

document.getElementById("root").append(document.createElement("app-fixture"));
bootstrapApplication(Fixture);
```

## What it showed.

1. **No linker is needed.** With `@angular/compiler` imported first, Angular compiles the partial declarations in the browser (JIT) when each class is defined. The Material button rendered with its real classes and took focus. The whole bundle took 223 ms to build and is about 2.7 MB. Page ready time was about 120 ms.
2. **Discovery works on the compiled classes.** `import * as lib` and then reading each export's `ɵcmp`, `ɵdir`, or `ɵmod` gives its kind, its selectors (`[["button", "matButton", ""], ...]`), its inputs (`matButton`, `color`, `disabled`, ...), and whether it's standalone. Selectors describe exactly which element and attribute turn a class on, which is what a template needs.
3. **The archetypes that matter all work.** A Material menu wired with a template reference (`[matMenuTriggerFor]="m"` and `<mat-menu #m="matMenu">`) opened with `role="menu"` and `aria-expanded="true"`. A `matTooltip` directive showed `role="tooltip"` on focus. A dialog opened through the `MatDialog` service from a click produced `role="dialog"`. All three worked with `zone.js` imported and without it, on Angular 22.
4. **Older versions need one more provider.** On Angular 18, Material's menu failed with `NG05105: Unexpected synthetic listener @transformMenu.start`, until `provideNoopAnimations()` from `@angular/platform-browser/animations` was passed to `bootstrapApplication`. With it, the menu opened. On 22 no animations provider is needed (the package is deprecated). So the entry has to add that provider when `@angular/animations` is installed.
5. **Never define `ngDevMode` as a boolean.** My first version defined `ngDevMode: "true"` in esbuild. Angular 18 treats `ngDevMode` as an object it fills in, and failed with `Cannot create property 'tView' on boolean 'true'`. Leaving it undefined works on both versions.
6. **Angular libraries are split into secondary entry points.** `@angular/material` has almost nothing at its root. Its components live at `@angular/material/button`, `@angular/material/menu`, and so on. The sub-path support added in 0.4.0 is exactly the right shape. Each sub-path is an `exports` key, and the registry check lists them.

## What it didn't show.

Real libraries other than Material (PrimeNG, ng-bootstrap, Spartan, Taiga UI, Clarity), TypeScript fixtures with `@Component` decorator syntax, an NgModule-based library, `@angular/localize`, SSR hydration, and any version between 18 and 22.

## To repeat it.

Install the packages above into an empty folder, put the fixture in `src/`, and bundle with `esbuild --bundle --format=esm --platform=browser`. Do not pass `--define:ngDevMode=...`.
