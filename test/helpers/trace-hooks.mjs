import { appendFileSync } from "node:fs";

/** @type {NonNullable<import("node:module").Module.RegisterHooksOptions["resolve"]>} */
export function resolve(specifier, context, nextResolve) {
  if (process.env.TRACE_FILE) appendFileSync(process.env.TRACE_FILE, `${specifier}\n`);
  return nextResolve(specifier, context);
}
