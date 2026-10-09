import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_PATTERNS } from "../harness/storybook.js";
import { ARCHETYPES, parseMappingFile } from "../schema.js";

/** Names that mean the archetype itself, best first. */
const BASE_NAMES = {
  button: ["button"],
  link: ["link", "anchor"],
  dialog: ["dialog", "modal"],
  menu: ["menu", "dropdownmenu"],
  tabs: ["tabs", "tablist"],
  combobox: ["combobox", "autocomplete", "select"],
  "form-field": ["input", "textfield", "textinput", "field", "checkbox"],
  accordion: ["accordion", "collapsible", "disclosure"],
  tooltip: ["tooltip", "popover"],
  "live-region": ["alert", "status", "toast", "snackbar", "notification", "liveregion"],
  chart: ["chart", "linechart", "barchart"],
};

/** Archetypes a template can fill in. Everything else needs a fixture someone writes. */
export const TEMPLATED = new Set(["button", "link"]);

/** `DialogTrigger` becomes `Dialog Trigger`. `sl-button` becomes `sl button`. */
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");

/** How well a name fits an archetype. 0 means it doesn't. */
export function score(archetype, name) {
  if (!ARCHETYPE_PATTERNS[archetype].test(words(name))) return 0;
  const compact = name.replace(/[-_\s]/g, "").toLowerCase();
  const last = words(name).toLowerCase().split(" ").pop();
  const bases = BASE_NAMES[archetype];
  // Names listed first are closer to the archetype itself, so `tooltip` beats `popover` when both are there.
  if (bases.includes(compact)) return 4 - bases.indexOf(compact) * 0.1;
  if (bases.includes(last)) return 3 - bases.indexOf(last) * 0.1;
  const starts = bases.findIndex((base) => compact.startsWith(base));
  if (starts !== -1) return 2 - starts * 0.1;
  return 1;
}

/**
 * Guess which exports (React, Vue, or Angular) or tags (web components) stand for each archetype.
 * The result is a starting point. A person or the skill checks it before trusting it.
 * @param {{ flavor: "react" | "vue" | "angular" | "html" | "wc", exports?: Array<{ name: string, type: string, parts: string[] }>, tags?: string[] }} input
 * @returns {ReturnType<typeof parseMappingFile>[string]}
 */
export function candidateMapping({ flavor, exports = [], tags = [] }) {
  const names = flavor === "wc" ? tags : exports.filter((e) => /^[A-Z]/.test(e.name)).map((e) => e.name);
  /** @type {ReturnType<typeof parseMappingFile>[string]} */
  const mapping = {};
  for (const archetype of ARCHETYPES) {
    const ranked = names
      .map((name) => ({ name, score: score(archetype, name) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    if (ranked.length === 0) {
      mapping[archetype] = { flavor, status: "no-match", candidates: [], fixture: null, reason: `No ${flavor === "wc" ? "custom element" : "export"} looks like the ${archetype} archetype.` };
      continue;
    }
    const best = ranked[0].name;
    const info = exports.find((e) => e.name === best);
    const parts = info?.parts ?? [];
    // Flat compound libraries (DialogRoot, DialogTrigger, DialogContent) have sibling exports that share a prefix.
    // A button or link usually sits beside ButtonBase, ButtonGroup, and the like, which aren't its parts, so only real parts (Button.Root) count there.
    const siblings = flavor !== "wc" && !TEMPLATED.has(archetype) ? names.filter((n) => n !== best && n.startsWith(best) && n.length > best.length) : [];
    const compound = parts.length > 0 || siblings.length >= 2;
    const templated = TEMPLATED.has(archetype) && !compound;
    mapping[archetype] = {
      flavor,
      ...(flavor === "wc" ? { tag: best } : { export: best }),
      status: templated ? "template" : "needs-fixture",
      candidates: ranked.slice(0, 5).map((c) => c.name),
      ...(parts.length ? { parts } : siblings.length ? { parts: siblings.slice(0, 12) } : {}),
      fixture: null,
      ...(templated ? {} : { reason: compound ? `${best} is built from parts, so a fixture has to assemble them.` : `The ${archetype} archetype needs a fixture someone writes.` }),
    };
  }
  return mapping;
}

/** Read and validate a `--mapping` file. Throws an Error with a plain message. */
export function loadMappingFile(path, cwd) {
  const file = resolve(cwd, path);
  if (!existsSync(file)) throw new Error(`The mapping file doesn't exist: ${file}`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`The mapping file isn't valid JSON: ${error.message}`);
  }
  return parseMappingFile(json);
}

/** Where an authored fixture can sit when the mapping doesn't name one. */
export function findAuthoredFixture({ cwd, targetId, archetype, mapped }) {
  if (mapped?.fixture) {
    const file = resolve(cwd, mapped.fixture);
    return existsSync(file) ? file : null;
  }
  for (const ext of ["jsx", "js", "ts", "html"]) {
    const file = resolve(cwd, "fixtures", targetId, `${archetype}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}
