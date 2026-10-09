/**
 * The Svelte adapter, for Svelte 5 and newer. Svelte libraries ship source: `.svelte` files, and `.svelte.js` modules that use
 * runes. A consumer's bundler compiles them, so this adapter gives esbuild a small plugin that does. The compiler comes from the
 * target's own `svelte` install, so the compiler and the runtime that runs the output are always the same version.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { svelteDialect } from "../harness/generate/dialects.js";
import { generateJsx } from "../harness/generate/jsx.js";
import { discoverEntry } from "./react.js";

/** The oldest Svelte this version supports. */
export const SVELTE_FLOOR = 5;

/**
 * Does a peer range allow Svelte 5 or newer? A part counts when it names version 5 or later, or has no upper limit (`>=3`, `*`).
 * `^3 || ^4` doesn't, and `^4 || ^5` does.
 * @param {string} range
 */
export function allowsSvelte5(range) {
  return String(range)
    .split("||")
    .some((part) => {
      const text = part.trim();
      const major = /(\d+)/.exec(text);
      if (!major || /^[*x]?$/.test(text) || /^>=?/.test(text)) return true;
      return Number(major[1]) >= SVELTE_FLOOR;
    });
}

/** Mounts a fixture's default export. */
export const entry = (fixturePath, _pkg) => `import { mount } from "svelte";
import Fixture from ${JSON.stringify(fixturePath)};
const libA11y = new URLSearchParams(location.search).get("libA11y") === "on";
try {
  mount(Fixture, { target: document.getElementById("root"), props: { libA11y } });
} catch (error) {
  window.__error = String(error);
  console.error(error);
}
`;

/**
 * A fixture for the simple archetypes, from the export name alone.
 * @param {string} archetype @param {string} pkg @param {string} exportName
 */
export function template(archetype, pkg, exportName) {
  const body = {
    button: '<Component data-a11y-trigger data-a11y-root type="button">Save</Component>',
    link: '<Component data-a11y-trigger data-a11y-root href="#top">Read more</Component>',
  }[archetype];
  if (!body) return null;
  return `<script>
  import { ${exportName} as Component } from ${JSON.stringify(pkg)};
</script>
${body}
`;
}

/**
 * Compiles `.svelte` files and `.svelte.js` modules with the Svelte that's installed beside the library. The compiler loads the
 * first time a file needs it. A compile error becomes a build error with the file and line, so it can't pass as a result.
 * @param {string} workDir
 * @returns {import("esbuild").Plugin}
 */
function compilerPlugin(workDir) {
  /** @type {Promise<any> | null} */
  let compiler = null;
  const load = () => {
    // The compiler may load as a module or as CommonJS, which puts the functions under `default`.
    compiler ??= import(pathToFileURL(createRequire(join(workDir, "package.json")).resolve("svelte/compiler")).href).then((loaded) => (loaded.compile ? loaded : loaded.default));
    return compiler;
  };
  return {
    name: "svelte-compiler",
    setup(build) {
      // One copy of Svelte for the library and the fixture, or the runtime's state is split in two.
      build.onResolve({ filter: /^svelte(\/|$)/ }, async (args) => {
        if (args.pluginData === "svelte-compiler") return undefined;
        const result = await build.resolve(args.path, { resolveDir: workDir, kind: args.kind, pluginData: "svelte-compiler" });
        return result.errors.length ? undefined : result;
      });
      const failure = (error, file) => ({ errors: [{ text: String(error?.message ?? error).split("\n")[0], location: { file, line: error?.start?.line ?? 0, column: error?.start?.column ?? 0 } }] });
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        try {
          const { compile } = await load();
          const result = compile(readFileSync(args.path, "utf8"), { filename: args.path, generate: "client", css: "injected", dev: false });
          return { contents: result.js.code, loader: "js" };
        } catch (error) {
          return failure(error, args.path);
        }
      });
      build.onLoad({ filter: /\.svelte\.js$/ }, async (args) => {
        try {
          const { compileModule } = await load();
          return { contents: compileModule(readFileSync(args.path, "utf8"), { filename: args.path, generate: "client" }).js.code, loader: "js" };
        } catch (error) {
          return failure(error, args.path);
        }
      });
    },
  };
}

export default {
  id: "svelte",
  label: "Svelte",
  kind: "npm-svelte",
  noun: "export",
  extension: "svelte",
  runtime: ["svelte"],
  /** @returns {import("./index.js").AdapterDetection | null} */
  detect(meta) {
    const peers = meta.peerDependencies ?? {};
    const deps = meta.dependencies ?? {};
    const range = peers.svelte ?? deps.svelte;
    if (range === undefined) return null;
    if (!allowsSvelte5(range)) return { kind: "npm-unsupported", framework: "Svelte", reason: `The package needs svelte ${range}. Only Svelte ${SVELTE_FLOOR} and newer is supported.` };
    return { kind: "npm-svelte", framework: "Svelte", reason: `The package lists svelte as a ${"svelte" in peers ? "peer dependency" : "dependency"}.` };
  },
  bundle: (workDir) => ({
    alias: {},
    plugins: [compilerPlugin(workDir)],
    // Svelte libraries name their source entry with the `svelte` condition, and some with the `svelte` field.
    esbuild: { conditions: ["svelte"], mainFields: ["svelte", "browser", "module", "main"] },
  }),
  entry,
  discoverEntry,
  template,
  generate: (input) => generateJsx(svelteDialect, input),
  describe: (npm) => `Svelte${/** @type {any} */ (npm).svelte ? ` (svelte ${/** @type {any} */ (npm).svelte})` : ""}`,
};
