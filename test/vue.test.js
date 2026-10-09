import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { ADAPTERS, adapterFor, adapterForKind } from "../src/frameworks/index.js";
import { inferBase } from "../src/harness/generate/jsx.js";
import { detectFlavor } from "../src/plan/resolve-npm.js";
import { FLAVORS, TARGET_KINDS, parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

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
  return { code, ...out, cwd, results: results && parseResults(JSON.parse(results)), mapping: read("mapping.json") && JSON.parse(read("mapping.json")), report: read("report.md"), plan: read("plan.json") && JSON.parse(read("plan.json")), file: read };
}

// ---- the adapter registry ----

test("every adapter has the same shape, and the schema knows each framework and kind", () => {
  assert.deepEqual(FLAVORS.slice().sort(), Object.keys(ADAPTERS).sort(), "FLAVORS lists every adapter");
  for (const [id, adapter] of Object.entries(ADAPTERS)) {
    assert.equal(adapter.id, id);
    assert.ok(TARGET_KINDS.includes(adapter.kind), `${adapter.kind} is a target kind`);
    for (const member of ["label", "noun", "extension", "runtime", "detect", "bundle", "entry", "discoverEntry", "template", "generate", "describe"]) {
      assert.ok(adapter[member] !== undefined, `${id} has ${member}`);
    }
    assert.equal(adapterForKind(adapter.kind), adapter);
    assert.equal(adapterFor(id), adapter);
    assert.equal(typeof adapter.bundle(makeTree()).alias, "object");
  }
  assert.equal(adapterForKind("npm-unsupported"), null);
  assert.throws(() => adapterFor("solid"), /no adapter for "solid"/);
});

test("Vue 3 is recognized from the metadata, and Vue 2 and mixed ranges are handled", () => {
  assert.deepEqual(detectFlavor({ peerDependencies: { vue: "^3.4.0" } }).kind, "npm-vue");
  assert.equal(detectFlavor({ dependencies: { vue: "^3.0.0" } }).kind, "npm-vue");
  assert.equal(detectFlavor({ peerDependencies: { vue: "^2.7.0 || ^3.0.0" } }).kind, "npm-vue");
  assert.equal(detectFlavor({ peerDependencies: { vue: "*" } }).kind, "npm-vue");
  const two = detectFlavor({ peerDependencies: { vue: "^2.6.0" } });
  assert.deepEqual([two.kind, two.framework], ["npm-unsupported", "Vue 2"]);
  assert.equal(detectFlavor({ peerDependencies: { vue: "^3", react: "^18" } }).kind, "npm-react", "React wins when both appear");
  assert.equal(detectFlavor({ peerDependencies: { vue: "^3" }, customElements: "custom-elements.json" }).kind, "npm-wc", "a custom elements manifest wins over Vue");
  assert.equal(detectFlavor({ peerDependencies: { "solid-js": "^1" } }).kind, "npm-unsupported");
});

test("Vue fixtures bundle with JSX turned into h() calls and one copy of Vue", () => {
  const dir = makeTree();
  const bundle = adapterFor("vue").bundle(dir);
  assert.deepEqual(bundle.alias, { vue: join(dir, "node_modules", "vue") });
  assert.equal(bundle.esbuild.jsxFactory, "h");
  assert.equal(readFileSync(bundle.esbuild.inject[0], "utf8"), 'export { h, Fragment } from "vue";\n');
  assert.equal(bundle.define.__VUE_OPTIONS_API__, "true");
  assert.match(adapterFor("vue").entry("/f.jsx", "x"), /createApp\(fixture\.default, \{ libA11y \}\)[\s\S]*fixture\.setup/);
});

test("a family of flat parts with no export of its own name still has a base", () => {
  const exports = ["DialogRoot", "DialogTrigger", "DialogContent", "Other"].map((name) => ({ name, type: "object", parts: [] }));
  assert.equal(inferBase("DialogClose", exports), "Dialog");
  assert.equal(inferBase("DialogRoot", exports), "Dialog");
  assert.equal(inferBase("Other", exports), null);
  assert.equal(inferBase("Root", exports), null, "a name that is only a part has no prefix");
  assert.equal(inferBase("ListRoot", [{ name: "ListRoot", type: "object" }]), null, "one export isn't a family");
});

// ---- Vue in a real browser ----

test("Vue: a template covers the button, and a dialog and alert are generated from the parts", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "ui=npm:fake-vue-ui", "--archetypes", "button,dialog,live-region", "--tiers", "rules,interactions"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.flavor, target.npm.vue !== null], ["vue", true]);
  assert.equal(result.plan.targets[0].kind, "npm-vue");
  assert.equal(target.archetypes.button.fixture.source, "template");
  const dialog = target.archetypes.dialog;
  assert.deepEqual([dialog.status, dialog.fixture.source, dialog.fixture.recipe], ["ran", "generated", "dialog-compound"]);
  assert.deepEqual(dialog.configs.map((c) => c.state), ["closed", "open"]);
  assert.ok(dialog.fixture.used.includes("DialogRoot") && dialog.fixture.used.includes("DialogContent"));
  const alert = target.archetypes["live-region"];
  assert.deepEqual([alert.status, alert.fixture.recipe], ["ran", "message-mounted"]);
  assert.match(result.report, /as Vue \(vue 3\.\d+\.\d+\)\./);
  const source = result.file("generated/ui/dialog.jsx");
  assert.match(source, /import \{ defineComponent, onBeforeUnmount, onMounted, ref \} from "vue"/);
  assert.match(source, /<Lib\.DialogTrigger data-a11y-trigger>Open dialog<\/Lib\.DialogTrigger>/);
  // The interaction checks ran on the Vue button, and none errored.
  const checks = target.archetypes.button.configs[0].tiers.interactions.checks;
  assert.equal(checks.filter((c) => c.result === "error").length, 0);
  assert.equal(checks.find((c) => c.name === "enter-activates").result, "pass");
});

test("Vue: a controlled dialog is wired with open and update:open", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-vue-controlled", "--archetypes", "dialog", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const dialog = result.results.targets[0].archetypes.dialog;
  assert.deepEqual([dialog.status, dialog.fixture.recipe], ["ran", "dialog-controlled-open-onUpdate-open"]);
  assert.match(result.file("generated/lib/dialog.jsx"), /\{\.\.\.\{ "onUpdate:open": \(next\) => \(open\.value = next === true\) \}\}/);
});

test("Vue: an authored fixture is JSX, can hold state, and can install what the app needs with setup(app)", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-vue-ui", "--archetypes", "button", "--tiers", "rules"], {
    "fixtures/lib/button.jsx": `import { resolveComponent } from "vue";
export function setup(app) {
  app.component("HelloButton", { render() { return h("button", { type: "button", "data-a11y-trigger": "", "data-a11y-root": "", style: "min-height:44px" }, "Hello"); } });
}
export default { render() { return h(resolveComponent("HelloButton")); } };`,
  });
  assert.equal(result.code, 0, result.stderr);
  const button = result.results.targets[0].archetypes.button;
  assert.deepEqual([button.status, button.fixture.source], ["ran", "authored"]);
});

test("Vue 2 and Svelte packages are named as unsupported, and nothing is installed", { skip }, async () => {
  const two = await run(["audit", "npm:vue-two-lib", "--tiers", "rules"]);
  assert.equal(two.results.targets[0].status, "unsupported");
  assert.match(two.results.targets[0].reason, /Vue 2 packages aren't supported/);
});
