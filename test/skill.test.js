import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const skillSource = readFileSync(join(root, "SKILL.md"), "utf8");
const referenceFiles = readdirSync(join(root, "references")).map((name) => ({ name, text: readFileSync(join(root, "references", name), "utf8") }));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** The version series a skill expects. In 0.x a minor version can change behavior, so it counts. From 1.0, the major version is enough. */
function series(version) {
  const [major, minor] = version.split(".");
  return major === "0" ? `${major}.${minor}` : major;
}

test("SKILL.md has the frontmatter a skill needs", () => {
  const match = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skillSource);
  assert.ok(match, "frontmatter with name and description");
  assert.equal(match[1], "automatica11y");
  assert.ok(match[2].length <= 1024, "description fits in 1,024 characters");
  for (const trigger of ["accessib", "WCAG", "compare"]) assert.match(match[2], new RegExp(trigger, "i"), `description mentions ${trigger}`);
});

test("the skill isn't tied to one agent", () => {
  // A slash command such as /automatica11y is agent-specific. A path such as node_modules/automatica11y/ is fine.
  const vendors = /claude|anthropic|openai|chatgpt|gemini|copilot|cursor|codex|\.claude|slash command|(^|[\s`])\/automatica11y\b/i;
  for (const { name, text } of [{ name: "SKILL.md", text: skillSource }, ...referenceFiles]) {
    assert.doesNotMatch(text, vendors, `${name} names no agent or agent-specific path`);
  }
  assert.match(skillSource, /isn't tied to one agent/);
});

test("the series SKILL.md names is the series of the version in package.json", () => {
  const stated = /automatica11y \*\*(\d+(?:\.\d+)?)\.x\*\*/.exec(skillSource);
  assert.ok(stated, "the skill states the series it works with");
  assert.equal(stated[1], series(pkg.version), "bump SKILL.md when the version series changes");
  assert.ok(skillSource.includes(`doesn't start with \`${stated[1]}.\``), "the stop rule uses the same series");
  assert.doesNotMatch(skillSource, /\{\{[A-Z]+\}\}/, "no placeholders are left in the file");
});

// ---- Guards that keep the skill honest about the tool ----

/** Every `--flag` the CLI accepts. */
function knownFlags() {
  const common = readFileSync(join(root, "src/commands/common.js"), "utf8");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const names = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => `--${m[1]}`);
  // --yes belongs to npx, and --plan also takes a file under `run`.
  return new Set([...names, "--version", "--plan", "--yes"]);
}

test("every flag SKILL.md and the references mention is a real flag", () => {
  const known = knownFlags();
  assert.ok(known.has("--fail-on-axe") && known.has("--lib-a11y") && known.has("--max-stories"), "the flag list was read");
  const text = [skillSource, ...referenceFiles.map((f) => f.text)].join("\n");
  const used = new Set([...text.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0]));
  for (const flag of used) assert.ok(known.has(flag), `${flag} is a real flag`);
});

test("every command SKILL.md runs exists, and every exit code it explains is real", () => {
  const commands = new Set([...skillSource.matchAll(/automatica11y@latest ([a-z-]+)/g)].map((m) => m[1]));
  assert.ok(commands.has("doctor") && commands.has("audit") && commands.has("compare"));
  for (const command of commands) assert.ok(["audit", "compare", "doctor", "--version"].includes(command) || command.startsWith("--"), command);
  const codes = [...skillSource.matchAll(/^\| (\d) \|/gm)].map((m) => Number(m[1]));
  assert.deepEqual(codes, [0, 1, 2, 3, 4]);
});

test("the archetypes SKILL.md lists match the tool's", async () => {
  const { ARCHETYPES } = await import("../src/schema.js");
  const line = /Choose from ([^.|]+)\./.exec(skillSource)[1].split(",").map((s) => s.trim());
  assert.deepEqual(line, ARCHETYPES);
});

test("the fixture reference mentions both hooks and both flavors", () => {
  const fixtures = referenceFiles.find((f) => f.name === "fixtures.md").text;
  for (const must of ["data-a11y-trigger", "data-a11y-root", "mount(container", "libA11y", "fixtures/<target id>/<archetype>"]) assert.ok(fixtures.includes(must), must);
});
