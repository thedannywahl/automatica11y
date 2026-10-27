import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { TOPICS } from "../src/commands/guide.js";

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
/** @param {...string} parts */
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const bootstrapDir = join(root, "skills", "automatica11y");
const runnerDir = join(root, "skills", "automatica11y-runner");
const bootstrap = readFileSync(join(bootstrapDir, "SKILL.md"), "utf8");
const runner = readFileSync(join(runnerDir, "SKILL.md"), "utf8");
const agents = read("AGENTS.md");
const referenceFiles = readdirSync(join(runnerDir, "references")).map((name) => ({ name: `references/${name}`, text: readFileSync(join(runnerDir, "references", name), "utf8") }));
const docPages = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md") && !["agent-steps.md", "fixtures.md"].includes(name)).map((name) => ({ name: `docs/${name}`, text: read("docs", name) }));
const agentDocs = [{ name: "AGENTS.md", text: agents }, { name: "skills/automatica11y/SKILL.md", text: bootstrap }, { name: "skills/automatica11y-runner/SKILL.md", text: runner }, ...referenceFiles];

/** @param {string} version */
function series(version) {
  const [major, minor] = version.split(".");
  return major === "0" ? `${major}.${minor}` : major;
}

/** @param {string} text */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(match, "YAML frontmatter is present");
  const metadata = parse(match[1]);
  assert.ok(metadata && typeof metadata === "object" && !Array.isArray(metadata));
  for (const key of ["name", "compatibility", "description"]) {
    assert.equal(typeof metadata[key], "string", `${key} is a string`);
    assert.ok(metadata[key].trim().length > 0, `${key} is not empty`);
  }
  return metadata;
}

for (const [label, dir, text] of [["the bootstrap skill", bootstrapDir, bootstrap], ["the runner skill", runnerDir, runner]]) {
  test(`${label} has valid frontmatter, and its folder is named for it`, () => {
    const { name, compatibility, description } = frontmatter(text);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(name.length <= 64);
    assert.equal(dir.split("/").pop(), name);
    assert.ok(description.length <= 1024);
    assert.ok(compatibility.length <= 500);
    assert.ok(text.split("\n").length < 500);
  });
}

test("the runner's core stays small, and its references load on demand", () => {
  // About 5,000 tokens is the Agent Skills recommendation for an activated SKILL.md body.
  assert.ok(Buffer.byteLength(runner) < 20_000, `SKILL.md is ${Buffer.byteLength(runner)} bytes`);
  for (const { name, text } of referenceFiles) {
    assert.match(text, /^# \S/, `${name} opens with a heading`);
    if (text.split("\n").length > 100) assert.match(text, /^Contents:/m, `${name} lists its contents`);
  }
});

test("the bootstrap skill is a single portable file", () => {
  assert.deepEqual(readdirSync(bootstrapDir), ["SKILL.md"]);
});

test("bootstrap evals mock a single prefer-online guide command", () => {
  const tasksDir = join(root, "evals", "automatica11y", "tasks");
  let checked = 0;
  for (const name of readdirSync(tasksDir).filter((name) => name.endsWith(".yaml"))) {
    /** @type {{ command_mocks?: { name: string, responses: { args?: string[] }[] }[] }} */
    const task = parse(readFileSync(join(tasksDir, name), "utf8"));
    const npx = task.command_mocks?.find((command) => command.name === "npx");
    /** @type {{ args?: string[], fixture?: string }[]} */
    const guides = npx?.responses.filter((response) => response.args?.includes("guide")) ?? [];
    if (!guides.length) continue;
    const skill = guides.filter((response) => response.args?.at(-1) === "skill");
    assert.equal(skill.length, 1, name);
    assert.deepEqual(skill[0].args, ["--yes", "--prefer-online", "automatica11y@latest", "guide", "skill"], name);
    for (const response of guides.filter((r) => r !== skill[0])) {
      const topic = /** @type {string} */ (response.args?.at(-1));
      assert.deepEqual(response.args, ["--yes", "--prefer-online", "automatica11y@latest", "guide", topic], name);
      assert.ok(referenceFiles.some((ref) => ref.name === `references/${topic}.md`), `${name} mocks the reference topic ${topic}`);
      assert.equal(response.fixture, `mocks/guide-${topic}.md`, name);
    }
    checked += 1;
  }
  assert.ok(checked > 0);
});

test("evals mock the skill's prefer-online npx prefix", () => {
  const files = ["automatica11y-runner", "automatica11y"].flatMap((suite) => {
    const suiteDir = join(root, "evals", suite);
    return [join(suiteDir, "wazaEval.yaml"), ...readdirSync(join(suiteDir, "tasks")).filter((name) => name.endsWith(".yaml")).map((name) => join(suiteDir, "tasks", name))];
  });
  let checked = 0;
  for (const name of files) {
    /** @type {{ command_mocks?: { name: string, responses: { args?: string[] }[] }[] }} */
    const definition = parse(readFileSync(name, "utf8"));
    const npx = definition.command_mocks?.find((command) => command.name === "npx");
    for (const response of (npx?.responses ?? []).filter((r) => r.args)) {
      assert.deepEqual(response.args?.slice(0, 3), ["--yes", "--prefer-online", "automatica11y@latest"], name);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

test("outdated-browser evals wire consent graders and environment mocks", () => {
  const tasks = ["preflight-old-browser-choice.yaml", "preflight-old-browser-install-failed.yaml", "preflight-old-browser-install-declined.yaml"];
  for (const name of tasks) {
    /** @type {{ graders: { type: string }[], command_mocks: { name: string, responses: { args?: string[], fixture?: string, exit_code?: number }[] }[] }} */
    const task = parse(read("evals", "automatica11y-runner", "tasks", name));
    assert.ok(task.graders.some((grader) => grader.type === "prompt"), `${name} grades consent behavior`);
    assert.ok(task.graders.some((grader) => grader.type === "tool_constraint"), `${name} constrains installs and audits`);
    const responses = task.command_mocks.find((command) => command.name === "npx").responses;
    assert.ok(responses.some((response) => ["mocks/doctor-old-browser.json", "mocks/doctor-install-failed-outdated.json"].includes(response.fixture ?? "") && response.exit_code === 3 && response.args?.includes("--json")));
  }
});

test("the runner's version series matches package.json", () => {
  const stated = [...runner.matchAll(/\b\d+(?:\.\d+)?\.x\b/g)].map((match) => match[0]);
  assert.ok(stated.length > 0, "the runner states a version series");
  assert.deepEqual(new Set(stated), new Set([`${series(pkg.version)}.x`]));
});

test("skill and reference paths resolve", () => {
  const pointers = new Set([...runner.matchAll(/`(references\/[a-z-]+\.md)`/g)].map((m) => m[1]));
  assert.ok(pointers.size > 0);
  for (const pointer of pointers) assert.ok(existsSync(join(runnerDir, pointer)), `${pointer} exists`);
  for (const { name } of referenceFiles) assert.ok(pointers.has(name), `SKILL.md routes to ${name}`);
  for (const { name, text } of referenceFiles) assert.doesNotMatch(text, /`references\//, `${name} points to no further reference`);
  for (const path of [...agents.matchAll(/`(skills\/[^`]+)`/g)].map((m) => m[1])) assert.ok(existsSync(join(root, path)), `${path} exists`);
});

test("guide topics resolve to packaged files", () => {
  assert.deepEqual(Object.keys(TOPICS), ["agents", "skill", ...referenceFiles.map(({ name }) => name.slice("references/".length, -".md".length)).sort()]);
  for (const [topic, { file }] of Object.entries(TOPICS)) assert.ok(existsSync(join(root, file)), `${topic} prints ${file}`);
});

function knownFlags() {
  const common = read("src/commands/common.js");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const names = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => `--${m[1]}`);
  return new Set([...names, "--version", "--plan", "--yes", "--prefer-online", "--install-browser", "--json"]);
}

test("documented flags are supported", () => {
  const known = knownFlags();
  assert.ok(known.has("--fail-on-axe") && known.has("--lib-a11y") && known.has("--max-stories"));
  const used = new Set(agentDocs.flatMap(({ text }) => [...text.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0])));
  for (const flag of used) assert.ok(known.has(flag), `${flag} is a real flag`);
});

test("documented commands and guide topics are supported", () => {
  const allowed = new Set(["audit", "compare", "doctor", "guide", "--version"]);
  for (const { name, text } of agentDocs) {
    for (const m of text.matchAll(/automatica11y@latest ([a-z-]+)(?: ([a-z]+))?/g)) {
      assert.ok(allowed.has(m[1]), `${name} runs ${m[1]}`);
      if (m[1] === "guide" && m[2] && /^[a-z]+$/.test(m[2])) assert.ok(m[2] in TOPICS, `${name} names the guide topic ${m[2]}`);
    }
  }
});

test("documented scoped npm targets use the npm: prefix", () => {
  const localPackageMapping = /(^|\s)--local-package[ \t]+[^\s=]+=[^\s]+/g;
  const bareScopedTarget = /(^|[\s=`])@[a-z][\w-]*\/[\w.-]+/m;
  for (const example of ["--local-package @scope/ui=./dist", "automatica11y ci ui=npm:@scope/ui --local-package @scope/ui=./dist"]) {
    assert.doesNotMatch(example.replace(localPackageMapping, "$1--local-package <package>=<path>"), bareScopedTarget);
  }
  for (const example of ["automatica11y audit @scope/ui", "automatica11y audit @scope/ui --local-package @scope/ui=./dist", "automatica11y audit --local-package @scope/ui"]) {
    assert.match(example.replace(localPackageMapping, "$1--local-package <package>=<path>"), bareScopedTarget);
  }
  for (const { name, text } of [{ name: "README.md", text: read("README.md") }, ...docPages, ...agentDocs]) {
    const targets = text.replace(localPackageMapping, "$1--local-package <package>=<path>").replace(/^\s+"@[a-z][\w-]*\/[\w.-]+"(?=:)/gm, "  local-package-name:").replace(/^(\s*)@[a-z][\w-]*\/[\w.-]+=/gm, "$1package-name=");
    assert.doesNotMatch(targets, bareScopedTarget, `${name} has no bare scoped package as a target`);
    assert.doesNotMatch(text, /=(react-aria-components|@radix-ui)/, `${name} labels no bare package`);
  }
});

test("e2e tasks declare sandbox inputs and artifact checks", () => {
  const suiteDir = join(root, "evals", "e2e", "automatica11y-runner");
  for (const name of readdirSync(join(suiteDir, "tasks"))) {
    const task = parse(readFileSync(join(suiteDir, "tasks", name), "utf8"));
    assert.equal(task.inputs.context?.fixture, undefined, `${name} uses explicit input files`);
    if (task.id === "runner-e2e-unreachable") {
      const artifacts = task.graders.find((/** @type {{ name: string }} */ grader) => grader.name === "writes-failed-target-results");
      assert.deepEqual(artifacts.config.must_exist, ["a11y-report/plan.json", "a11y-report/results.json", "a11y-report/report.md"]);
      assert.equal(artifacts.config.content_patterns[0].path, "a11y-report/results.json");
      continue;
    }
    assert.ok(task.context_dir, `${name} overrides the extension's skill context directory`);
    assert.ok(task.inputs.files?.length > 0, `${name} copies files into the sandbox`);
    if (task.id === "runner-e2e-npm-local") {
      const suite = parse(readFileSync(join(suiteDir, "wazaEval.yaml"), "utf8"));
      assert.equal(task.context_dir, "evals/e2e/automatica11y-runner/fixtures/npm-local");
      assert.deepEqual(task.inputs.files.map((/** @type {{ path: string }} */ input) => input.path), ["a11y-eval-widgets-1.0.0.tgz", "widgets-README.md"]);
      assert.equal(task.inputs.follow_up_prompts.length, 2);
      assert.ok(suite.hooks.before_run.some((/** @type {{ command: string }} */ hook) => hook.command.includes("npm pack ./fixtures/packages/widgets --pack-destination ./fixtures/npm-local") && hook.command.includes("cp fixtures/packages/widgets/README.md fixtures/npm-local/widgets-README.md")));
      assert.ok(existsSync(join(suiteDir, "fixtures", "packages", "widgets", "package.json")));
      assert.ok(existsSync(join(suiteDir, "fixtures", "packages", "widgets", "README.md")));
      continue;
    }
    assert.ok(existsSync(join(root, task.context_dir)), `${name} resolves context_dir from the repository root`);
    for (const input of task.inputs.files) assert.ok(existsSync(join(root, task.context_dir, input.path)), `${name}: ${input.path}`);
  }
});

test("eval mocks match the version and guide this checkout ships", () => {
  const evalFiles = readdirSync(join(root, "evals"), { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".yaml"));
  let checked = 0;
  for (const name of evalFiles) {
    const definition = parse(read("evals", name));
    for (const command of definition.command_mocks ?? []) {
      if (command.name !== "npx") continue;
      for (const response of command.responses) {
        if (response.args?.at(-1) !== "--version" || !response.args.includes("automatica11y@latest") || !response.stdout?.trim()) continue;
        const version = response.stdout.trim();
        if (definition.id === "runner-preflight-version-mismatch") assert.notEqual(series(version), series(pkg.version), `${name} mocks a version outside the series`);
        else assert.equal(series(version), series(pkg.version), `${name} mocks automatica11y ${version}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0);
  assert.equal(read("evals", "automatica11y", "mocks", "guide-skill.md"), runner);
  assert.equal(read("evals", "automatica11y-runner", "mocks", "guide-skill.md"), runner);
  for (const suite of ["automatica11y", "automatica11y-runner"]) {
    for (const { name, text } of referenceFiles) assert.equal(read("evals", suite, "mocks", `guide-${name.slice("references/".length)}`), text, `${suite} mocks ${name}`);
  }
});
