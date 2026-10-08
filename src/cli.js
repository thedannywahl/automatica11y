import { auditCommand } from "./commands/audit.js";
import { compareCommand } from "./commands/compare.js";
import { EXIT, UsageError, runSavedPlan, usage } from "./commands/common.js";
import { doctorCommand } from "./commands/doctor.js";
import { guideCommand } from "./commands/guide.js";
import { ownVersion } from "./env/versions.js";

const COMMANDS = {
  audit: auditCommand,
  compare: compareCommand,
  run: runSavedPlan,
  doctor: doctorCommand,
  guide: guideCommand,
};

/**
 * Run the CLI and return its exit code. Takes its streams and environment as arguments so tests can drive it.
 * @param {string[]} argv Arguments after the program name.
 * @param {Partial<import("./commands/common.js").Io>} [overrides]
 * @returns {Promise<number>}
 */
export async function main(argv, overrides = {}) {
  /** @type {import("./commands/common.js").Io} */
  const io = { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(), env: process.env, ...overrides };
  const [first, ...rest] = argv;

  if (first === "--version" || first === "-v") {
    io.stdout.write(`${ownVersion()}\n`);
    return EXIT.OK;
  }
  if (first === "--help" || first === "-h") {
    io.stdout.write(usage());
    return EXIT.OK;
  }
  const handler = first ? COMMANDS[/** @type {keyof typeof COMMANDS} */ (first)] : undefined;
  if (!handler) {
    io.stderr.write(first ? `Unknown command "${first}".\n\n${usage()}` : usage());
    return EXIT.USAGE;
  }
  try {
    return await handler(rest, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`${error.message}\n\nRun "automatica11y ${first} --help" for options.\n`);
      return EXIT.USAGE;
    }
    throw error;
  }
}
