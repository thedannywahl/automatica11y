/**
 * Angular describes what turns a component or directive on with selectors. At runtime a class carries them in Ivy's own form:
 * each alternative is an array that starts with the element name (empty for an attribute-only selector), followed by
 * attribute names and values: `button[matButton]` is `["button", "matButton", ""]`. Numbers in the array mark class names,
 * `:not()` parts, and other forms that a template can't write from a name alone, so those alternatives are skipped.
 */

/** Is this alternative plain: an element name and attributes, nothing else? */
const isPlain = (alternative) => Array.isArray(alternative) && alternative.length % 2 === 1 && alternative.every((part) => typeof part === "string");

/**
 * The simplest element and attributes that match one of the selectors, preferring a given element.
 * An attribute-only selector (`[uiTooltip]`) gets the preferred element, or `fallback` when none is preferred.
 * @param {unknown[][]} selectors
 * @param {{ prefer?: string, fallback?: string }} [options]
 * @returns {{ tag: string, attrs: Array<[string, string]> } | null}
 */
export function markupFor(selectors, { prefer, fallback } = {}) {
  const plain = (selectors ?? []).filter(isPlain).map((alt) => ({ tag: alt[0], attrs: pairs(alt) }));
  const choose = (list) => list.sort((a, b) => a.attrs.length - b.attrs.length)[0] ?? null;
  const match = prefer ? choose(plain.filter((alt) => alt.tag === prefer)) ?? choose(plain.filter((alt) => alt.tag === "")) : choose(plain.filter((alt) => alt.tag !== "")) ?? choose(plain);
  if (!match) return null;
  const tag = match.tag || prefer || fallback;
  return tag ? { tag, attrs: match.attrs } : null;
}

function pairs(alternative) {
  const out = [];
  for (let i = 1; i < alternative.length; i += 2) out.push([alternative[i], alternative[i + 1]]);
  return out;
}

/** The attributes as they're written in a template: `matButton`, or `kind="primary"`. */
export function attributeText(attrs) {
  return attrs.map(([name, value]) => (value ? `${name}="${String(value).replace(/"/g, "&quot;")}"` : name)).join(" ");
}
