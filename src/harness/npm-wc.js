/** Web component flavor: framework-free entries and templates. */

/** Loads the package so its custom elements get defined, then calls the fixture's default export, `mount(container)`. */
export const entry = (fixturePath, pkg) => `import ${JSON.stringify(pkg)};
import mount from ${JSON.stringify(fixturePath)};
const libA11y = new URLSearchParams(location.search).get("libA11y") === "on";
await mount(document.getElementById("root"), { libA11y });
`;

/** Loads the whole package. The page's init script records every custom element the package defines. */
export const discoverEntry = (pkg) => `import * as lib from ${JSON.stringify(pkg)};
window.__a11yExports = Object.keys(lib).map((name) => ({ name, type: typeof lib[name], parts: [] }));
`;

/** A fixture for the simple archetypes, from the tag name alone. */
export function template(archetype, tag) {
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
