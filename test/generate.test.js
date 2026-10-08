import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { generateCandidates } from "../src/harness/generate/index.js";
import { buildKit } from "../src/harness/generate/kit.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

async function run(args) {
  const cwd = makeTree();
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
  const mapping = read("mapping.json");
  return { code, ...out, cwd, results: results && parseResults(JSON.parse(results)), mapping: mapping && JSON.parse(mapping), report: read("report.md"), file: (path) => read(path) };
}

const fixtureOf = (result, archetype, index = 0) => result.results.targets[index].archetypes[archetype];

// ---- the kit and the candidate builders need no browser ----

const exportsOf = (...entries) => entries.map(([name, parts = []]) => ({ name, type: "object", parts }));

test("kit: parts are found on a namespaced export, on flat exports that share a prefix, and on a package that is the component", () => {
  const namespaced = buildKit(exportsOf(["Dialog", ["Root", "Trigger", "Content"]]), "Dialog");
  assert.equal(namespaced.pick("root"), "Lib.Dialog.Root");
  assert.equal(namespaced.pick("close", "trigger"), "Lib.Dialog.Trigger", "the first name that exists wins");
  assert.equal(namespaced.pick("overlay"), null);
  const flat = buildKit(exportsOf(["Dialog"], ["DialogPanel"], ["DialogTitle"], ["Other"]), "Dialog");
  assert.equal(flat.self, "Lib.Dialog");
  assert.equal(flat.pick("panel"), "Lib.DialogPanel");
  assert.equal(flat.pick("other"), null, "only exports that start with the base count");
  const bare = buildKit(exportsOf(["Root"], ["Trigger"], ["Content"]), null);
  assert.deepEqual([bare.self, bare.pick("root"), bare.pick("trigger")], [null, "Lib.Root", "Lib.Trigger"]);
  assert.deepEqual(namespaced.used(), ["Dialog.Root", "Dialog.Trigger"]);
});

test("candidates: the recipes need the parts they use, and a package named for the archetype can be the component", () => {
  const none = generateCandidates({ flavor: "react", archetype: "dialog", pkg: "some-lib", entry: { export: "Missing" }, exports: exportsOf(["Dialog", ["Content"]]), facts: {} });
  assert.deepEqual(none.candidates, []);
  assert.match(none.reason, /don't have the parts a dialog recipe needs \(looked at Missing/);
  const controlled = generateCandidates({ flavor: "react", archetype: "dialog", pkg: "some-lib", entry: { export: "Dialog" }, exports: exportsOf(["Dialog", ["Content"]]), facts: {} });
  assert.equal(controlled.candidates[0].id, "dialog-controlled-open-onClose", "a Dialog with no Root part can be the controlled root itself");
  const compound = generateCandidates({ flavor: "react", archetype: "dialog", pkg: "some-lib", entry: { export: "Dialog" }, exports: exportsOf(["Dialog", ["Root", "Trigger", "Content", "Title", "Close"]]), facts: {} });
  assert.equal(compound.candidates[0].id, "dialog-compound");
  assert.match(compound.candidates[0].source, /<Lib\.Dialog\.Trigger data-a11y-trigger>/);
  assert.match(compound.candidates[0].source, /<Lib\.Dialog\.Title>Edit profile<\/Lib\.Dialog\.Title>/);
  const bare = generateCandidates({ flavor: "react", archetype: "dialog", pkg: "@scope/react-dialog", entry: {}, exports: exportsOf(["Root"], ["Trigger"], ["Content"]), facts: {} });
  assert.equal(bare.candidates[0].id, "dialog-compound", "@scope/react-dialog is a dialog, so its Root and Trigger are the parts");
  const unnamed = generateCandidates({ flavor: "react", archetype: "dialog", pkg: "@scope/react-things", entry: {}, exports: exportsOf(["Root"], ["Trigger"], ["Content"]), facts: {} });
  assert.deepEqual(unnamed.candidates, [], "a package that doesn't say what it is isn't guessed at");
  assert.deepEqual(generateCandidates({ flavor: "react", archetype: "chart", pkg: "x", entry: { export: "Chart" }, exports: [], facts: {} }).candidates, []);
});

test("candidates: a web component recipe needs evidence on the element", () => {
  const input = (facts) => generateCandidates({ flavor: "wc", archetype: "dialog", pkg: "x", entry: { tag: "x-modal" }, exports: [], facts: { "x-modal": facts } });
  assert.deepEqual(input({ attributes: [], members: ["render"], slots: [] }).candidates, []);
  assert.match(input({ attributes: [], members: ["render"], slots: [] }).reason, /doesn't show a way to wire a dialog/);
  assert.deepEqual(input({ attributes: ["open"], members: ["show", "showModal"], slots: ["title"] }).candidates.map((c) => c.id), ["dialog-attribute", "dialog-showModal", "dialog-show"]);
  assert.match(input({ attributes: ["open"], members: [], slots: ["title"] }).candidates[0].source, /<h2 slot="title">/, "a title slot gets the heading");
  assert.deepEqual(generateCandidates({ flavor: "wc", archetype: "menu", pkg: "x", entry: { tag: "x-menu" }, exports: [], facts: { "x-menu": { attributes: [], members: [], slots: [] } } }).candidates, []);
});

// ---- generation in a real browser, against fake libraries of the common shapes ----

test("namespaced compound parts: a dialog, menu, tooltip, tabs, and accordion are generated, verified, and run", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-compound", "--archetypes", "dialog,menu,tooltip,tabs,accordion", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const recipes = Object.fromEntries(Object.entries(result.results.targets[0].archetypes).map(([name, a]) => [name, [a.status, a.fixture?.source, a.fixture?.recipe]]));
  assert.deepEqual(recipes, {
    dialog: ["ran", "generated", "dialog-compound"],
    menu: ["ran", "generated", "menu-compound"],
    tooltip: ["ran", "generated", "tooltip-compound"],
    tabs: ["ran", "generated", "tabs-value"],
    accordion: ["ran", "generated", "accordion-single-collapsible"],
  });
  // The accordion's first recipe threw, and the tool says so and moves on.
  const accordion = fixtureOf(result, "accordion").fixture;
  assert.equal(accordion.attempts[0].ok, false);
  assert.match(accordion.attempts[0].reason, /logged an error/);
  assert.equal(accordion.attempts.at(-1).ok, true);
  // Open states are tested, because the generated root appeared after the trigger was activated.
  assert.deepEqual(fixtureOf(result, "dialog").configs.map((c) => c.state), ["closed", "open"]);
  assert.deepEqual(fixtureOf(result, "accordion").configs.map((c) => c.state), ["collapsed", "expanded"]);
  // The mapping and the generated files record what was done.
  assert.deepEqual([result.mapping.lib.dialog.status, result.mapping.lib.dialog.recipe, result.mapping.lib.dialog.generatedFile], ["generated", "dialog-compound", "generated/lib/dialog.jsx"]);
  for (const part of ["Dialog.Root", "Dialog.Trigger", "Dialog.Content", "Dialog.Title", "Dialog.Close"]) assert.ok(result.mapping.lib.dialog.used.includes(part), `${part} is recorded as used`);
  const source = result.file("generated/lib/dialog.jsx");
  assert.match(source, /import \* as Lib from "fake-compound"/);
  assert.match(source, /<Lib\.Dialog\.Content>/);
});

test("the report says which results come from generated fixtures", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-compound", "--archetypes", "dialog", "--tiers", "rules"]);
  assert.match(result.report, /\| Archetype \| Status \| Fixture \| States \| Note \|/);
  assert.match(result.report, /\| dialog \| ran \| generated \(dialog-compound\) \| closed, open \|/);
  assert.match(result.report, /\*\*Generated fixtures\.\*\* Where no fixture was written/);
  assert.match(result.report, /lower evidence than an authored fixture/);
  assert.match(result.report, /Source: generated\/lib\/dialog\.jsx/);
});

test("flat, controlled components: open and onClose are tried, and a plain alert and input are wired", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-controlled", "--archetypes", "dialog,live-region,form-field", "--tiers", "rules,interactions"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    ["dialog", "live-region", "form-field"].map((name) => [fixtureOf(result, name).status, fixtureOf(result, name).fixture.recipe]),
    [["ran", "dialog-controlled-open-onClose"], ["ran", "message-mounted"], ["ran", "field-wrapped-label"]],
  );
  // The interaction checks ran on the generated fixtures, and none of them errored.
  for (const name of ["dialog", "live-region", "form-field"]) {
    const checks = fixtureOf(result, name).configs[0].tiers.interactions.checks;
    assert.ok(checks.length >= 5, `${name} has its checks`);
    assert.equal(checks.filter((c) => c.result === "error").length, 0, `${name}: ${JSON.stringify(checks.filter((c) => c.result === "error"))}`);
  }
  const dialogChecks = Object.fromEntries(fixtureOf(result, "dialog").configs[0].tiers.interactions.checks.map((c) => [c.name, c.result]));
  assert.equal(dialogChecks["focus-moves-into-dialog"], "fail", "a plain div dialog doesn't move focus, and that's reported about the library as wired");
});

test("a library that never sets the role is a gap that says what was tried, and the button template still runs", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-nope", "--archetypes", "button,dialog", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(fixtureOf(result, "button").fixture.source, "template");
  const dialog = fixtureOf(result, "dialog");
  assert.equal(dialog.status, "gap");
  assert.match(dialog.reason, /Generating one didn't work\. None of the \d+ generated fixtures worked\./);
  assert.match(dialog.reason, /showed no element marked as the root \(looked for an element with role dialog, alertdialog\), which can also mean the library doesn't set that role/);
  assert.match(dialog.reason, /Write fixtures\/lib\/dialog\.jsx/);
  assert.equal(dialog.fixture.source, "none");
  assert.ok(dialog.fixture.attempts.length >= 1 && dialog.fixture.attempts.every((a) => a.ok === false));
  assert.equal(result.mapping.lib.dialog.status, "needs-fixture");
  assert.ok(!existsSync(join(result.cwd, "a11y-report", "generated", "lib", "dialog.jsx")), "nothing is written for a fixture that didn't work");
});

test("--no-generate keeps to authored fixtures and templates", { skip, timeout: 120_000 }, async () => {
  const result = await run(["audit", "lib=npm:fake-compound", "--archetypes", "dialog", "--tiers", "rules", "--no-generate"]);
  const dialog = fixtureOf(result, "dialog");
  assert.equal(dialog.status, "gap");
  assert.doesNotMatch(dialog.reason, /Generating/);
  assert.match(dialog.reason, /built from parts, so a fixture has to assemble them/);
  assert.equal(result.mapping.lib.dialog.status, "needs-fixture");
  assert.equal(result.report.includes("Generated fixtures."), false);
});

test("an authored fixture wins over a generated one", { skip, timeout: 120_000 }, async () => {
  const cwd = makeTree({
    "fixtures/lib/dialog.jsx": `import * as Lib from "fake-compound";
export default function Fixture() {
  return (
    <Lib.Dialog.Root>
      <Lib.Dialog.Trigger data-a11y-trigger>Open</Lib.Dialog.Trigger>
      <Lib.Dialog.Content data-a11y-root aria-label="Authored"><p>Hello</p></Lib.Dialog.Content>
    </Lib.Dialog.Root>
  );
}`,
  });
  const { io } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  assert.equal(await main(["audit", "lib=npm:fake-compound", "--archetypes", "dialog", "--tiers", "rules"], io), 0);
  const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
  assert.equal(results.targets[0].archetypes.dialog.fixture.source, "authored");
  assert.ok(!existsSync(join(cwd, "a11y-report", "generated")), "nothing was generated");
});

test("web components: a dialog, tooltip, message, and field are built from what the elements say about themselves", { skip, timeout: 240_000 }, async () => {
  const result = await run(["audit", "wc=npm:fake-wc-generate", "--archetypes", "dialog,tooltip,live-region,form-field", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    ["dialog", "tooltip", "live-region", "form-field"].map((name) => [fixtureOf(result, name).status, fixtureOf(result, name).fixture.recipe]),
    [["ran", "dialog-attribute"], ["ran", "tooltip-tip"], ["ran", "message-appended"], ["ran", "field-wrapped-label"]],
  );
  assert.match(result.file("generated/wc/dialog.js"), /dialog\.setAttribute\("open", ""\)/);
  assert.ok(result.mapping.wc.dialog.used.includes("gen-modal"));
  assert.ok(result.mapping.wc["form-field"].used.includes("gen-textfield"));
});

test("a comparison marks generated results in each coverage cell and says what generated means once", { skip, timeout: 300_000 }, async () => {
  const result = await run(["compare", "a=npm:fake-compound", "b=npm:fake-nope", "--archetypes", "button,dialog", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.report, /\| dialog \| ran \(closed state; open state\) \(generated fixture\) \| gap \|/);
  assert.match(result.report, /\| button \| gap \| ran \|/);
  assert.equal(result.report.split("**Generated fixtures.**").length - 1, 1);
});

test("the same generation twice gives the same recipes and the same source", { skip, timeout: 300_000 }, async () => {
  const args = ["audit", "lib=npm:fake-compound", "--archetypes", "dialog,tabs", "--tiers", "rules"];
  const first = await run(args);
  const second = await run(args);
  assert.deepEqual(first.mapping, second.mapping);
  assert.equal(first.file("generated/lib/tabs.jsx"), second.file("generated/lib/tabs.jsx"));
});
