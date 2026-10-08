import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { EXIT, UsageError } from "./common.js";

const PACKAGE_ROOT = new URL("../../", import.meta.url).pathname;

/** What `guide` can print: the topic, the file it comes from, and what it's for. */
export const TOPICS = {
  agents: { file: "AGENTS.md", about: "where an agent starts: what to do, and where to read the rest" },
  skill: { file: "skills/automatica11y-runner/SKILL.md", about: "the full steps: build the command, run it, write fixtures, write the report" },
  fixtures: { file: "skills/automatica11y-runner/references/fixtures.md", about: "how to write the fixtures an npm package needs" },
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
  const list = Object.entries(TOPICS).map(([name, t]) => `  ${name.padEnd(9)} ${t.about}`).join("\n");
  if (parsed.values.help) {
    io.stdout.write(`Usage: automatica11y guide [agents|skill|fixtures]\n\nPrint guidance for an AI agent. With no topic, it prints "agents".\n\n${list}\n`);
    return EXIT.OK;
  }
  if (parsed.positionals.length > 1) throw new UsageError("guide takes one topic.");
  const topic = parsed.positionals[0] ?? "agents";
  const entry = TOPICS[/** @type {keyof typeof TOPICS} */ (topic)];
  if (!entry) throw new UsageError(`Unknown guide topic "${topic}". Choose from:\n${list}`);
  const file = join(PACKAGE_ROOT, entry.file);
  if (!existsSync(file)) {
    io.stderr.write(`The guide file ${entry.file} is missing from this install. Reinstall automatica11y.\n`);
    return EXIT.ENVIRONMENT;
  }
  io.stdout.write(readFileSync(file, "utf8"));
  return EXIT.OK;
}
