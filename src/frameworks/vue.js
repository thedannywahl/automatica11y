/**
 * The Vue adapter, for Vue 3 packages. Libraries ship compiled components, so nothing here compiles single-file components.
 * Fixtures are JSX that esbuild turns into `h()` calls (a small shim supplies Vue's `h` and `Fragment`, so a fixture doesn't import them),
 * and a fixture's default export is a component. An optional `setup(app)` export installs plugins before the app mounts.
 * Every framework adapter has this shape (see index.js).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { vueDialect } from "../harness/generate/dialects.js";
import { generateJsx } from "../harness/generate/jsx.js";

/**
 * Mounts a fixture's default export as the root component, after its optional setup(app) has installed what it needs.
 * @param {string} fixturePath
 * @param {string} _pkg
 */
export const entry = (fixturePath, _pkg) => `import { createApp } from "vue";
import * as fixture from ${JSON.stringify(fixturePath)};
const libA11y = new URLSearchParams(location.search).get("libA11y") === "on";
const app = createApp(fixture.default, { libA11y });
if (typeof fixture.setup === "function") await fixture.setup(app);
app.mount(document.getElementById("root"));
`;

/**
 * Loads the whole package, lists its exports, and records compound parts such as Dialog.Trigger. Same as for React.
 * @param {string} pkg
 */
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
 * A fixture for the simple archetypes, from the export name alone. A function default export is a functional component.
 * @param {string} archetype
 * @param {string} pkg
 * @param {string} exportName
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

/**
 * Vue 3 or later? A range like "^3.2.0 || ^2.7" counts when any part allows 3. A bare "*" counts too.
 * @param {string} range
 */
function allowsVue3(range) {
  return String(range)
    .split("||")
    .some((part) => {
      const major = /(\d+)/.exec(part);
      return !major || Number(major[1]) >= 3 || /^[\s*x]*$/.test(part);
    });
}

export default {
  id: "vue",
  label: "Vue",
  kind: "npm-vue",
  noun: "export",
  extension: "jsx",
  runtime: ["vue"],
  /**
   * @param {import("./index.js").PackageMeta} meta
   * @returns {import("./index.js").AdapterDetection | null}
   */
  detect(meta) {
    const peers = meta.peerDependencies ?? {};
    const deps = meta.dependencies ?? {};
    const range = peers.vue ?? deps.vue;
    if (range === undefined) return null;
    if (!allowsVue3(range)) return { kind: "npm-unsupported", framework: "Vue 2", reason: `The package needs Vue ${range}. Only Vue 3 is supported.` };
    return { kind: "npm-vue", framework: "Vue", reason: `The package lists vue as a ${"vue" in peers ? "peer dependency" : "dependency"}.` };
  },
  /**
   * Writes the shim that supplies `h` and `Fragment`, then returns the settings.
   * @param {string} workDir
   */
  bundle(workDir) {
    const shim = join(workDir, "a11y-vue-jsx-shim.js");
    writeFileSync(shim, 'export { h, Fragment } from "vue";\n');
    return {
      // One copy of Vue for the library and the fixture, or reactivity breaks.
      alias: { vue: join(workDir, "node_modules", "vue") },
      define: { __VUE_OPTIONS_API__: "true", __VUE_PROD_DEVTOOLS__: "false", __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false" },
      // Vue has no JSX runtime of its own, so JSX becomes h() calls. The shim is injected wherever h or Fragment is used without being declared.
      esbuild: { jsx: /** @type {"transform"} */ ("transform"), jsxFactory: "h", jsxFragment: "Fragment", inject: [shim] },
    };
  },
  entry,
  discoverEntry,
  template,
  generate: (/** @type {import("./index.js").GenerateInput} */ input) => generateJsx(vueDialect, input),
  describe: (/** @type {{ vue?: string }} */ npm) => `Vue${npm.vue ? ` (vue ${npm.vue})` : ""}`,
};
