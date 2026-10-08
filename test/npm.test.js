import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { detectFlavor } from "../src/plan/resolve-npm.js";
import { entry as wcEntry } from "../src/harness/npm-wc.js";
import { candidateMapping } from "../src/plan/mapping.js";
import { parseMappingFile, parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";
import { installPackage as realInstall, installOptionalPeers, declaredOptionalPeers, installExtraPackages } from "../src/harness/npm-install.js";
import { bundleEntries, unresolvedPackages } from "../src/harness/bundle.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";

// Other test files run at the same time and make their own temporary folders. Give this file its own, so counting leftovers is exact.
process.env.TMPDIR = makeTree();

const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

const REACT_DIALOG = `import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "fake-ui";
export default function Fixture() {
  return (
    <Dialog>
      <DialogTrigger data-a11y-trigger>Open</DialogTrigger>
      <DialogContent data-a11y-root aria-labelledby="t">
        <DialogTitle id="t">Edit profile</DialogTitle>
        <DialogClose>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
`;
// An image with no alt text that only exists while the dialog is open.
const REACT_DIALOG_BAD = REACT_DIALOG.replace("<DialogClose>", '<img src="x.png" /><DialogClose>');
const WC_DIALOG = `export default function mount(container) {
  container.innerHTML = '<fake-dialog><button slot="trigger" data-a11y-trigger type="button" style="min-width:44px;min-height:44px">Open</button><div slot="content" data-a11y-root><h2>Details</h2><p>Body</p></div></fake-dialog>';
}
`;

async function run(args, { files = {}, cwd = makeTree(files), env = process.env } = {}) {
  const { io, out } = makeIo({ cwd, env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(args, io);
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(join(cwd, "a11y-report", file), "utf8"));
    } catch {
      return null;
    }
  };
  const results = read("results.json");
  return { code, ...out, cwd, results: results && parseResults(results), plan: read("plan.json"), mapping: read("mapping.json"), report: existsSync(join(cwd, "a11y-report", "report.md")) ? readFileSync(join(cwd, "a11y-report", "report.md"), "utf8") : null };
}

const leftovers = () => readdirSync(tmpdir()).filter((name) => name.startsWith("automatica11y-npm-"));
const archetype = (run, name, index = 0) => run.results.targets[index].archetypes[name];
const violations = (config, engine) => config.tiers.rules.engines[engine].violations.map((v) => v.ruleId).sort();

test("detectFlavor: React wins, then web components, then other frameworks, then unknown", () => {
  assert.equal(detectFlavor({ peerDependencies: { react: "^18" } }).kind, "npm-react");
  assert.equal(detectFlavor({ peerDependencies: { react: "^18" }, customElements: "x.json" }).kind, "npm-react");
  assert.equal(detectFlavor({ customElements: "custom-elements.json" }).kind, "npm-wc");
  assert.equal(detectFlavor({ dependencies: { lit: "^3" } }).kind, "npm-wc");
  const vue = detectFlavor({ peerDependencies: { vue: "^3" } });
  assert.equal(vue.kind, "npm-unsupported");
  assert.equal(vue.framework, "Vue");
  assert.equal(detectFlavor({ peerDependencies: { "@angular/core": "*" } }).framework, "Angular");
  assert.equal(detectFlavor({}).kind, "npm");
});

test("detectFlavor says whether react is a peer dependency or a dependency", () => {
  assert.equal(detectFlavor({ peerDependencies: { react: "^18" } }).reason, "The package lists react as a peer dependency.");
  assert.equal(detectFlavor({ dependencies: { react: "^18" } }).reason, "The package lists react as a dependency.");
});

test("an install that says a version doesn't exist is retried once with fresh package data", async () => {
  const calls = [];
  const stale = async (args) => {
    calls.push(args);
    if (args.includes("--prefer-offline")) throw Object.assign(new Error("npm error code ETARGET\nnpm error notarget No matching version found for pkg@1.2.3."), { code: "NPM_FAILED" });
    return "";
  };
  const result = await realInstall({ dir: makeTree(), name: "pkg", version: "1.2.3", flavor: "wc", run: stale });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes("--prefer-offline") && !calls[0].includes("--prefer-online"));
  assert.ok(calls[1].includes("--prefer-online") && !calls[1].includes("--prefer-offline"));
  assert.deepEqual(calls[0].filter((a) => a !== "--prefer-offline"), calls[1].filter((a) => a !== "--prefer-online"), "only the cache flag changes");
  assert.match(result.warnings[0], /local list of pkg versions was out of date, so the install refreshed it and tried again/);
});

test("an install that fails for another reason isn't retried, and a retry that fails says why", async () => {
  const calls = [];
  const down = async (args) => {
    calls.push(args);
    throw new Error("npm error code ENOTFOUND\nnpm error network request failed");
  };
  await assert.rejects(realInstall({ dir: makeTree(), name: "pkg", version: "1.0.0", flavor: "wc", run: down }), /npm couldn't install pkg@1\.0\.0: .*ENOTFOUND/);
  assert.equal(calls.length, 1, "a network failure isn't treated as a stale list");
  const alwaysMissing = async () => {
    throw new Error("npm error code ETARGET\nnpm error notarget No matching version found for pkg@9.9.9.");
  };
  await assert.rejects(realInstall({ dir: makeTree(), name: "pkg", version: "9.9.9", flavor: "wc", run: alwaysMissing }), /npm couldn't install pkg@9\.9\.9/);
});

function fakeInstall(packages) {
  const dir = mkdtempSync(join(tmpdir(), "a11y-peers-"));
  for (const [name, pkg] of Object.entries(packages)) {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0", ...pkg }));
  }
  return dir;
}

test("the harness page puts the fixture inside a main landmark with a language and a title", async () => {
  const dir = mkdtempSync(join(tmpdir(), "a11y-shell-"));
  writeFileSync(join(dir, "entry.js"), "document.getElementById('root').textContent = 'x';");
  await bundleEntries({ entries: { demo: join(dir, "entry.js") }, outdir: join(dir, "out"), workDir: dir });
  const html = readFileSync(join(dir, "out", "demo.html"), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>demo<\/title>/);
  assert.match(html, /<main><div id="root"><\/div><\/main>/);
});

test("unresolvedPackages names each missing package once and ignores relative paths", () => {
  const text = (name) => ({ text: `Could not resolve "${name}"` });
  assert.deepEqual(
    unresolvedPackages([text("@emotion/react"), text("@emotion/styled/base"), text("lodash/get"), text("./local.js"), text("lodash"), { text: "Something else" }]),
    ["@emotion/react", "@emotion/styled", "lodash"],
  );
});

test("optional peers: only packages an installed library declares as optional are installed", async () => {
  const dir = fakeInstall({
    "ui-lib": { peerDependencies: { "@emotion/react": "^11.0.0", react: "^19" }, peerDependenciesMeta: { "@emotion/react": { optional: true } } },
  });
  assert.deepEqual([...declaredOptionalPeers(dir)], [["@emotion/react", "^11.0.0"]]);
  const calls = [];
  const run = async (args) => void calls.push(args);
  const result = await installOptionalPeers({ dir, unresolved: ["@emotion/react", "left-pad"], run });
  assert.deepEqual(result.installed, ["@emotion/react"]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("@emotion/react@^11.0.0"));
  assert.ok(!calls[0].some((arg) => arg.includes("left-pad")));
  assert.ok(!calls[0].some((arg) => arg.startsWith("react")), "no react installed here, so none is named");
  assert.match(result.warnings[0], /optional peer dependencies/);
});

test("optional peers: an installed React is named again so the install can't prune it", async () => {
  const dir = fakeInstall({
    "ui-lib": { peerDependencies: { "@emotion/react": "^11.0.0" }, peerDependenciesMeta: { "@emotion/react": { optional: true } } },
    react: { version: "19.1.0" },
    "react-dom": { version: "19.1.0" },
  });
  const calls = [];
  await installOptionalPeers({ dir, unresolved: ["@emotion/react"], run: async (args) => void calls.push(args) });
  assert.ok(calls[0].includes("react@19.1.0") && calls[0].includes("react-dom@19.1.0"));
});

test("companion packages: the mapping's install list is installed beside the library, with React kept", async () => {
  const dir = fakeInstall({ react: { version: "19.1.0" }, "react-dom": { version: "19.1.0" } });
  const calls = [];
  const result = await installExtraPackages({ dir, specs: ["@scope/tokens", "theme@^2", "@scope/tokens"], run: async (args) => void calls.push(args) });
  assert.deepEqual(result.installed, ["@scope/tokens", "theme@^2"]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 5), ["install", "@scope/tokens", "theme@^2", "react@19.1.0", "react-dom@19.1.0"]);
  assert.ok(calls[0].includes("--ignore-scripts"), "install scripts stay off");
  assert.match(result.warnings[0], /@scope\/tokens, theme@\^2 to install beside the library/);
  assert.deepEqual(await installExtraPackages({ dir, specs: [], run: async () => assert.fail("npm shouldn't run") }), { installed: [], warnings: [] });
});

test("companion packages: flags, paths, and URLs are refused before npm runs", async () => {
  for (const bad of ["--registry=http://evil.test", "../local", "https://example.test/x.tgz", "file:./x", "git+https://example.test/x.git", ""]) {
    await assert.rejects(installExtraPackages({ dir: tmpdir(), specs: [bad], run: async () => assert.fail("npm shouldn't run") }), /isn't a package name/, bad);
  }
});

test("companion packages: a mapping file can list them", () => {
  assert.deepEqual(parseMappingFile({ lib: { "live-region": { fixture: "a.js", install: ["@scope/tokens"] } } }).lib["live-region"].install, ["@scope/tokens"]);
  assert.throws(() => parseMappingFile({ lib: { "live-region": { install: "@scope/tokens" } } }), /Invalid mapping/);
});

test("optional peers: nothing is installed when the package is already there or isn't declared", async () => {
  const dir = fakeInstall({
    "ui-lib": { peerDependencies: { "@emotion/react": "^11.0.0" }, peerDependenciesMeta: { "@emotion/react": { optional: true } } },
    "@emotion/react": {},
  });
  const run = async () => assert.fail("npm shouldn't run");
  assert.deepEqual((await installOptionalPeers({ dir, unresolved: ["@emotion/react", "other"], run })).installed, []);
});

test("optional peers: an install failure says which packages and why", async () => {
  const dir = fakeInstall({ "ui-lib": { peerDependencies: { x: "1" }, peerDependenciesMeta: { x: { optional: true } } } });
  await assert.rejects(installOptionalPeers({ dir, unresolved: ["x"], run: async () => { throw new Error("npm error E404"); } }), /optional peer dependencies x: E404/);
});

test("candidateMapping: a button next to ButtonBase and ButtonGroup is still a template, but real parts make it a compound", () => {
  const flat = candidateMapping({ flavor: "react", exports: ["Button", "ButtonBase", "ButtonGroup", "ButtonGroupContext"].map((name) => ({ name, type: "function", parts: [] })) });
  assert.deepEqual([flat.button.export, flat.button.status], ["Button", "template"]);
  const parted = candidateMapping({ flavor: "react", exports: [{ name: "Button", type: "object", parts: ["Root", "Label"] }] });
  assert.equal(parted.button.status, "needs-fixture");
});

test("candidateMapping: matches by name, marks compound parts, and leaves the rest as gaps", () => {
  const exports = [
    { name: "Button", type: "function", parts: [] },
    { name: "IconButton", type: "function", parts: [] },
    { name: "Dialog", type: "function", parts: [] },
    { name: "DialogTrigger", type: "function", parts: [] },
    { name: "DialogContent", type: "function", parts: [] },
    { name: "Tabs", type: "object", parts: ["List", "Trigger", "Content"] },
    { name: "helper", type: "function", parts: [] },
  ];
  const map = candidateMapping({ flavor: "react", exports });
  assert.deepEqual([map.button.export, map.button.status], ["Button", "template"]);
  assert.deepEqual([map.dialog.export, map.dialog.status], ["Dialog", "needs-fixture"]);
  assert.deepEqual(map.tabs.parts, ["List", "Trigger", "Content"]);
  assert.equal(map.tabs.status, "needs-fixture");
  assert.equal(map.menu.status, "no-match");
  assert.match(map.menu.reason, /No export looks like the menu archetype/);
  const wcMap = candidateMapping({ flavor: "wc", tags: ["sl-button", "sl-dialog", "x-thing"] });
  assert.deepEqual([wcMap.button.tag, wcMap.button.status], ["sl-button", "template"]);
  assert.equal(wcMap.dialog.status, "needs-fixture");
});

test("--plan resolves versions and frameworks from the registry without installing", async () => {
  const result = await run(["compare", "ui=npm:fake-ui", "wc=npm:fake-wc", "npm:vue-lib", "npm:ghost", "--plan"]);
  assert.equal(result.code, 0, result.stderr);
  const [ui, wc, vue, ghost] = result.plan.targets;
  assert.deepEqual([ui.kind, ui.resolved.version, ui.resolved.framework], ["npm-react", "1.0.0", "React"]);
  assert.deepEqual([wc.kind, wc.resolved.framework], ["npm-wc", "Web components"]);
  assert.deepEqual([vue.kind, vue.resolved.framework], ["npm-unsupported", "Vue"]);
  assert.equal(ghost.status, "failed");
  assert.match(ghost.reason, /wasn't found on npm/);
  assert.equal(leftovers().length, 0);
});

test("React: a template covers the button, an authored fixture covers the dialog, and the rest are gaps", { skip }, async () => {
  const before = leftovers().length;
  const result = await run(["audit", "ui=npm:fake-ui", "--tiers", "rules"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.equal(target.status, "ran");
  assert.deepEqual([target.npm.name, target.npm.flavor, target.npm.version], ["fake-ui", "react", "1.0.0"]);

  const button = archetype(result, "button");
  assert.equal(button.status, "ran");
  assert.deepEqual(button.configs.map((c) => c.state), ["initial"]);
  assert.deepEqual(violations(button.configs[0], "axe"), []);

  const dialog = archetype(result, "dialog");
  assert.equal(dialog.status, "ran");
  assert.deepEqual(dialog.configs.map((c) => c.state), ["closed", "open"]);
  for (const config of dialog.configs) {
    assert.deepEqual(violations(config, "axe"), []);
    assert.deepEqual(violations(config, "ibm"), []);
  }

  for (const gap of ["tabs", "menu", "chart"]) assert.equal(archetype(result, gap).status, "gap", gap);
  assert.match(archetype(result, "menu").reason, /No export looks like the menu archetype/);
  assert.ok(target.summary.gaps.includes("archetype:tabs"));
  assert.equal(leftovers().length, before, "temporary folders are cleaned up");

  // The candidate mapping is written back for review, in the shape --mapping reads.
  assert.equal(result.mapping.ui.button.status, "template");
  assert.equal(result.mapping.ui.dialog.status, "authored");
  assert.match(result.mapping.ui.dialog.fixture, /fixtures\/ui\/dialog\.jsx$/);
  assert.equal(result.mapping.ui.dialog.reason, undefined);
  assert.equal(result.plan.targets[0].mapping.dialog.status, "authored");
  assert.match(result.report, /\| dialog \| ran \| authored \| closed, open \|/);
  assert.match(result.report, /\| tabs \| gap \|/);
});

test("React: the open state finds problems the closed state can't", { skip }, async () => {
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "dialog", "--tiers", "rules"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG_BAD } });
  const [closed, open] = archetype(result, "dialog").configs;
  assert.deepEqual(violations(closed, "axe"), []);
  assert.deepEqual(violations(open, "axe"), ["image-alt"]);
  assert.deepEqual(violations(open, "ibm"), ["img_alt_valid"]);
  assert.deepEqual(violations(closed, "ibm"), []);
  assert.match(result.report, /#### dialog \(open state\)\./);
});

test("the interactions tier runs on each fixture and lands in the results and the report", { skip }, async () => {
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button,dialog"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
  assert.equal(result.code, 0, result.stderr);
  const button = archetype(result, "button").configs[0].tiers.interactions;
  assert.equal(button.status, "ran");
  const byName = Object.fromEntries(button.checks.map((c) => [c.name, c.result]));
  assert.deepEqual(byName, { "trigger-reachable-by-tab": "pass", "focus-indicator-visible": "pass", "no-focus-trap": "pass", "enter-activates": "pass", "space-activates": "pass" });
  // Checks run once per archetype, in its first state.
  const dialog = archetype(result, "dialog");
  assert.equal(dialog.configs[0].tiers.interactions.status, "ran");
  assert.equal(dialog.configs[1].tiers.interactions, undefined);
  // This fake dialog doesn't move focus, trap it, or close on Escape. The checks say so.
  const dialogChecks = Object.fromEntries(dialog.configs[0].tiers.interactions.checks.map((c) => [c.name, c.result]));
  assert.equal(dialogChecks["focus-moves-into-dialog"], "fail");
  assert.equal(dialogChecks["escape-closes"], "fail");
  assert.deepEqual(result.results.targets[0].summary.interactions.fail > 0, true);
  assert.match(result.report, /#### Interactions\./);
  assert.match(result.report, /\| `escape-closes` \| fail \|/);
  assert.match(result.report, /\| ui \|[^\n]*ran, \w+ failed/);
});

test("the virtual screen reader walks each state, and the logs differ between closed and open", { skip }, async () => {
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "dialog", "--tiers", "rules,vsr"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
  const [closed, open] = archetype(result, "dialog").configs;
  assert.equal(closed.tiers.vsr.log[0].state, "closed");
  assert.equal(open.tiers.vsr.log[0].state, "open");
  const said = (config) => config.tiers.vsr.log[0].announcements.join("|");
  assert.doesNotMatch(said(closed), /Edit profile/);
  assert.match(said(open), /\|dialog\b/);
  assert.match(said(open), /Edit profile/);
  assert.equal(closed.tiers.vsr.simulated, true);
  assert.match(result.report, /\*\*Announcement log \(open state\)\.\*\*/);
});

test("web components: shadow content the virtual screen reader can't read is listed as not testable", { skip }, async () => {
  const fixture = `export default function mount(c) { c.innerHTML = '<fake-button data-a11y-trigger data-a11y-root>Save</fake-button>'; }\n`;
  const result = await run(["audit", "wc=npm:fake-wc", "--archetypes", "button", "--tiers", "rules,vsr"], { files: { "fixtures/wc/button.js": fixture } });
  const vsr = archetype(result, "button").configs[0].tiers.vsr;
  assert.match(vsr.notTestable[0], /open shadow root in <fake-button> \(1\)/);
  assert.match(result.results.targets[0].summary.notTestable.join("\n"), /button: open shadow root in <fake-button>/);
});

test("--lib-a11y runs a library's accessibility options both ways and labels each result", { skip }, async () => {
  // With the option on, the icon button gets a name. With it off, it has none.
  const fixture = `import { Button } from "fake-ui";\nexport default function Fixture({ libA11y }) {\n  return <Button data-a11y-trigger data-a11y-root aria-label={libA11y ? "Save" : undefined} />;\n}\n`;
  const files = { "fixtures/ui/button.jsx": fixture, "map.json": JSON.stringify({ ui: { button: { libA11y: true } } }) };
  const both = await run(["audit", "ui=npm:fake-ui", "--mapping", "map.json", "--archetypes", "button", "--tiers", "rules,vsr"], { files });
  assert.equal(both.code, 0, both.stderr);
  const configs = archetype(both, "button").configs;
  assert.deepEqual(configs.map((c) => c.libA11y), ["on", "off"]);
  assert.deepEqual(violations(configs[0], "axe"), []);
  assert.deepEqual(violations(configs[1], "axe"), ["button-name"]);
  assert.deepEqual(violations(configs[1], "ibm"), ["input_label_exists"]);
  assert.deepEqual(configs.map((c) => c.tiers.vsr.log[0].announcements), [["document", "main", "button, Save", "end of main", "end of document"], ["document", "main", "button", "end of main", "end of document"]]);
  assert.match(both.report, /#### button \(initial state, library accessibility on\)\./);
  assert.match(both.report, /#### button \(initial state, library accessibility off\)\./);
  assert.match(both.report, /\| button \| ran \| (template|authored) \| initial \| library accessibility on and off \|/);

  const onlyOn = await run(["audit", "ui=npm:fake-ui", "--mapping", "map.json", "--archetypes", "button", "--lib-a11y", "on", "--tiers", "rules"], { files });
  assert.deepEqual(archetype(onlyOn, "button").configs.map((c) => c.libA11y), ["on"]);

  // An archetype that doesn't declare the option runs once, unlabeled, whatever the flag says.
  const plain = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button", "--lib-a11y", "on,off", "--tiers", "rules"]);
  assert.deepEqual(archetype(plain, "button").configs.map((c) => c.libA11y), ["n/a"]);
});

test("--archetypes limits which archetypes run and which gaps show", { skip }, async () => {
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button,tabs", "--tiers", "rules"]);
  assert.deepEqual(Object.keys(result.results.targets[0].archetypes), ["button", "tabs"]);
});

test("a button template fails cleanly when the library drops data attributes", { skip }, async () => {
  const result = await run(["audit", "npm:fake-nospread", "--archetypes", "button", "--tiers", "rules"]);
  assert.equal(result.code, 4);
  const button = archetype(result, "button");
  assert.equal(button.status, "gap");
  assert.match(button.reason, /didn't render an element with data-a11y-trigger/);
  assert.equal(result.results.targets[0].status, "failed");
  assert.match(result.results.targets[0].reason, /No archetype had a usable fixture/);
  assert.equal(result.mapping["fake-nospread"].button.status, "needs-fixture");
});

test("a broken authored fixture is a gap with the reason, and the others still run", { skip }, async () => {
  const files = { "fixtures/ui/dialog.jsx": "export default function Fixture() { throw new Error('boom'); }\n", "fixtures/ui/tabs.jsx": 'import { Nope } from "does-not-exist";\nexport default () => null;\n' };
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button,dialog,tabs", "--tiers", "rules"], { files });
  assert.equal(archetype(result, "button").status, "ran");
  assert.equal(archetype(result, "dialog").status, "gap");
  assert.match(archetype(result, "dialog").reason, /boom|didn't render an element with data-a11y-trigger/);
  assert.equal(archetype(result, "tabs").status, "gap");
  assert.match(archetype(result, "tabs").reason, /didn't bundle|Could not resolve/);
});

test("a fixture with two triggers is rejected", { skip }, async () => {
  const fixture = 'import { Button } from "fake-ui";\nexport default () => (<><Button data-a11y-trigger>A</Button><Button data-a11y-trigger>B</Button></>);\n';
  const result = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button", "--tiers", "rules"], { files: { "fixtures/ui/button.jsx": fixture } });
  assert.match(archetype(result, "button").reason, /exactly one data-a11y-trigger\. It marked two\./);
});

test("--mapping points a target at its fixtures and overrides the export", { skip }, async () => {
  const files = {
    "elsewhere/my-dialog.jsx": REACT_DIALOG,
    "map.json": JSON.stringify({ ui: { dialog: { fixture: "elsewhere/my-dialog.jsx" }, button: { export: "Link" } } }),
  };
  const result = await run(["audit", "ui=npm:fake-ui", "--mapping", "map.json", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  assert.equal(archetype(result, "dialog").status, "ran");
  assert.equal(result.mapping.ui.button.export, "Link");
  assert.equal(archetype(result, "button").status, "ran");
});

test("--mapping errors exit 2", async () => {
  const bad = async (files, pattern) => {
    const result = await run(["audit", "ui=npm:fake-ui", "--mapping", "map.json", "--plan"], { files });
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, pattern);
  };
  await bad({}, /mapping file doesn't exist/);
  await bad({ "map.json": "{ nope" }, /isn't valid JSON/);
  await bad({ "map.json": JSON.stringify({ ui: { carousel: {} } }) }, /Invalid mapping/);
  await bad({ "map.json": JSON.stringify({ other: { button: {} } }) }, /which isn't a target in this run/);
});

test("web components: a template covers the button and an authored mount covers the dialog", { skip }, async () => {
  const result = await run(["audit", "wc=npm:fake-wc", "--archetypes", "button,dialog", "--tiers", "rules"], { files: { "fixtures/wc/dialog.js": WC_DIALOG } });
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.deepEqual([target.npm.flavor, target.npm.tags.sort()], ["wc", ["fake-button", "fake-dialog"]]);
  const button = archetype(result, "button");
  assert.equal(button.status, "ran");
  assert.deepEqual(violations(button.configs[0], "axe"), []);
  const dialog = archetype(result, "dialog");
  assert.deepEqual(dialog.configs.map((c) => c.state), ["closed", "open"]);
  assert.deepEqual(violations(dialog.configs[1], "axe"), []);
  assert.equal(result.plan.targets[0].kind, "npm-wc");
});

test("web components: a package that marks only CSS as having side effects still registers its elements", async () => {
  const dir = mkdtempSync(join(tmpdir(), "a11y-quiet-"));
  await installPackage({ dir, name: "quiet-wc", version: "1.0.0", flavor: "wc" });
  writeFileSync(join(dir, "fixture.js"), "export default function mount(container) { container.textContent = 'x'; }");
  writeFileSync(join(dir, "entry.js"), wcEntry(join(dir, "fixture.js"), "quiet-wc"));
  await bundleEntries({ entries: { demo: join(dir, "entry.js") }, outdir: join(dir, "out"), workDir: dir });
  assert.match(readFileSync(join(dir, "out", "demo.js"), "utf8"), /customElements\.define\("quiet-note"/, "the package's registration code is in the bundle");
});

test("web components: open shadow content is tested", { skip }, async () => {
  const fixture = `export default function mount(c) { c.innerHTML = '<fake-button data-a11y-trigger data-a11y-root></fake-button>'; }\n`;
  const result = await run(["audit", "wc=npm:fake-wc", "--archetypes", "button", "--tiers", "rules"], { files: { "fixtures/wc/button.js": fixture } });
  const button = archetype(result, "button");
  // The button is empty, so the native button inside the open shadow root has no name.
  assert.deepEqual(violations(button.configs[0], "axe"), ["button-name"]);
  assert.deepEqual(violations(button.configs[0], "ibm"), ["input_label_exists"]);
});

test("web components: a closed shadow root is reported as not testable, never as clean", { skip }, async () => {
  const result = await run(["audit", "npm:closed-wc", "--archetypes", "button", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.equal(target.npm.flavor, "wc");
  assert.deepEqual(violations(archetype(result, "button").configs[0], "axe"), []);
  assert.match(target.summary.notTestable[0], /button: closed shadow root in <closed-button>/);
  assert.match(result.report, /\*\*Not testable in closed-wc\.\*\*/);
});

test("a package that neither renders React nor defines custom elements is not applicable", { skip }, async () => {
  const result = await run(["audit", "npm:plain-utils", "--tiers", "rules"]);
  assert.equal(result.code, 4);
  assert.equal(result.results.targets[0].status, "not-applicable");
  assert.match(result.results.targets[0].reason, /no rendering surface/);
  assert.match(result.report, /This target is not-applicable/);
});

test("an unsupported framework is named, and nothing is installed", { skip }, async () => {
  const before = leftovers().length;
  const result = await run(["audit", "npm:vue-lib", "--tiers", "rules"]);
  assert.equal(result.code, 4);
  assert.equal(result.results.targets[0].status, "unsupported");
  assert.match(result.results.targets[0].reason, /Vue packages aren't supported/);
  assert.equal(leftovers().length, before);
});

test("an install failure fails that target and the comparison goes on", { skip }, async () => {
  const flaky = async (spec) => (spec.startsWith("flaky") ? { name: "flaky", version: "1.0.0", peerDependencies: { react: "*" } } : npmView(spec));
  const cwd = makeTree();
  const { io } = makeIo({ cwd, env: process.env });
  io.npmView = flaky;
  io.installPackage = installPackage;
  const code = await main(["compare", "npm:flaky", "npm:closed-wc", "--archetypes", "button", "--tiers", "rules"], io);
  assert.equal(code, 0);
  const results = JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8"));
  assert.deepEqual(results.targets.map((t) => t.status), ["failed", "ran"]);
  assert.match(results.targets[0].reason, /npm couldn't install flaky@1\.0\.0/);
});

test("the same npm audit twice gives the same findings", { skip }, async () => {
  const files = { "fixtures/ui/dialog.jsx": REACT_DIALOG_BAD };
  const one = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  const two = await run(["audit", "ui=npm:fake-ui", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  const strip = (r) => ({ ...r, runAt: null });
  assert.deepEqual(strip(two.results), strip(one.results));
});

test("candidateMapping: the archetype's own name beats a looser one, so a tooltip is chosen over a popover", () => {
  const map = candidateMapping({ flavor: "wc", tags: ["acme-popover", "acme-tooltip"] });
  assert.equal(map.tooltip.tag, "acme-tooltip");
  assert.deepEqual(map.tooltip.candidates, ["acme-tooltip", "acme-popover"]);
});
