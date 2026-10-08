import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ownVersion } from "../env/versions.js";
import { EXIT, UsageError } from "./common.js";

const SKILL_NAME = "automatica11y";
const PACKAGE_ROOT = new URL("../../", import.meta.url).pathname;

/**
 * The version series a skill expects of the tool. In the 0.x series a minor version can change behavior, so it counts.
 * From 1.0 on, the major version is enough.
 * @param {string} version
 */
export function skillSeries(version) {
  const [major, minor] = version.split(".");
  return major === "0" ? `${major}.${minor}` : major;
}

/** The files that make up the skill, as relative path to contents, with the version series filled in. */
export function skillFiles(version = ownVersion()) {
  const series = skillSeries(version);
  /** @type {Record<string, string>} */
  const files = { "SKILL.md": readFileSync(join(PACKAGE_ROOT, "SKILL.md"), "utf8").replaceAll("{{SERIES}}", series) };
  const refs = join(PACKAGE_ROOT, "references");
  if (existsSync(refs)) {
    for (const name of readdirSync(refs).sort()) files[`references/${name}`] = readFileSync(join(refs, name), "utf8");
  }
  return files;
}

/** Expand a leading `~` in a path the user typed. */
function expand(path, home) {
  return path === "~" || path.startsWith("~/") ? join(home, path.slice(1)) : path;
}

/**
 * Install the skill: copy SKILL.md and its references into `<dest>/automatica11y/`.
 * It never overwrites a file that differs unless you pass --force.
 * @param {string[]} argv
 * @param {import("./common.js").Io} io
 */
export async function initSkillCommand(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: { dest: { type: "string" }, force: { type: "boolean" }, help: { type: "boolean", short: "h" } }, allowPositionals: false, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.split(". ")[0] : String(error));
  }
  if (parsed.values.help) {
    io.stdout.write(`Usage: automatica11y init-skill [--dest <dir>] [--force]\n\nInstall the automatica11y skill for Claude.\n\n  --dest <dir>   The skills folder to install into. Default ~/.claude/skills.\n                 Use ./.claude/skills to install for one project only.\n  --force        Overwrite files that differ from this version's skill.\n`);
    return EXIT.OK;
  }
  const home = io.env.HOME ?? homedir();
  const skillsDir = resolve(io.cwd, expand(parsed.values.dest ?? "~/.claude/skills", home));
  const target = join(skillsDir, SKILL_NAME);
  const files = skillFiles();

  const differs = Object.entries(files).filter(([name, text]) => {
    const file = join(target, name);
    return existsSync(file) && readFileSync(file, "utf8") !== text;
  });
  if (differs.length && !parsed.values.force) {
    io.stderr.write(`The skill is already installed at ${target}, and ${differs.length === 1 ? "this file differs" : "these files differ"} from this version:\n${differs.map(([name]) => `  ${name}`).join("\n")}\nRun again with --force to replace ${differs.length === 1 ? "it" : "them"}.\n`);
    return EXIT.USAGE;
  }
  const written = [];
  for (const [name, text] of Object.entries(files)) {
    const file = join(target, name);
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
    written.push(name);
  }
  const series = skillSeries(ownVersion());
  io.stdout.write(
    written.length === 0
      ? `The skill is already up to date at ${target}.\n`
      : `Installed the skill at ${target}:\n${written.map((name) => `  ${name}`).join("\n")}\n`,
  );
  io.stdout.write(`It works with automatica11y ${series}.x. Ask Claude to check the accessibility of something, or run /automatica11y.\n`);
  return EXIT.OK;
}
