/**
 * Find the parts of a compound component from the names a package exports.
 *
 * Two shapes are common. A namespaced export carries its parts as properties (`Dialog.Root`, `Dialog.Trigger`).
 * A flat set of exports shares a prefix (`DialogRoot`, `DialogTrigger`, or `Dialog` plus `DialogContent`).
 * A package that is one component's parts, such as a `Root` and a `Trigger` with no `Dialog` in front, works too.
 * Parts are found by name only. Nothing here knows any one library.
 */

/**
 * @param {Array<{ name: string, type: string, parts?: string[] }>} exports
 * @param {string | null} base The export that names the component, or null when the package itself is the component.
 */
export function buildKit(exports, base) {
  /** @type {Map<string, string>} lower-case part name to the expression that reaches it */
  const parts = new Map();
  const baseInfo = base ? exports.find((e) => e.name === base) : null;
  if (base) {
    for (const part of baseInfo?.parts ?? []) parts.set(part.toLowerCase(), `Lib.${base}.${part}`);
    for (const e of exports) {
      if (e.name === base || !e.name.startsWith(base)) continue;
      const rest = e.name.slice(base.length);
      if (/^[A-Z]/.test(rest) && !parts.has(rest.toLowerCase())) parts.set(rest.toLowerCase(), `Lib.${e.name}`);
    }
  } else {
    for (const e of exports) if (/^[A-Z]/.test(e.name) && !parts.has(e.name.toLowerCase())) parts.set(e.name.toLowerCase(), `Lib.${e.name}`);
  }
  const used = new Set();
  return {
    base,
    /** The component itself (`Lib.Dialog`), or null for a package with no single base. */
    self: base && baseInfo ? `Lib.${base}` : null,
    /** True when any of these part names exists. */
    has: (...names) => names.some((name) => parts.has(name)),
    /** The first part that exists, as a JSX tag. Records what was used. */
    pick(...names) {
      for (const name of names) {
        const ref = parts.get(name);
        if (ref) {
          used.add(ref.replace(/^Lib\./, ""));
          return ref;
        }
      }
      return null;
    },
    /** What the candidates used, for the report. */
    used: () => [...used],
    names: () => [...parts.keys()],
  };
}
