import { ARCHETYPE_PATTERNS } from "../storybook.js";
import { score } from "../../plan/mapping.js";
import { buildKit } from "./kit.js";
import { buildRecipes } from "./jsx-recipes.js";
import { ATTEMPT_LIMIT, GENERATABLE, nameSaysSo } from "./shared.js";

/** The names a part of a compound component ends with. A name that ends in one belongs to a family that shares the rest. */
const PART_SUFFIX = /(Root|Trigger|Portal|Overlay|Backdrop|Positioner|Content|Popup|Panel|Title|Description|Close|Header|Item|List|Input|Label|Control|Provider)$/;

/**
 * The prefix a family of flat exports shares. `DialogClose` and `DialogRoot` belong to `Dialog`, even when no export is
 * named `Dialog`. It counts only when at least two exports start with it.
 */
export function inferBase(name, exports) {
  if (!name) return null;
  const base = name.replace(PART_SUFFIX, "");
  if (!base || base === name) return null;
  return exports.filter((e) => e.name.startsWith(base) && e.name !== base).length >= 2 ? base : null;
}

const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");

/**
 * The component families in a package that look like this archetype, best first. A family is a base name and the parts that share
 * it (`DropdownMenuRoot`, `DropdownMenuItem`), a namespaced export with parts, or a single export. A family ranks by how well its
 * base fits the archetype's own name, then by how many parts it has. At most three are tried, so a library with a context menu,
 * a dropdown menu, and a menubar gets the plainest ones first.
 */
export function familyBases(archetype, exports) {
  const families = new Map();
  for (const e of exports) {
    if (!/^[A-Z]/.test(e.name) || !ARCHETYPE_PATTERNS[archetype].test(words(e.name))) continue;
    const base = inferBase(e.name, exports) ?? e.name;
    if (families.has(base)) continue;
    const size = exports.filter((other) => other.name !== base && other.name.startsWith(base)).length + (exports.find((other) => other.name === base)?.parts?.length ?? 0);
    families.set(base, { base, fit: score(archetype, base), size });
  }
  return [...families.values()].sort((a, b) => b.fit - a.fit || b.size - a.size || a.base.localeCompare(b.base)).slice(0, 3).map((f) => f.base);
}

/**
 * Candidate fixtures for a JSX framework: the recipes, run over the parts of the component the mapping found,
 * then over the package itself when its own name says it is this archetype.
 * @param {import("./dialects.js").Dialect} dialect
 * @param {{ archetype: string, pkg: string, entry: { export?: string }, exports: Array<{ name: string, type: string, parts?: string[] }>, explicit?: boolean }} input
 *   `explicit` means a person named the export in a mapping, so only that component is tried.
 * @returns {{ candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null }}
 */
export function generateJsx(dialect, { archetype, pkg, entry, exports, explicit = false }) {
  if (!GENERATABLE.has(archetype)) return { candidates: [], reason: `Nothing is generated for the ${archetype} archetype.` };
  const recipes = buildRecipes(dialect)[archetype] ?? [];
  const bases = [];
  if (explicit && entry.export) {
    bases.push(inferBase(entry.export, exports) ?? entry.export);
  } else {
    bases.push(...familyBases(archetype, exports));
    if (bases.length === 0 && entry.export) bases.push(inferBase(entry.export, exports) ?? entry.export);
  }
  if (nameSaysSo(archetype, pkg)) bases.push(null);
  const candidates = [];
  const seen = new Set();
  for (const base of [...new Set(bases)]) {
    const makeKit = () => buildKit(exports, base);
    for (const recipe of recipes) {
      const candidate = recipe(makeKit, pkg, dialect);
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
