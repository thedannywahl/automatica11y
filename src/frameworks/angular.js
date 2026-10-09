/**
 * The Angular adapter, for Angular 22 and newer. Angular libraries ship partially compiled, and Angular compiles them in the
 * browser (JIT) once `@angular/compiler` is loaded, so nothing here runs the Angular linker or a TypeScript transform.
 * A fixture is plain JavaScript that defines a component by calling the `Component` decorator as a function (see the fixtures
 * guide). Every framework adapter has this shape (see index.js).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { generateAngular } from "../harness/generate/angular-recipes.js";
import { attributeText, markupFor } from "./angular-selectors.js";

/** The oldest Angular this version supports. */
export const ANGULAR_FLOOR = 22;
const FLOOR = ANGULAR_FLOOR;

/**
 * Does a peer range allow Angular 22 or newer? A part counts when it names version 22 or later, or has no upper limit (`>=15`, `*`).
 * `^20 || ^21` doesn't, and `^21 || ^22` does.
 */
function allowsSupported(range) {
  return String(range)
    .split("||")
    .some((part) => {
      const text = part.trim();
      const major = /(\d+)/.exec(text);
      if (!major || /^[*x]?$/.test(text)) return true;
      if (/^>=?/.test(text)) return true;
      return Number(major[1]) >= FLOOR;
    });
}

/**
 * Loads the compiler, then the whole target, and records what each Angular export is: its kind, selectors, inputs, outputs,
 * `exportAs`, and whether it's standalone. Services get their method names, and modules the classes they declare.
 * Exports with no Angular definition (functions, tokens, types) are left out.
 */
export const discoverEntry = (pkg) => `import "@angular/compiler";
import * as lib from ${JSON.stringify(pkg)};
// A class can be exported under more than one name (a button that is also the anchor), and each name is a record.
const namesOf = new Map();
for (const key of Object.keys(lib)) if (typeof lib[key] === "function") namesOf.set(lib[key], [...(namesOf.get(lib[key]) ?? []), key]);
const listed = (items) => (typeof items === "function" ? items() : items) ?? [];
const out = [];
for (const key of Object.keys(lib)) {
  const value = lib[key];
  if (typeof value !== "function") continue;
  try {
    const cmp = value["ɵcmp"];
    const dir = value["ɵdir"];
    const mod = value["ɵmod"];
    const def = cmp ?? dir;
    if (def) {
      out.push({ name: key, type: "function", parts: [], angular: { kind: cmp ? "component" : "directive", selectors: def.selectors ?? [], inputs: Object.keys(def.inputs ?? {}), outputs: Object.keys(def.outputs ?? {}), exportAs: def.exportAs ?? [], standalone: Boolean(def.standalone) } });
    } else if (mod) {
      const named = (items) => listed(items).flatMap((c) => namesOf.get(c) ?? []);
      out.push({ name: key, type: "function", parts: [], angular: { kind: "module", declares: named(mod.declarations), exports: named(mod.exports) } });
    } else if (value["ɵprov"]) {
      const methods = Object.getOwnPropertyNames(value.prototype ?? {}).filter((m) => m !== "constructor" && !m.startsWith("ɵ") && typeof value.prototype[m] === "function");
      out.push({ name: key, type: "function", parts: [], angular: { kind: "service", methods } });
    }
  } catch (error) {
    out.push({ name: key, type: "function", parts: [], angular: { kind: "error", message: String(error).split("\\n")[0] } });
  }
}
// A component that isn't standalone is used through the module that declares it.
for (const item of out) {
  if (item.angular.kind === "module" || item.angular.standalone !== false) continue;
  item.angular.moduleName = out.find((m) => m.angular.kind === "module" && m.angular.declares.includes(item.name))?.name ?? null;
}
window.__a11yExports = out;
`;

/**
 * Mounts a fixture. The runtime compiler goes first. `zone.js` is loaded only when a library brought it in, because Angular 22
 * runs without it. The fixture's default export is its component class, and an optional `providers` export adds application providers.
 * A failure to start is logged and kept on `window.__error`, so the report can say why.
 */
export const entry = (fixturePath, _pkg, context = {}) => `import "@angular/compiler";
${context.zone ? 'import "zone.js";\n' : ""}import { bootstrapApplication } from "@angular/platform-browser";
import * as fixture from ${JSON.stringify(fixturePath)};
const Fixture = fixture.default;
const selector = Fixture?.["ɵcmp"]?.selectors?.[0]?.[0] || "app-fixture";
document.getElementById("root").append(document.createElement(selector));
try {
  await bootstrapApplication(Fixture, { providers: fixture.providers ?? [] });
} catch (error) {
  window.__error = String(error);
  console.error(error);
}
`;

/**
 * A fixture for a button or a link, from the class's own selector. A class that isn't standalone is imported through its module.
 * A class whose selector can't be written from its name alone (a class name, a :not() form) is left for a person to write.
 */
export function template(archetype, pkg, exportName, info) {
  const want = { button: "button", link: "a" }[archetype];
  const angular = info?.angular;
  if (!want || !angular || (angular.kind !== "component" && angular.kind !== "directive")) return null;
  // A button class may name its own element (`p-button`), which a link class may not: a link has to be an anchor.
  const match = markupFor(angular.selectors, { prefer: want }) ?? (archetype === "button" ? markupFor(angular.selectors, {}) : null);
  if (!match || (archetype === "link" && match.tag !== want)) return null;
  const imports = angular.standalone ? [exportName] : angular.moduleName ? [angular.moduleName] : null;
  if (!imports) return null;
  const attrs = [attributeText(match.attrs), "data-a11y-trigger", "data-a11y-root", want === "a" ? 'href="#top"' : 'type="button"'].filter(Boolean).join(" ");
  const html = `<${match.tag} ${attrs}>${want === "a" ? "Read more" : "Save"}</${match.tag}>`;
  return `import { Component } from "@angular/core";
import { ${imports.join(", ")} } from ${JSON.stringify(pkg)};

class Fixture {}
Component({ selector: "app-fixture", imports: [${imports.join(", ")}], template: \`${html}\` })(Fixture);
export default Fixture;
`;
}

/** Keeps one copy of every Angular package and of rxjs, so a library and a fixture never load two. Secondary entry points need the resolver, not an alias. */
function singleCopy(workDir) {
  return {
    name: "single-angular-copy",
    setup(build) {
      build.onResolve({ filter: /^(@angular\/|rxjs(\/|$)|zone\.js(\/|$))/ }, async (args) => {
        if (args.pluginData === "single-angular-copy") return undefined;
        const result = await build.resolve(args.path, { resolveDir: workDir, kind: args.kind, pluginData: "single-angular-copy" });
        return result.errors.length ? undefined : result;
      });
    },
  };
}

export default {
  id: "angular",
  label: "Angular",
  kind: "npm-angular",
  noun: "export",
  extension: "js",
  runtime: ["@angular/core", "@angular/common", "@angular/compiler", "@angular/platform-browser", "rxjs"],
  detect(meta) {
    const peers = meta.peerDependencies ?? {};
    const deps = meta.dependencies ?? {};
    const range = peers["@angular/core"] ?? deps["@angular/core"];
    if (range === undefined) return null;
    if (!allowsSupported(range)) return { kind: "npm-unsupported", framework: "Angular", reason: `The package needs @angular/core ${range}. Only Angular ${FLOOR} and newer is supported.` };
    return { kind: "npm-angular", framework: "Angular", reason: `The package lists @angular/core as a ${"@angular/core" in peers ? "peer dependency" : "dependency"}.` };
  },
  /** What the install left behind that the entry needs to know about. */
  inspect: (workDir) => ({ zone: existsSync(join(workDir, "node_modules", "zone.js")) }),
  bundle: (workDir) => ({ alias: {}, plugins: [singleCopy(workDir)], esbuild: {} }),
  entry,
  discoverEntry,
  template,
  generate: (input) => generateAngular(input),
  describe: (npm) => `Angular${npm.angular ? ` (core ${npm.angular})` : ""}`,
};
