/**
 * The web component adapter: framework-free entries, templates, and generation from what an element says about itself.
 * Every framework adapter has this shape (see index.js).
 */
import { generateWc } from "../harness/generate/wc-recipes.js";


/** Loads the package so its custom elements get defined, then calls the fixture's default export, `mount(container)`. */
export const entry = (fixturePath, pkg) => `// A package's own "sideEffects" list can mark its entry as removable, which would drop a bare import and leave its elements undefined.
// Using the namespace keeps the package and its registration code.
import * as library from ${JSON.stringify(pkg)};
globalThis.__a11yLibrary = library;
import mount from ${JSON.stringify(fixturePath)};
const libA11y = new URLSearchParams(location.search).get("libA11y") === "on";
await mount(document.getElementById("root"), { libA11y });
`;

/** Loads the whole package. The page's init script records every custom element the package defines. */
export const discoverEntry = (pkg) => `import * as lib from ${JSON.stringify(pkg)};
window.__a11yExports = Object.keys(lib).map((name) => ({ name, type: typeof lib[name], parts: [] }));
`;

/** A fixture for the simple archetypes, from the tag name alone. */
export function template(archetype, _pkg, tag) {
  const attrs = {
    button: `el.textContent = "Save";`,
    link: `el.setAttribute("href", "#top");\n  el.textContent = "Read more";`,
  }[archetype];
  if (!attrs) return null;
  return `export default function mount(container) {
  const el = document.createElement(${JSON.stringify(tag)});
  el.setAttribute("data-a11y-trigger", "");
  el.setAttribute("data-a11y-root", "");
  ${attrs}
  container.append(el);
}
`;
}

export default {
  id: "wc",
  label: "Web components",
  kind: "npm-wc",
  noun: "custom element",
  extension: "js",
  runtime: [],
  /** A package is detected as web components by a manifest or a base library, which index.js orders against the other adapters. */
  detect: () => null,
  bundle: () => ({ alias: {}, esbuild: {} }),
  entry,
  discoverEntry,
  template,
  generate: (input) => generateWc(input),
  describe: (npm) => `web components (${npm.tags?.length ? npm.tags.slice(0, 6).join(", ") : "no tags found"})`,
};
