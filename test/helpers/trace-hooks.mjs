import { appendFileSync } from "node:fs";

/** Record every module specifier the process resolves, so a test can prove heavy packages never load. */
export async function resolve(specifier, context, nextResolve) {
  if (process.env.TRACE_FILE) appendFileSync(process.env.TRACE_FILE, `${specifier}\n`);
  return nextResolve(specifier, context);
}
