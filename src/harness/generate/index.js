import { ARCHETYPE_PATTERNS } from "../storybook.js";
import { buildKit } from "./kit.js";
import { REACT_RECIPES } from "./react-recipes.js";
import { wcCandidates } from "./wc-recipes.js";

/** Archetypes a fixture can be generated for. Buttons and links use templates. A chart has nothing to wire. */
export const GENERATABLE = new Set(["dialog", "menu", "tooltip", "tabs", "accordion", "combobox", "form-field", "live-region"]);

/** The most candidates probed for one archetype, so a package that matches nothing doesn't cost minutes. */
export const ATTEMPT_LIMIT = 8;

/** Does the package's own name say it is this archetype? `@scope/react-dialog` is a dialog. */
function nameSaysSo(archetype, pkg) {
  return ARCHETYPE_PATTERNS[archetype].test(pkg.replace(/[^a-z0-9]+/gi, " "));
}

/**
 * Build the candidate fixtures for one archetype of one package, most likely first.
 * @param {{ flavor: "react" | "wc", archetype: string, pkg: string, entry: { export?: string, tag?: string }, exports: Array<{ name: string, type: string, parts?: string[] }>, facts: Record<string, { attributes: string[], members: string[], slots: string[] }> }} input
 * @returns {{ candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null }}
 */
export function generateCandidates({ flavor, archetype, pkg, entry, exports, facts }) {
  if (!GENERATABLE.has(archetype)) return { candidates: [], reason: `Nothing is generated for the ${archetype} archetype.` };
  if (flavor === "wc") {
    const tag = entry.tag;
    if (!tag || !facts[tag]) return { candidates: [], reason: "No custom element looks like this archetype, so there's nothing to build a fixture around." };
    const candidates = wcCandidates({ archetype, tag, facts: facts[tag] }).slice(0, ATTEMPT_LIMIT);
    return candidates.length ? { candidates, reason: null } : { candidates: [], reason: `${tag} doesn't show a way to wire a ${archetype} (for example, an open attribute or a tip attribute), and no recipe covers a web component ${archetype} without one.` };
  }
  const recipes = REACT_RECIPES[archetype] ?? [];
  // The component the mapping found, then the package itself when its own name says it is this archetype.
  const bases = [];
  if (entry.export) bases.push(entry.export);
  if (nameSaysSo(archetype, pkg)) bases.push(null);
  const candidates = [];
  const seen = new Set();
  for (const base of bases) {
    const makeKit = () => buildKit(exports, base);
    for (const recipe of recipes) {
      const candidate = recipe(makeKit, pkg);
      if (candidate && !seen.has(candidate.source)) {
        seen.add(candidate.source);
        candidates.push(candidate);
      }
    }
  }
  if (candidates.length === 0) {
    return { candidates: [], reason: `The package's exports don't have the parts a ${archetype} recipe needs${entry.export ? ` (looked at ${entry.export} and the exports that start with it)` : ""}.` };
  }
  return { candidates: candidates.slice(0, ATTEMPT_LIMIT), reason: null };
}
