import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { TOPICS } from "../src/commands/guide.js";

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const bootstrapDir = join(root, "skills", "automatica11y");
const runnerDir = join(root, "skills", "automatica11y-runner");
const bootstrap = readFileSync(join(bootstrapDir, "SKILL.md"), "utf8");
const runner = readFileSync(join(runnerDir, "SKILL.md"), "utf8");
const agents = read("AGENTS.md");
const referenceFiles = readdirSync(join(runnerDir, "references")).map((name) => ({ name: `references/${name}`, text: readFileSync(join(runnerDir, "references", name), "utf8") }));
/** Every Markdown file an agent might be handed. */
const agentDocs = [{ name: "AGENTS.md", text: agents }, { name: "skills/automatica11y/SKILL.md", text: bootstrap }, { name: "skills/automatica11y-runner/SKILL.md", text: runner }, ...referenceFiles];

/** The version series a skill expects. In 0.x a minor version can change behavior, so it counts. From 1.0, the major version is enough. */
function series(version) {
  const [major, minor] = version.split(".");
  return major === "0" ? `${major}.${minor}` : major;
}

function frontmatter(text) {
  const match = /^---\nname: (.+)\ncompatibility: (.+)\ndescription: (.+)\n---\n/.exec(text);
  assert.ok(match, "frontmatter with name, compatibility, and description");
  return { name: match[1], compatibility: match[2], description: match[3] };
}

for (const [label, dir, text] of [["the bootstrap skill", bootstrapDir, bootstrap], ["the runner skill", runnerDir, runner]]) {
  test(`${label} has valid frontmatter, and its folder is named for it`, () => {
    const { name, compatibility, description } = frontmatter(text);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "the name is lowercase letters, numbers, and single hyphens");
    assert.ok(name.length <= 64);
    assert.equal(dir.split("/").pop(), name, "the folder is named for the skill");
    assert.ok(description.length <= 1024, "description fits in 1,024 characters");
    assert.ok(compatibility.length <= 500);
    assert.match(compatibility, /Node 20/);
    assert.ok(text.split("\n").length < 500, "the body stays under 500 lines");
  });
}

test("the bootstrap skill advertises the tool and stays tiny", () => {
  const { name, description } = frontmatter(bootstrap);
  assert.equal(name, "automatica11y");
  for (const trigger of ["accessib", "WCAG", "compare"]) assert.match(description, new RegExp(trigger, "i"), `description mentions ${trigger}`);
  assert.ok(bootstrap.split("\n").length < 40, "the bootstrap fits on a screen");
  assert.ok(bootstrap.includes("npx --yes automatica11y@latest guide"), "it sends the agent to the guide");
  assert.match(bootstrap, /node --version/);
  assert.match(bootstrap, /Don't guess at results/);
  assert.match(bootstrap, /exits with an error or prints no usable output, tell the user it failed, include the error text, and stop/);
  assert.match(bootstrap, /Don't continue with partial instructions/);
  assert.match(bootstrap, /no automated violations found/);
  assert.equal(existsSync(join(bootstrapDir, "references")), false, "the bootstrap has no references to lose");
  assert.doesNotMatch(bootstrap, /\d+\.\d+\.x/, "the bootstrap names no version, so it never goes stale");
  assert.deepEqual(readdirSync(bootstrapDir), ["SKILL.md"], "one file, so a user can copy it");
});

test("the runner skill says when to use it, and carries the steps", () => {
  const { name, description } = frontmatter(runner);
  assert.equal(name, "automatica11y-runner");
  assert.match(description, /AGENTS\.md|automatica11y skill/);
  for (const step of ["Check the version", "Check the setup", "Turn the request into a command", "npm packages need fixtures", "Run, then read the results", "Write the report", "When a target can't be tested"]) {
    assert.ok(runner.includes(step), step);
  }
});

test("no skill or guide names an agent, a vendor, or an agent-specific path", () => {
  // A slash command such as /automatica11y is agent-specific. A path such as skills/automatica11y/ is fine.
  const vendors = /claude|anthropic|openai|chatgpt|gemini|copilot|cursor|codex|\.claude|slash command|(^|[\s`])\/automatica11y\b/i;
  for (const { name, text } of agentDocs) assert.doesNotMatch(text, vendors, `${name} names no agent or agent-specific path`);
  assert.match(runner, /isn't tied to one agent/);
});

test("the series the runner names is the series of the version in package.json", () => {
  const stated = /automatica11y \*\*(\d+(?:\.\d+)?)\.x\*\*/.exec(runner);
  assert.ok(stated, "the runner states the series it works with");
  assert.equal(stated[1], series(pkg.version), "bump SKILL.md when the version series changes");
  assert.ok(runner.includes(`doesn't start with \`${stated[1]}.\``), "the stop rule uses the same series");
  assert.match(runner, /exits with an error or prints nothing, tell the user it failed, include the error text, and stop/);
  assert.ok(agents.includes(`(\`${stated[1]}.x\`)`), "AGENTS.md names the same series");
  assert.doesNotMatch(runner, /\{\{[A-Z]+\}\}/, "no placeholders are left in the file");
});

test("every file the runner points to exists, one level below it", () => {
  const pointers = new Set([...runner.matchAll(/`(references\/[a-z-]+\.md)`/g)].map((m) => m[1]));
  assert.ok(pointers.size > 0);
  for (const pointer of pointers) assert.ok(existsSync(join(runnerDir, pointer)), `${pointer} exists`);
  for (const { name, text } of referenceFiles) assert.doesNotMatch(text, /`references\//, `${name} points to no further reference`);
});

test("the guide topics print the files the docs say they print", () => {
  assert.deepEqual(Object.keys(TOPICS), ["agents", "skill", "fixtures"]);
  for (const [topic, { file }] of Object.entries(TOPICS)) assert.ok(existsSync(join(root, file)), `${topic} prints ${file}`);
  for (const topic of Object.keys(TOPICS)) assert.ok(readFileSync(join(root, "README.md"), "utf8").includes(topic), `the README names the ${topic} topic`);
});

// ---- Guards that keep the docs honest about the tool ----

/** Every `--flag` the CLI accepts. */
function knownFlags() {
  const common = read("src/commands/common.js");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const names = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => `--${m[1]}`);
  // --yes belongs to npx, and --plan also takes a file under `run`.
  return new Set([...names, "--version", "--plan", "--yes"]);
}

test("every flag the docs mention is a real flag", () => {
  const known = knownFlags();
  assert.ok(known.has("--fail-on-axe") && known.has("--lib-a11y") && known.has("--max-stories"), "the flag list was read");
  const used = new Set(agentDocs.flatMap(({ text }) => [...text.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0])));
  for (const flag of used) assert.ok(known.has(flag), `${flag} is a real flag`);
});

test("every command the docs run exists, and every guide topic they name is real", () => {
  const allowed = new Set(["audit", "compare", "doctor", "guide", "--version"]);
  for (const { name, text } of agentDocs) {
    for (const m of text.matchAll(/automatica11y@latest ([a-z-]+)(?: ([a-z]+))?/g)) {
      assert.ok(allowed.has(m[1]), `${name} runs ${m[1]}`);
      if (m[1] === "guide" && m[2] && /^[a-z]+$/.test(m[2])) assert.ok(m[2] in TOPICS, `${name} names the guide topic ${m[2]}`);
    }
  }
  const codes = [...runner.matchAll(/^\| (\d) \|/gm)].map((m) => Number(m[1]));
  assert.deepEqual(codes, [0, 1, 2, 3, 4]);
});

test("the archetypes the runner lists match the tool's", async () => {
  const { ARCHETYPES } = await import("../src/schema.js");
  const line = /Choose from ([^.|]+)\./.exec(runner)[1].split(",").map((s) => s.trim());
  assert.deepEqual(line, ARCHETYPES);
});

test("the runner carries a React example and a web component example, so it works without its references", () => {
  assert.match(runner, /```jsx[\s\S]*export default function Fixture\(\)[\s\S]*data-a11y-trigger[\s\S]*data-a11y-root[\s\S]*```/);
  assert.match(runner, /```js\nexport default function mount\(container\)[\s\S]*data-a11y-trigger[\s\S]*data-a11y-root[\s\S]*```/);
  assert.match(runner, /If you can't open it, run `npx --yes automatica11y@latest guide fixtures`/);
});

test("AGENTS.md bridges to the runner, and tells contributors what to run", () => {
  assert.ok(agents.includes("npx --yes automatica11y@latest guide skill"));
  assert.ok(agents.includes("npx --yes automatica11y@latest guide fixtures"));
  for (const path of [...agents.matchAll(/`(skills\/[^`]+)`/g)].map((m) => m[1])) assert.ok(existsSync(join(root, path)), `${path} exists`);
  assert.match(agents, /npm test/);
  assert.match(agents, /npm run lint/);
  assert.match(agents, /ships in the npm package/);
});

test("the fixture reference mentions both hooks and both flavors", () => {
  const fixtures = referenceFiles.find((f) => f.name === "references/fixtures.md").text;
  for (const must of ["data-a11y-trigger", "data-a11y-root", "mount(container", "libA11y", "fixtures/<target id>/<archetype>"]) assert.ok(fixtures.includes(must), must);
});
