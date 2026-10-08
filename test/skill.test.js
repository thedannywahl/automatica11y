import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { skillFiles, skillSeries } from "../src/commands/init-skill.js";
import { ownVersion } from "../src/env/versions.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const skillSource = readFileSync(join(root, "SKILL.md"), "utf8");

async function run(args, { cwd = makeTree(), home = makeTree() } = {}) {
  const { io, out } = makeIo({ cwd, env: { PATH: "", HOME: home } });
  const code = await main(args, io);
  return { code, cwd, home, ...out };
}

test("skillSeries: minor in 0.x, major from 1.0", () => {
  assert.equal(skillSeries("0.2.0"), "0.2");
  assert.equal(skillSeries("0.2.9"), "0.2");
  assert.equal(skillSeries("1.4.2"), "1");
});

test("SKILL.md has the frontmatter a skill needs", () => {
  const match = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skillSource);
  assert.ok(match, "frontmatter with name and description");
  assert.equal(match[1], "automatica11y");
  assert.ok(match[2].length <= 1024, "description fits in 1,024 characters");
  for (const trigger of ["accessib", "WCAG", "compare"]) assert.match(match[2], new RegExp(trigger, "i"), `description mentions ${trigger}`);
});

test("init-skill fills in the version series the skill expects", () => {
  const files = skillFiles("0.2.5");
  assert.doesNotMatch(files["SKILL.md"], /\{\{SERIES\}\}/);
  assert.match(files["SKILL.md"], /automatica11y \*\*0\.2\.x\*\*/);
  assert.match(files["SKILL.md"], /output doesn't start with `0\.2\.`/);
  assert.ok("references/fixtures.md" in files);
});

test("init-skill installs the skill and its references into the skills folder", async () => {
  const dest = makeTree();
  const result = await run(["init-skill", "--dest", dest]);
  assert.equal(result.code, 0, result.stderr);
  const target = join(dest, "automatica11y");
  assert.equal(readFileSync(join(target, "SKILL.md"), "utf8"), skillFiles()["SKILL.md"]);
  assert.ok(existsSync(join(target, "references", "fixtures.md")));
  assert.match(result.stdout, /Installed the skill at /);
  assert.match(result.stdout, new RegExp(`works with automatica11y ${skillSeries(ownVersion()).replace(".", "\\.")}\\.x`));
});

test("init-skill defaults to ~/.claude/skills, and expands ~ in --dest", async () => {
  const home = makeTree();
  assert.equal((await run(["init-skill"], { home })).code, 0);
  assert.ok(existsSync(join(home, ".claude", "skills", "automatica11y", "SKILL.md")));
  const other = makeTree();
  assert.equal((await run(["init-skill", "--dest", "~/elsewhere"], { home: other })).code, 0);
  assert.ok(existsSync(join(other, "elsewhere", "automatica11y", "SKILL.md")));
});

test("init-skill resolves a relative --dest from the working folder", async () => {
  const cwd = makeTree();
  assert.equal((await run(["init-skill", "--dest", "./.claude/skills"], { cwd })).code, 0);
  assert.ok(existsSync(join(cwd, ".claude", "skills", "automatica11y", "SKILL.md")));
});

test("running init-skill again changes nothing", async () => {
  const dest = makeTree();
  await run(["init-skill", "--dest", dest]);
  const again = await run(["init-skill", "--dest", dest]);
  assert.equal(again.code, 0);
  assert.match(again.stdout, /already up to date/);
});

test("init-skill won't overwrite a file that differs unless you say --force", async () => {
  const dest = makeTree();
  await run(["init-skill", "--dest", dest]);
  const file = join(dest, "automatica11y", "SKILL.md");
  writeFileSync(file, "my own edits\n");
  const refused = await run(["init-skill", "--dest", dest]);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /SKILL\.md/);
  assert.match(refused.stderr, /--force/);
  assert.equal(readFileSync(file, "utf8"), "my own edits\n", "the file was left alone");
  const forced = await run(["init-skill", "--dest", dest, "--force"]);
  assert.equal(forced.code, 0);
  assert.equal(readFileSync(file, "utf8"), skillFiles()["SKILL.md"]);
});

test("init-skill leaves other files in the skill folder alone", async () => {
  const dest = makeTree();
  mkdirSync(join(dest, "automatica11y"), { recursive: true });
  writeFileSync(join(dest, "automatica11y", "notes.txt"), "keep me");
  assert.equal((await run(["init-skill", "--dest", dest])).code, 0);
  assert.equal(readFileSync(join(dest, "automatica11y", "notes.txt"), "utf8"), "keep me");
});

test("an older skill is refused with a plain message, and --force updates it", async () => {
  const dest = makeTree();
  mkdirSync(join(dest, "automatica11y"), { recursive: true });
  writeFileSync(join(dest, "automatica11y", "SKILL.md"), skillSource.replaceAll("{{SERIES}}", "0.1"));
  const refused = await run(["init-skill", "--dest", dest]);
  assert.equal(refused.code, 2);
  assert.equal((await run(["init-skill", "--dest", dest, "--force"])).code, 0);
  assert.match(readFileSync(join(dest, "automatica11y", "SKILL.md"), "utf8"), new RegExp(`\\*\\*${skillSeries(ownVersion()).replace(".", "\\.")}\\.x\\*\\*`));
});

// ---- Guards that keep the skill honest about the tool ----

/** Every `--flag` the CLI accepts. */
function knownFlags() {
  const common = readFileSync(join(root, "src/commands/common.js"), "utf8");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const names = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => `--${m[1]}`);
  // --yes belongs to npx, and the rest belong to commands other than audit and compare.
  return new Set([...names, "--version", "--dest", "--force", "--plan", "--yes"]);
}

test("every flag SKILL.md and the references mention is a real flag", () => {
  const known = knownFlags();
  assert.ok(known.has("--fail-on-axe") && known.has("--lib-a11y") && known.has("--max-stories"), "the flag list was read");
  const text = [skillSource, ...readdirSync(join(root, "references")).map((f) => readFileSync(join(root, "references", f), "utf8"))].join("\n");
  const used = new Set([...text.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0]));
  for (const flag of used) assert.ok(known.has(flag), `${flag} is a real flag`);
});

test("every command SKILL.md runs exists, and every exit code it explains is real", () => {
  const commands = new Set([...skillSource.matchAll(/automatica11y@latest ([a-z-]+)/g)].map((m) => m[1]));
  for (const command of commands) assert.ok(["audit", "compare", "doctor", "init-skill", "--version"].includes(command) || command.startsWith("--"), command);
  const codes = [...skillSource.matchAll(/^\| (\d) \|/gm)].map((m) => Number(m[1]));
  assert.deepEqual(codes, [0, 1, 2, 3, 4]);
});

test("the archetypes SKILL.md lists match the tool's", async () => {
  const { ARCHETYPES } = await import("../src/schema.js");
  const line = /Choose from ([^.|]+)\./.exec(skillSource)[1].split(",").map((s) => s.trim());
  assert.deepEqual(line, ARCHETYPES);
});
