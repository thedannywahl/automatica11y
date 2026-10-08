import { adapterFor } from "../../frameworks/index.js";

export { ATTEMPT_LIMIT, GENERATABLE } from "./shared.js";

/**
 * Build the candidate fixtures for one archetype of one package, most likely first, using the framework's adapter.
 * @param {{ flavor: string, archetype: string, pkg: string, entry: { export?: string, tag?: string }, exports: Array<{ name: string, type: string, parts?: string[] }>, facts: Record<string, { attributes: string[], members: string[], slots: string[] }>, explicit?: boolean }} input
 * @returns {{ candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null }}
 */
export function generateCandidates({ flavor, ...input }) {
  return adapterFor(flavor).generate(input);
}
