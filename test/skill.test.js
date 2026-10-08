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
  assert.match(bootstrap, /Keep the user's request as they gave it: the target or targets, and any settings they named/);
  assert.match(bootstrap, /After reading the steps, pass only settings they list as supported\. If the user named a setting they don't list as supported, tell the user which setting is unsupported, list the supported values from the steps, and ask which to use/);
  assert.match(bootstrap, /Don't ask again for anything they've already said/);
  assert.ok(bootstrap.includes("npx --yes automatica11y@latest guide skill"), "it runs the steps directly, with no detour through the overview");
  assert.match(bootstrap, /If the error mentions `ETARGET` \(npm says a version doesn't exist, usually because its local list is out of date\), run the command once more with `--prefer-online`: `npx --yes --prefer-online automatica11y@latest guide skill`/);
  assert.match(bootstrap, /If the command exits with an error or prints no usable output, including after that retry, tell the user it failed, include the error text, and stop/);
  // The check comes after the guide is read, so the agent has the supported values when it needs them.
  assert.ok(bootstrap.indexOf("guide skill\n   ```") < bootstrap.indexOf("After reading the steps"), "the unsupported-setting check comes after the command that prints the steps");
  assert.doesNotMatch(bootstrap.slice(0, bootstrap.indexOf("npx --yes")), /supported/, "nothing before the guide asks the agent to know the supported values");
  assert.doesNotMatch(bootstrap, /(^|\s)--(?!yes\b|version\b|prefer-online\b)[a-z]/m, "the bootstrap lists no tool flags (--yes and --prefer-online belong to npx, --version to node), so it can't fall out of step with the tool");
  assert.match(bootstrap, /fails or prints no version number, tell the user that Node\.js 20 or newer couldn't be verified, include the error text, and stop/);
  assert.match(bootstrap, /Don't guess at results/);
  assert.match(bootstrap, /exits with an error or prints no usable output, including after that retry, tell the user it failed, include the error text, and stop/);
  assert.match(bootstrap, /Don't continue with partial instructions/);
  assert.doesNotMatch(bootstrap, /no automated violations found|attestation/, "the wording rules live in the runner");
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
  assert.match(runner, /Use the target and the settings the user already gave, and ask only for what's missing/);
  assert.match(agents, /Keep the user's request as they gave it, including the target and any settings they named/);
  assert.match(runner, /Pass only the options in the table above, with the values it lists\. If the user names a setting the tool doesn't have, or a value outside those lists/);
  assert.match(runner, /Don't substitute a default or invent a value/);
  // What the five end-to-end runs showed was missing.
  assert.match(runner, /Do sections 1 and 2 before you run an audit\. A question to the user about a missing target or an unsupported setting \(section 3\) can come before or after them/);
  assert.match(runner, /ask them together in one message, then go on/);
  assert.match(runner, /even when they're different kinds, such as a live page and an npm package/);
  assert.match(runner, /`needs-fixture` means the tool found the component but can't build it from a template\. `no-match` means no export or custom element looks like that archetype/);
  assert.match(runner, /For a `no-match` archetype, write a fixture only if the library's documentation names a component, or a documented way, to make it/);
  assert.match(runner, /A target that failed while others ran still exits 0, and the failure is in the results/);
  assert.match(runner, /order axe-core findings by impact and IBM findings by Toolkit level/);
  assert.match(runner, /you may run the same command once more\. If it fails again, report it/);
  // A request with no target is asked about, and a target that fails is named with its reason.
  assert.match(runner, /If the user doesn't name a target to test \(a URL, a Storybook, a local page or site, or an npm package\), ask for one before you run anything/);
  assert.match(runner, /Tell the user which target failed, using the reason from `results\.json`/);
  assert.match(runner, /If every target failed \(exit code 4\), stop\. If others ran, report them, and list the failed target as a gap/);
  // The wording rule says when to use the phrase, and what to do when there are violations.
  assert.match(runner, /Where an engine reports zero violations for a target, say "no automated violations found" for that engine\. Where it reports violations, list them as the tool reports them/);
  assert.match(runner, /Use "no automated violations found" only for an engine that reported none for that target/);
  assert.doesNotMatch(runner, /Say "no automated violations found\."/, "no unconditional instruction to say the phrase");
  assert.doesNotMatch(agents, /matches the version of the tool you're running/, "AGENTS.md doesn't claim a match that @latest can't promise");
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
  // --yes and --prefer-online belong to npx, and --plan also takes a file under `run`.
  return new Set([...names, "--version", "--plan", "--yes", "--prefer-online"]);
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

test("the docs write npm packages with the npm: prefix, as the tool requires", () => {
  const readme = read("README.md");
  for (const { name, text } of [{ name: "README.md", text: readme }, ...agentDocs]) {
    assert.doesNotMatch(text, /(^|[\s=`])@[a-z][\w-]*\/[\w.-]+/m, `${name} has no bare scoped package as a target`);
    assert.doesNotMatch(text, /=(react-aria-components|@radix-ui)/, `${name} labels no bare package`);
  }
  assert.match(readme, /compare radix=npm:@radix-ui\/react-dialog aria=npm:react-aria-components/);
  assert.match(runner, /\| An npm package \| `npm:name`, `npm:@scope\/name`, or `npm:name@version` \|/);
  assert.match(runner, /A bare word such as `button` is a path: the folder or file `\.\/button`\. Always write an npm package with the `npm:` prefix/);
  assert.match(readme, /Write `npm:button` to pick the package/);
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
  assert.match(agents, /If `npm test` can't run because Chrome or Chromium is missing, or if either command fails, stop\. Report the exact error and the command that failed, and don't report the change as complete/);
  assert.match(agents, /a run that prints skipped tests isn't a pass either/);
  assert.match(agents, /npm run lint/);
  assert.match(agents, /ships in the npm package/);
  assert.match(agents, /If the version check in the steps reports a mismatch, stop\. Report the installed version and the version the steps expect, and don't produce an audit or compare result until the user confirms how to proceed/);
  assert.match(agents, /If the request doesn't name a target, ask for the target once, then continue with the steps\. Use the defaults in the steps for any setting the user didn't name/);
  assert.match(agents, /That's only another way to get the text\. If a guide command has already failed, stop as described above\. Reading the files doesn't change that/);
  assert.match(runner, /Tell the user the version you got and the series this copy expects/);
  assert.match(runner, /Don't run an audit until the user confirms how to proceed/);
  assert.match(agents, /print the copy that comes with the latest release, and the steps they print check that the tool's version matches/);
  assert.match(agents, /If either guide command fails, stop\. Report the exact error to the user, and don't produce an audit or compare result from memory/);
  assert.match(agents, /The series is the major and minor version while the major version is 0 \(`0\.2`\), and the major version alone from 1\.0 on/);
  assert.match(agents, /whenever the series of the version in `package\.json` changes, for example from `0\.2\.x` to `0\.3\.0`\. A change from `0\.2\.5` to `0\.2\.6` needs no update/);
});

test("the fixture guide says what to do when the documentation falls short, names the command, and agrees with its own examples", () => {
  const fixtures = referenceFiles.find((f) => f.name === "references/fixtures.md").text;
  assert.match(fixtures, /If the documentation doesn't cover the API you need, or you can't read it, don't guess\. Leave the archetype without a fixture, so the report lists it as a gap/);
  assert.match(fixtures, /Don't stand in a plain element for the library's component/);
  assert.match(runner, /don't guess, and don't stand in a plain element for the library's component/);
  assert.match(fixtures, /in the working folder: the folder where you run `automatica11y audit` or `automatica11y compare`/);
  assert.match(fixtures, /If nothing in the archetype can be activated, as with a chart, put `data-a11y-trigger` and `data-a11y-root` on the same element/);
  assert.match(runner, /If nothing can be activated, as with a chart, put both attributes on the same outermost element/);
  assert.match(fixtures, /Include every part the library's documentation marks as required/);
  assert.match(fixtures, /make `mount\(container\)` the file's default export\. It adds the archetype to the container/);
  assert.match(runner, /For web components, the default export is the function `mount\(container\)`/);
  assert.match(fixtures, /The tool activates the trigger by clicking it\. For a tooltip it focuses the trigger instead, so a tooltip has to open on focus\. If it opens only on pointer hover, the open state never appears/);
  assert.match(fixtures, /is then attached to the document, isn't `display: none` or `hidden`, and isn't `visibility: hidden`\. The tool also counts the surface as open if the trigger has `aria-expanded="true"`\. If neither holds, the open state is reported as failed, with the reason/);
  assert.match(fixtures, /use the library's documented way to render your own element in its place \(for example, `asChild` in Radix, or the `as` prop in Headless UI\), and put the attribute on that native element\. If the library has no such way, leave the archetype as a gap/);
  assert.match(fixtures, /Don't wrap the library's component in an element you add and mark that element/);
  assert.match(runner, /Don't wrap the library's component in an element you add and mark that/);
  assert.match(fixtures, /Declare it at the archetype level in the mapping file, next to `fixture` or `export`, for example `\{ "charts": \{ "chart": \{ "libA11y": true \} \} \}`/);
  // "Hooks" reads as React hooks, so the docs name the attributes.
  for (const { name, text } of agentDocs) assert.doesNotMatch(text, /\bhooks?\b/i, `${name} says attributes, not hooks`);
  // The contract says one trigger, so no example may leave it out.
  for (const [, code] of fixtures.matchAll(/```jsx\n([\s\S]*?)```/g)) assert.match(code, /data-a11y-trigger/, "every example in the guide marks a trigger");
  for (const [, code] of runner.matchAll(/```jsx\n([\s\S]*?)```/g)) assert.match(code, /data-a11y-trigger/, "every example in the runner marks a trigger");
});

test("the fixture reference mentions both hooks and both flavors", () => {
  const fixtures = referenceFiles.find((f) => f.name === "references/fixtures.md").text;
  for (const must of ["data-a11y-trigger", "data-a11y-root", "mount(container", "libA11y", "fixtures/<target id>/<archetype>"]) assert.ok(fixtures.includes(must), must);
});
