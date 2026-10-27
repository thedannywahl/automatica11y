import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { EXIT, UsageError } from "./common.js";

const PACKAGE_ROOT = new URL("../../", import.meta.url).pathname;
const REFERENCES = "skills/automatica11y-runner/references";

/**
 * Every file in the runner's `references/` folder is a topic named for the file, so a reference
 * can't ship without a way to print it. Its first heading says what it's for.
 * @returns {Record<string, { file: string, about: string }>}
 */
function referenceTopics() {
  const dir = join(PACKAGE_ROOT, REFERENCES);
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => {
        const file = `${REFERENCES}/${name}`;
        const heading = /^#\s+(.+)$/m.exec(readFileSync(join(PACKAGE_ROOT, file), "utf8"))?.[1] ?? name;
        return [name.slice(0, -3), { file, about: heading.replace(/\.$/, "").toLowerCase() }];
      }),
  );
}

/**
 * What `guide` can print: the topic, the file it comes from, and what it's for.
 * @type {Record<string, { file: string, about: string }>}
 */
export const TOPICS = {
  agents: { file: "AGENTS.md", about: "where an agent starts: what to do, and where to read the rest" },
  skill: { file: "skills/automatica11y-runner/SKILL.md", about: "the core steps: check, build the command, run it, and where to read more" },
  ...referenceTopics(),
};

/**
 * Print guidance for an AI agent to stdout. The text is the same files that ship in the package,
 * so it always matches this version of the tool. Any agent that can run `npx` can read it,
 * with no file path to find and no folder to install into.
 * @param {string[]} argv
 * @param {import("./common.js").Io} io
 */
export async function guideCommand(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: { help: { type: "boolean", short: "h" } }, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.split(". ")[0] : String(error));
  }
  const names = Object.keys(TOPICS);
  const width = Math.max(...names.map((name) => name.length)) + 2;
  const list = Object.entries(TOPICS).map(([name, t]) => `  ${name.padEnd(width)}${t.about}`).join("\n");
  if (parsed.values.help) {
    io.stdout.write(`Usage: automatica11y guide [${names.join("|")}]\n\nPrint guidance for an AI agent. With no topic, it prints "agents".\n\n${list}\n`);
    return EXIT.OK;
  }
  if (parsed.positionals.length > 1) throw new UsageError("guide takes one topic.");
  const topic = parsed.positionals[0] ?? "agents";
  const entry = Object.hasOwn(TOPICS, topic) ? TOPICS[topic] : undefined;
  if (!entry) throw new UsageError(`Unknown guide topic "${topic}". Choose from:\n${list}`);
  const file = join(PACKAGE_ROOT, entry.file);
  if (!existsSync(file)) {
    io.stderr.write(`The guide file ${entry.file} is missing from this install. Reinstall automatica11y.\n`);
    return EXIT.ENVIRONMENT;
  }
  io.stdout.write(readFileSync(file, "utf8"));
  return EXIT.OK;
}
