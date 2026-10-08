import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { detectFlavor } from "../src/plan/resolve-npm.js";
import { candidateMapping } from "../src/plan/mapping.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const packages = new URL("./fixtures/packages/", import.meta.url).pathname;
const repoModules = new URL("../node_modules/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

/** Registry metadata for the fake packages, as `npm view` would return it. */
const REGISTRY = {
  "fake-ui": { name: "fake-ui", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-nospread": { name: "fake-nospread", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-wc": { name: "fake-wc", version: "1.0.0", customElements: "custom-elements.json" },
  "closed-wc": { name: "closed-wc", version: "2.0.0" },
  "plain-utils": { name: "plain-utils", version: "3.0.0" },
  "vue-lib": { name: "vue-lib", version: "1.0.0", peerDependencies: { vue: "^3" } },
};

const npmView = async (spec) => {
  const name = spec.replace(/@[^@/]*$/, "");
  const meta = REGISTRY[name];
  if (!meta) throw new Error(`"${spec}" wasn't found on npm.`);
  return meta;
};

/** Stand in for npm: copy the fake package into the install folder and link the repo's React. */
async function installPackage({ dir, name, version, flavor }) {
  if (!REGISTRY[name]) throw new Error(`npm couldn't install ${name}@${version}: not found`);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  cpSync(join(packages, name), join(dir, "node_modules", name), { recursive: true });
  if (flavor === "react") {
    for (const dep of ["react", "react-dom", "scheduler"]) if (existsSync(join(repoModules, dep))) symlinkSync(join(repoModules, dep), join(dir, "node_modules", dep));
  }
  const react = flavor === "react" ? JSON.parse(readFileSync(join(repoModules, "react", "package.json"), "utf8")).version : null;
  return { dir, warnings: [], react, reactDom: react, version };
}

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
  const result = await run(["compare", "ui=fake-ui", "wc=fake-wc", "vue-lib", "ghost", "--plan"]);
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
  const result = await run(["audit", "ui=fake-ui", "--tiers", "rules"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
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
  assert.match(result.report, /\| dialog \| ran \| closed, open \|/);
  assert.match(result.report, /\| tabs \| gap \|/);
});

test("React: the open state finds problems the closed state can't", { skip }, async () => {
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "dialog", "--tiers", "rules"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG_BAD } });
  const [closed, open] = archetype(result, "dialog").configs;
  assert.deepEqual(violations(closed, "axe"), []);
  assert.deepEqual(violations(open, "axe"), ["image-alt"]);
  assert.deepEqual(violations(open, "ibm"), ["img_alt_valid"]);
  assert.deepEqual(violations(closed, "ibm"), []);
  assert.match(result.report, /#### dialog \(open state\)\./);
});

test("the interactions tier runs on each fixture and lands in the results and the report", { skip }, async () => {
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "button,dialog"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
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
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "dialog", "--tiers", "rules,vsr"], { files: { "fixtures/ui/dialog.jsx": REACT_DIALOG } });
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
  const result = await run(["audit", "wc=fake-wc", "--archetypes", "button", "--tiers", "rules,vsr"], { files: { "fixtures/wc/button.js": fixture } });
  const vsr = archetype(result, "button").configs[0].tiers.vsr;
  assert.match(vsr.notTestable[0], /open shadow root in <fake-button> \(1\)/);
  assert.match(result.results.targets[0].summary.notTestable.join("\n"), /button: open shadow root in <fake-button>/);
});

test("--archetypes limits which archetypes run and which gaps show", { skip }, async () => {
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "button,tabs", "--tiers", "rules"]);
  assert.deepEqual(Object.keys(result.results.targets[0].archetypes), ["button", "tabs"]);
});

test("a button template fails cleanly when the library drops data attributes", { skip }, async () => {
  const result = await run(["audit", "fake-nospread", "--archetypes", "button", "--tiers", "rules"]);
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
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "button,dialog,tabs", "--tiers", "rules"], { files });
  assert.equal(archetype(result, "button").status, "ran");
  assert.equal(archetype(result, "dialog").status, "gap");
  assert.match(archetype(result, "dialog").reason, /boom|didn't render an element with data-a11y-trigger/);
  assert.equal(archetype(result, "tabs").status, "gap");
  assert.match(archetype(result, "tabs").reason, /didn't bundle|Could not resolve/);
});

test("a fixture with two triggers is rejected", { skip }, async () => {
  const fixture = 'import { Button } from "fake-ui";\nexport default () => (<><Button data-a11y-trigger>A</Button><Button data-a11y-trigger>B</Button></>);\n';
  const result = await run(["audit", "ui=fake-ui", "--archetypes", "button", "--tiers", "rules"], { files: { "fixtures/ui/button.jsx": fixture } });
  assert.match(archetype(result, "button").reason, /exactly one data-a11y-trigger\. It marked two\./);
});

test("--mapping points a target at its fixtures and overrides the export", { skip }, async () => {
  const files = {
    "elsewhere/my-dialog.jsx": REACT_DIALOG,
    "map.json": JSON.stringify({ ui: { dialog: { fixture: "elsewhere/my-dialog.jsx" }, button: { export: "Link" } } }),
  };
  const result = await run(["audit", "ui=fake-ui", "--mapping", "map.json", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  assert.equal(archetype(result, "dialog").status, "ran");
  assert.equal(result.mapping.ui.button.export, "Link");
  assert.equal(archetype(result, "button").status, "ran");
});

test("--mapping errors exit 2", async () => {
  const bad = async (files, pattern) => {
    const result = await run(["audit", "ui=fake-ui", "--mapping", "map.json", "--plan"], { files });
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, pattern);
  };
  await bad({}, /mapping file doesn't exist/);
  await bad({ "map.json": "{ nope" }, /isn't valid JSON/);
  await bad({ "map.json": JSON.stringify({ ui: { carousel: {} } }) }, /Invalid mapping/);
  await bad({ "map.json": JSON.stringify({ other: { button: {} } }) }, /which isn't a target in this run/);
});

test("web components: a template covers the button and an authored mount covers the dialog", { skip }, async () => {
  const result = await run(["audit", "wc=fake-wc", "--archetypes", "button,dialog", "--tiers", "rules"], { files: { "fixtures/wc/dialog.js": WC_DIALOG } });
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

test("web components: open shadow content is tested", { skip }, async () => {
  const fixture = `export default function mount(c) { c.innerHTML = '<fake-button data-a11y-trigger data-a11y-root></fake-button>'; }\n`;
  const result = await run(["audit", "wc=fake-wc", "--archetypes", "button", "--tiers", "rules"], { files: { "fixtures/wc/button.js": fixture } });
  const button = archetype(result, "button");
  // The button is empty, so the native button inside the open shadow root has no name.
  assert.deepEqual(violations(button.configs[0], "axe"), ["button-name"]);
  assert.deepEqual(violations(button.configs[0], "ibm"), ["input_label_exists"]);
});

test("web components: a closed shadow root is reported as not testable, never as clean", { skip }, async () => {
  const result = await run(["audit", "closed-wc", "--archetypes", "button", "--tiers", "rules"]);
  assert.equal(result.code, 0, result.stderr);
  const target = result.results.targets[0];
  assert.equal(target.npm.flavor, "wc");
  assert.deepEqual(violations(archetype(result, "button").configs[0], "axe"), []);
  assert.match(target.summary.notTestable[0], /button: closed shadow root in <closed-button>/);
  assert.match(result.report, /\*\*Not testable in closed-wc\.\*\*/);
});

test("a package that neither renders React nor defines custom elements is not applicable", { skip }, async () => {
  const result = await run(["audit", "plain-utils", "--tiers", "rules"]);
  assert.equal(result.code, 4);
  assert.equal(result.results.targets[0].status, "not-applicable");
  assert.match(result.results.targets[0].reason, /no rendering surface/);
  assert.match(result.report, /This target is not-applicable/);
});

test("an unsupported framework is named, and nothing is installed", { skip }, async () => {
  const before = leftovers().length;
  const result = await run(["audit", "vue-lib", "--tiers", "rules"]);
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
  const code = await main(["compare", "flaky", "closed-wc", "--archetypes", "button", "--tiers", "rules"], io);
  assert.equal(code, 0);
  const results = JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8"));
  assert.deepEqual(results.targets.map((t) => t.status), ["failed", "ran"]);
  assert.match(results.targets[0].reason, /npm couldn't install flaky@1\.0\.0/);
});

test("the same npm audit twice gives the same findings", { skip }, async () => {
  const files = { "fixtures/ui/dialog.jsx": REACT_DIALOG_BAD };
  const one = await run(["audit", "ui=fake-ui", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  const two = await run(["audit", "ui=fake-ui", "--archetypes", "button,dialog", "--tiers", "rules"], { files });
  const strip = (r) => ({ ...r, runAt: null });
  assert.deepEqual(strip(two.results), strip(one.results));
});
