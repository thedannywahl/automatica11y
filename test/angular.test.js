import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { adapterFor } from "../src/frameworks/index.js";
import { markupFor } from "../src/frameworks/angular-selectors.js";
import { detectFlavor } from "../src/plan/resolve-npm.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";
const angular = adapterFor("angular");

async function run(args, files = {}) {
  const cwd = makeTree(files);
  const { io, out } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(args, io);
  const read = (file) => {
    try {
      return readFileSync(join(cwd, "a11y-report", file), "utf8");
    } catch {
      return null;
    }
  };
  const results = read("results.json");
  return { code, ...out, cwd, results: results && parseResults(JSON.parse(results)), report: read("report.md"), file: read };
}

// ---- detection ----

test("Angular 22 and newer is recognized from the peer range, and older ranges are named as unsupported", () => {
  for (const range of ["^22.0.0", "^21.0.0 || ^22.0.0", ">=15", "*", "22.x"]) {
    assert.equal(detectFlavor({ peerDependencies: { "@angular/core": range } }).kind, "npm-angular", range);
  }
  const old = detectFlavor({ peerDependencies: { "@angular/core": "^20.0.0 || ^21.0.0" } });
  assert.deepEqual([old.kind, old.framework], ["npm-unsupported", "Angular"]);
  assert.match(old.reason, /\^20\.0\.0 \|\| \^21\.0\.0/);
  assert.equal(detectFlavor({ peerDependencies: { "@angular/core": "^22", react: "^18" } }).kind, "npm-react", "React wins when both appear");
  assert.equal(detectFlavor({ peerDependencies: { "@angular/core": "^22" }, customElements: "custom-elements.json" }).kind, "npm-wc", "a custom elements manifest wins");
});

// ---- the entry, discovery, and templates ----

test("the entry loads the compiler first, adds zone.js only when asked, and bootstraps the fixture", () => {
  const plain = angular.entry("/f.js", "x");
  assert.ok(plain.startsWith('import "@angular/compiler";'));
  assert.doesNotMatch(plain, /zone\.js/);
  assert.match(plain, /bootstrapApplication\(Fixture, \{ providers: fixture\.providers \?\? \[\] \}\)/);
  assert.match(angular.entry("/f.js", "x", { zone: true }), /import "zone\.js";/);
  assert.match(angular.discoverEntry("fake-ng-ui"), /^import "@angular\/compiler";/);
});

test("selectors become markup, and attribute selectors keep their element", () => {
  assert.equal(markupFor([["button", "uiButton", ""]], { prefer: "button" })?.tag, "button");
  assert.equal(markupFor([["a", "uiLink", ""]], { prefer: "a" })?.tag, "a");
});

test("a template imports a standalone component directly and a module for a non-standalone one", () => {
  const standalone = angular.template("button", "fake-ng-ui", "UiButton", { angular: { kind: "component", selectors: [["button", "uiButton", ""]], standalone: true } });
  assert.match(standalone, /imports: \[UiButton\]/);
  assert.match(standalone, /<button uiButton/);
  const legacy = angular.template("button", "fake-ng-modules", "LegacyButton", { angular: { kind: "component", selectors: [["button", "legacyButton", ""]], standalone: false, moduleName: "LegacyModule" } });
  assert.match(legacy, /imports: \[LegacyModule\]/);
});

test("an Angular library with no Angular 22 range is unsupported, and nothing is installed", { skip }, async () => {
  const result = await run(["audit", "npm:fake-ng-old", "--tiers", "rules"]);
  assert.equal(result.results.targets[0].status, "unsupported");
  assert.match(result.results.targets[0].reason, /\^20\.0\.0 \|\| \^21\.0\.0/);
});

// ---- Angular in a real browser ----

test("Angular: templates cover the button and link, and nothing else is claimed", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "ui=npm:fake-ng-ui", "--archetypes", "button,link", "--tiers", "rules,interactions"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.flavor, target.npm.angular !== null], ["angular", true]);
  for (const name of ["button", "link"]) {
    assert.deepEqual([target.archetypes[name].status, target.archetypes[name].fixture.source], ["ran", "template"], name);
  }
  assert.match(result.report, /as Angular \(core 2\d\./);
});

test("Angular: a module-based library is covered through its module", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-ng-modules", "--archetypes", "button,link", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  for (const name of ["button", "link"]) assert.deepEqual([result.results.targets[0].archetypes[name].status, result.results.targets[0].archetypes[name].fixture.source], ["ran", "template"], name);
});

const AUTHORED = {
  dialog: `import { Component, inject } from "@angular/core";
import { UiDialog } from "fake-ng-ui";
class Content {}
Component({ selector: "app-content", template: '<h2>Settings</h2><button type="button" style="min-height:44px">Close</button>' })(Content);
class Fixture { dialog = inject(UiDialog); open() { this.dialog.open(Content); } }
Component({ selector: "app-fixture", template: '<button type="button" data-a11y-trigger style="min-height:44px" (click)="open()">Open dialog</button>' })(Fixture);
export default Fixture;`,
  menu: `import { Component } from "@angular/core";
import { UiMenu, UiMenuTrigger, UiMenuItem } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiMenu, UiMenuTrigger, UiMenuItem], template: '<button type="button" data-a11y-trigger [uiMenuTriggerFor]="m" style="min-height:44px">Actions</button><ui-menu #m="uiMenu" data-a11y-root><button type="button" uiMenuItem style="min-height:44px">Copy</button></ui-menu>' })(Fixture);
export default Fixture;`,
  tabs: `import { Component } from "@angular/core";
import { UiTabList, UiTab, UiTabPanel } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiTabList, UiTab, UiTabPanel], template: '<div uiTabList aria-label="Sections" data-a11y-root><button type="button" uiTab data-a11y-trigger style="min-height:44px">One</button><button type="button" uiTab style="min-height:44px">Two</button></div><div uiTabPanel aria-label="One">First panel</div>' })(Fixture);
export default Fixture;`,
  accordion: `import { Component } from "@angular/core";
import { UiAccordionPanel, UiAccordionTrigger } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiAccordionPanel, UiAccordionTrigger], template: '<button type="button" data-a11y-trigger [uiAccordionTrigger]="p" style="min-height:44px">Details</button><div uiAccordionPanel #p="uiPanel" data-a11y-root>More about this.</div>' })(Fixture);
export default Fixture;`,
  combobox: `import { Component } from "@angular/core";
import { UiCombobox, UiListbox, UiOption } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiCombobox, UiListbox, UiOption], template: '<label for="fruit">Fruit</label><input id="fruit" type="text" data-a11y-trigger [uiCombobox]="l" aria-controls="fruit-list" style="min-height:44px"><ui-listbox #l="uiListbox" id="fruit-list" aria-label="Fruit" data-a11y-root><div uiOption>Apple</div></ui-listbox>' })(Fixture);
export default Fixture;`,
  "form-field": `import { Component } from "@angular/core";
import { UiField, UiInput, UiLabel } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiField, UiInput, UiLabel], template: '<ui-field data-a11y-root><label uiLabel for="email">Email</label><input uiInput id="email" type="email" data-a11y-trigger></ui-field>' })(Fixture);
export default Fixture;`,
  tooltip: `import { Component } from "@angular/core";
import { UiTooltip } from "fake-ng-ui";
class Fixture {}
Component({ selector: "app-fixture", imports: [UiTooltip], template: '<button type="button" data-a11y-trigger uiTooltip="Saves your work" style="min-height:44px">Save</button>' })(Fixture);
export default Fixture;`,
  "live-region": `import { Component, signal } from "@angular/core";
import { UiAlert } from "fake-ng-ui";
class Fixture { shown = signal(false); }
Component({ selector: "app-fixture", imports: [UiAlert], template: '<button type="button" data-a11y-trigger style="min-height:44px" (click)="shown.set(true)">Save</button>@if (shown()) {<ui-alert data-a11y-root>Saved.</ui-alert>}' })(Fixture);
export default Fixture;`,
};

test("Angular: authored fixtures cover the archetypes that need wiring", { skip, timeout: 300_000 }, async () => {
  const files = Object.fromEntries(Object.entries(AUTHORED).map(([name, source]) => [`fixtures/ui/${name}.js`, source]));
  const result = await run(["audit", "ui=npm:fake-ng-ui", "--archetypes", Object.keys(AUTHORED).join(","), "--tiers", "rules"], files);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  for (const name of Object.keys(AUTHORED)) {
    assert.deepEqual([target.archetypes[name].status, target.archetypes[name].fixture.source], ["ran", "authored"], `${name}: ${target.archetypes[name].reason ?? ""}`);
  }
});

test("Angular: a library that keeps its parts in sub-paths takes a sub-path target", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-ng-split/button", "--archetypes", "button", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual([result.results.targets[0].archetypes.button.status, result.results.targets[0].archetypes.button.fixture.source], ["ran", "template"]);
});

test("Angular: the real Angular Material button is covered by a template", { skip, timeout: 300_000 }, async () => {
  const result = await run(["audit", "mat=npm:@angular/material/button", "--archetypes", "button,link", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  for (const name of ["button", "link"]) assert.deepEqual([result.results.targets[0].archetypes[name].status, result.results.targets[0].archetypes[name].fixture.source], ["ran", "template"], name);
});
