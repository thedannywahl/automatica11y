/**
 * The React adapter: how to recognize a React package, mount a fixture, list its exports, template the simple archetypes,
 * generate the rest, and tell esbuild to use one copy of React. Every framework adapter has this shape (see index.js).
 */
import { join } from "node:path";
import { reactDialect } from "../harness/generate/dialects.js";
import { generateJsx } from "../harness/generate/jsx.js";

/** Mounts a fixture's default export. */
export const entry = (fixturePath, _pkg) => `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Fixture from ${JSON.stringify(fixturePath)};
const libA11y = new URLSearchParams(location.search).get("libA11y") === "on";
createRoot(document.getElementById("root")).render(createElement(Fixture, { libA11y }));
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
 * Compound components (dialog, tabs, menu) can't be guessed, so they come from generation or from a fixture someone writes.
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

export default {
  id: "react",
  label: "React",
  kind: "npm-react",
  /** What the mapping calls a thing the package provides. */
  noun: "export",
  /** The extension of an authored fixture. */
  extension: "jsx",
  /** Packages the fixture and the library must share one copy of, and that the install makes sure are there. */
  runtime: ["react", "react-dom"],
  /** Is this package React, from its registry metadata alone? */
  /** @returns {import("./index.js").AdapterDetection | null} */
  detect(meta) {
    const peers = meta.peerDependencies ?? {};
    const deps = meta.dependencies ?? {};
    if (!("react" in peers || "react-dom" in peers || "react" in deps)) return null;
    const how = "react" in peers || "react-dom" in peers ? "peer dependency" : "dependency";
    return { kind: "npm-react", framework: "React", reason: `The package lists react as a ${how}.` };
  },
  /** esbuild settings for this framework. */
  bundle: (workDir) => ({
    // One copy of React for the library and the fixture, or hooks break.
    alias: { react: join(workDir, "node_modules", "react"), "react-dom": join(workDir, "node_modules", "react-dom") },
    esbuild: { jsx: /** @type {"automatic"} */ ("automatic") },
  }),
  entry,
  discoverEntry,
  template,
  generate: (input) => generateJsx(reactDialect, input),
  /** One phrase for the report: what the package was run as. */
  describe: (npm) => `React${npm.react ? ` (react ${npm.react})` : ""}`,
};
