import { ARCHETYPE_PATTERNS } from "../storybook.js";

/** Archetypes a fixture can be generated for. Buttons and links use templates. A chart has nothing to wire. */
export const GENERATABLE = new Set(["dialog", "menu", "tooltip", "tabs", "accordion", "combobox", "form-field", "live-region"]);

/** The most candidates probed for one archetype, so a package that matches nothing doesn't cost minutes. */
export const ATTEMPT_LIMIT = 8;

/** Does the package's own name say it is this archetype? `@scope/react-dialog` is a dialog. */
export function nameSaysSo(archetype, pkg) {
  return ARCHETYPE_PATTERNS[archetype].test(pkg.replace(/[^a-z0-9]+/gi, " "));
}
