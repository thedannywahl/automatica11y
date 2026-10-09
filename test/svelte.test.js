import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { adapterFor } from "../src/frameworks/index.js";
import { allowsSvelte5 } from "../src/frameworks/svelte.js";
import { candidateMapping } from "../src/plan/mapping.js";
import { detectFlavor } from "../src/plan/resolve-npm.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";
const svelte = adapterFor("svelte");

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

test("Svelte 5 and newer is recognized from the peer range, and older ranges are named as unsupported", () => {
  for (const range of ["^5.0.0", "^4.0.0 || ^5.0.0", ">=3", "*", "5.x", "^5.33.0"]) assert.equal(allowsSvelte5(range), true, range);
  for (const range of ["^3.0.0", "^3.0.0 || ^4.0.0", "~4.2.0"]) assert.equal(allowsSvelte5(range), false, range);
  assert.equal(detectFlavor({ peerDependencies: { svelte: "^5" } }).kind, "npm-svelte");
  assert.equal(detectFlavor({ dependencies: { svelte: "^5" } }).kind, "npm-svelte");
  const old = detectFlavor({ peerDependencies: { svelte: "^3.0.0 || ^4.0.0" } });
  assert.deepEqual([old.kind, old.framework], ["npm-unsupported", "Svelte"]);
  assert.match(old.reason, /\^3\.0\.0 \|\| \^4\.0\.0/);
  assert.equal(detectFlavor({ peerDependencies: { svelte: "^5", react: "^18" } }).kind, "npm-react", "React wins when both appear");
  assert.equal(detectFlavor({ peerDependencies: { svelte: "^5" }, customElements: "custom-elements.json" }).kind, "npm-wc", "a custom elements manifest wins");
});

test("the entry mounts the fixture, and a template imports the export as a component", () => {
  assert.match(svelte.entry("/f.svelte", "x"), /mount\(Fixture, \{ target: document\.getElementById\("root"\), props: \{ libA11y \} \}\)/);
  const button = svelte.template("button", "pkg", "Button");
  assert.match(button, /import \{ Button as Component \} from "pkg";/);
  assert.match(button, /<Component data-a11y-trigger data-a11y-root type="button">Save<\/Component>/);
  assert.match(svelte.template("link", "pkg", "Link"), /href="#top"/);
  assert.equal(svelte.template("dialog", "pkg", "Dialog"), null);
  assert.match(svelte.template("button", "pkg", "Button", { parts: ["Root"] }), /<Component\.Root data-a11y-trigger data-a11y-root type="button">Save<\/Component\.Root>/, "a namespace with a root part is used through the root");
  const mapped = candidateMapping({ flavor: "svelte", exports: [{ name: "Button", type: "object", parts: ["Root"] }, { name: "Dialog", type: "object", parts: ["Root", "Trigger"] }] });
  assert.equal(mapped.button.status, "template", "a button namespace with a root is one element");
  assert.equal(mapped.dialog.status, "needs-fixture", "a dialog namespace is still built from parts");
});

// ---- Svelte in a real browser ----

test("Svelte: templates cover the button and link, compiled from the library's own .svelte source", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "ui=npm:fake-svelte-ui", "--archetypes", "button,link", "--tiers", "rules,interactions"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.flavor, target.npm.svelte !== null], ["svelte", true]);
  for (const name of ["button", "link"]) assert.deepEqual([target.archetypes[name].status, target.archetypes[name].fixture.source], ["ran", "template"], name);
  assert.match(result.report, /as Svelte \(svelte 5\.\d+\.\d+\)\./);
});

test("Svelte: an authored fixture holds state with runes, imports a rune module, and can use TypeScript", { skip, timeout: 240_000 }, async () => {
  const dialog = `<script lang="ts">
  import { Dialog } from "fake-svelte-ui";
  let open: boolean = $state(false);
</script>

<button type="button" data-a11y-trigger style="min-height:44px" onclick={() => (open = true)}>Open dialog</button>
<Dialog {open} onclose={() => (open = false)}>
  <h2>Settings</h2>
</Dialog>`;
  const counter = `<script>
  import { counter } from "fake-svelte-ui";
</script>

<button type="button" data-a11y-trigger data-a11y-root style="min-height:44px" onclick={() => counter.count++}>Count is {counter.count}</button>`;
  const result = await run(["audit", "ui=npm:fake-svelte-ui", "--archetypes", "dialog,button", "--tiers", "rules,interactions"], { "fixtures/ui/dialog.svelte": dialog, "fixtures/ui/button.svelte": counter });
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  const found = target.archetypes.dialog;
  assert.deepEqual([found.status, found.fixture.source], ["ran", "authored"], found.reason ?? "");
  assert.deepEqual(found.configs.map((c) => c.state), ["closed", "open"]);
  assert.deepEqual([target.archetypes.button.status, target.archetypes.button.fixture.source], ["ran", "authored"], target.archetypes.button.reason ?? "");
});

test("Svelte: a fixture that doesn't compile is a gap with the compiler's message, never a pass", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "ui=npm:fake-svelte-ui", "--archetypes", "button", "--tiers", "rules"], { "fixtures/ui/button.svelte": "<button data-a11y-trigger>{#if}</button>" });
  const button = result.results.targets[0].archetypes.button;
  assert.equal(button.status, "gap");
  assert.match(button.reason, /didn't bundle/);
});

test("Svelte: a package with only a Svelte 4 range is unsupported, and the reason names the range", { skip }, async () => {
  const result = await run(["audit", "npm:svelte-lib", "--tiers", "rules"]);
  assert.equal(result.results.targets[0].status, "unsupported");
  assert.match(result.results.targets[0].reason, /svelte \^4/);
});

test("Svelte: the real bits-ui dialog runs from an authored fixture", { skip, timeout: 300_000 }, async () => {
  const dialog = `<script>
  import { Dialog } from "bits-ui";
</script>

<Dialog.Root>
  <Dialog.Trigger data-a11y-trigger>Open dialog</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content data-a11y-root>
      <Dialog.Title>Edit profile</Dialog.Title>
      <Dialog.Description>Update your details.</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>`;
  const result = await run(["audit", "bits=npm:bits-ui", "--archetypes", "dialog", "--tiers", "rules,interactions"], { "fixtures/bits/dialog.svelte": dialog });
  assert.equal(result.code, 0, result.stderr);
  const found = result.results.targets[0].archetypes.dialog;
  assert.deepEqual([found.status, found.fixture.source], ["ran", "authored"], found.reason ?? "");
  assert.deepEqual(found.configs.map((c) => c.state), ["closed", "open"]);
});

// ---- generated fixtures ----

test("Svelte: a single component with an open prop is generated, with state held by runes", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "ui=npm:fake-svelte-ui", "--archetypes", "dialog", "--tiers", "rules,interactions"]);
  assert.equal(result.code, 0, result.stderr);
  const found = result.results.targets[0].archetypes.dialog;
  assert.deepEqual([found.status, found.fixture.source], ["ran", "generated"], found.reason ?? "");
  assert.match(found.fixture.recipe, /^dialog-controlled-open-/);
  assert.deepEqual(found.configs.map((c) => c.state), ["closed", "open"]);
  const source = result.file("generated/ui/dialog.svelte");
  assert.match(source, /^<script>\n  import \* as Lib from "fake-svelte-ui";\n  import \{ onMount \} from "svelte";/);
  assert.match(source, /let open = \$state\(false\);/);
  assert.match(source, /<button type="button" data-a11y-trigger onclick=\{\(\) => open = true\}>Open dialog<\/button>/);
  assert.match(source, /onMount\(\(\) => startMarking\(\)\);/);
});

test("Svelte: the real bits-ui dialog, menu, tabs, and accordion are generated from their parts, and a button namespace is templated through its root", { skip, timeout: 420_000 }, async () => {
  const result = await run(["audit", "bits=npm:bits-ui", "--archetypes", "button,dialog,menu,tabs,accordion", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.equal(target.archetypes.button.fixture.source, "template");
  for (const name of ["dialog", "menu", "tabs", "accordion"]) assert.deepEqual([target.archetypes[name].status, target.archetypes[name].fixture.source], ["ran", "generated"], `${name}: ${target.archetypes[name].reason ?? ""}`);
  assert.match(result.file("generated/bits/dialog.svelte"), /<Lib\.Dialog\.Root>[\s\S]*<Lib\.Dialog\.Trigger data-a11y-trigger>Open dialog<\/Lib\.Dialog\.Trigger>/);
});
