/** React flavor: the entry files and button and link templates that go into a bundle. */

/** Mounts a fixture's default export. */
export const entry = (fixturePath, _pkg) => `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Fixture from ${JSON.stringify(fixturePath)};
createRoot(document.getElementById("root")).render(createElement(Fixture));
`;

/** Loads the whole package, lists its exports, and records compound parts such as Dialog.Trigger. */
export const discoverEntry = (pkg) => `import * as lib from ${JSON.stringify(pkg)};
const out = [];
for (const name of Object.keys(lib)) {
  const value = lib[name];
  const type = typeof value;
  if (value === null || (type !== "function" && type !== "object")) continue;
  const parts = Object.keys(value).filter((key) => /^[A-Z]/.test(key)).slice(0, 30);
  out.push({ name, type, parts });
}
window.__a11yExports = out;
`;

/**
 * A fixture for the simple archetypes, from the export name alone.
 * Compound components (dialog, tabs, menu) can't be guessed, so they need a fixture someone writes.
 */
export function template(archetype, pkg, exportName) {
  const body = {
    button: `<Component data-a11y-trigger data-a11y-root type="button">Save</Component>`,
    link: `<Component data-a11y-trigger data-a11y-root href="#top">Read more</Component>`,
  }[archetype];
  if (!body) return null;
  return `import { ${exportName} as Component } from ${JSON.stringify(pkg)};
export default function Fixture() {
  return ${body};
}
`;
}
