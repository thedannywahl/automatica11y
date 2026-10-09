import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const packages = new URL("../fixtures/packages/", import.meta.url).pathname;
const repoModules = new URL("../../node_modules/", import.meta.url).pathname;

/** Registry metadata for the fake packages, as `npm view` would return it. */
export const REGISTRY = {
  "fake-ui": { name: "fake-ui", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-nospread": { name: "fake-nospread", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-wc": { name: "fake-wc", version: "1.0.0", customElements: "custom-elements.json" },
  "fake-compound": { name: "fake-compound", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-controlled": { name: "fake-controlled", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-nope": { name: "fake-nope", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-wc-generate": { name: "fake-wc-generate", version: "1.0.0", customElements: "custom-elements.json" },
  "closed-wc": { name: "closed-wc", version: "2.0.0" },
  "quiet-wc": { name: "quiet-wc", version: "1.0.0" },
  "plain-utils": { name: "plain-utils", version: "3.0.0" },
  "fake-subpaths": { name: "fake-subpaths", version: "2.0.0", peerDependencies: { react: "*", "react-dom": "*" }, exports: { ".": "./index.js", "./button": "./button.js", "./button/v2": "./button-v2.js", "./dialog": "./dialog.js", "./es/*": "./es/*", "./internal/*": null, "./package.json": "./package.json" } },
  "fake-legacy": { name: "fake-legacy", version: "1.0.0", peerDependencies: { react: "*", "react-dom": "*" } },
  "fake-ng-ui": { name: "fake-ng-ui", version: "1.0.0", peerDependencies: { "@angular/core": "^22.0.0" } },
  "fake-ng-modules": { name: "fake-ng-modules", version: "1.0.0", peerDependencies: { "@angular/core": "^22.0.0" } },
  "fake-ng-wrong": { name: "fake-ng-wrong", version: "1.0.0", peerDependencies: { "@angular/core": "^22.0.0" } },
  "fake-ng-zone": { name: "fake-ng-zone", version: "1.0.0", peerDependencies: { "@angular/core": "^22.0.0", "zone.js": "*" } },
  "fake-html-css": { name: "fake-html-css", version: "1.0.0", exports: { "./components.css": "./components.css", "./base.css": "./base.css", "./package.json": "./package.json" } },
  "fake-html-js": { name: "fake-html-js", version: "2.0.0", exports: { "./init.iife.js": "./init.iife.js", "./broken.iife.js": "./broken.iife.js", "./package.json": "./package.json" } },
  "fake-ng-old": { name: "fake-ng-old", version: "1.0.0", peerDependencies: { "@angular/core": "^20.0.0 || ^21.0.0" } },
  "fake-ng-split": { name: "fake-ng-split", version: "1.0.0", peerDependencies: { "@angular/core": "^22.0.0" }, exports: { ".": "./index.js", "./button": "./button.js", "./package.json": "./package.json" } },
  // The real Angular Material, linked from the repository's dev dependencies, to prove a partly compiled library runs.
  "@angular/material": { name: "@angular/material", version: "22.2.2", peerDependencies: { "@angular/core": "^22.0.0 || ^23.0.0", "@angular/cdk": "22.2.2" }, exports: { ".": "./index.js", "./button": "./button.js", "./menu": "./menu.js", "./tooltip": "./tooltip.js", "./dialog": "./dialog.js", "./tabs": "./tabs.js", "./expansion": "./expansion.js", "./autocomplete": "./autocomplete.js", "./form-field": "./form-field.js", "./input": "./input.js", "./snack-bar": "./snack-bar.js", "./package.json": "./package.json" } },
  "fake-vue-ui": { name: "fake-vue-ui", version: "1.0.0", peerDependencies: { vue: "^3.4.0" } },
  "fake-vue-controlled": { name: "fake-vue-controlled", version: "1.0.0", peerDependencies: { vue: "^3.4.0" } },
  "vue-two-lib": { name: "vue-two-lib", version: "1.0.0", peerDependencies: { vue: "^2.7.0" } },
  "svelte-lib": { name: "svelte-lib", version: "1.0.0", peerDependencies: { svelte: "^5" } },
};

export const npmView = async (spec) => {
  const name = spec.replace(/@[^@/]*$/, "");
  const meta = REGISTRY[name];
  if (!meta) throw new Error(`"${spec}" wasn't found on npm.`);
  return meta;
};

/** Stand in for npm: copy the fake package into the install folder and link the repo's React. */
export async function installPackage({ dir, name, version, flavor }) {
  if (!REGISTRY[name]) throw new Error(`npm couldn't install ${name}@${version}: not found`);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  if (flavor === "angular") {
    // Angular's packages, rxjs, and the real Material and CDK all come from the repository's dev dependencies.
    for (const dep of ["@angular", "rxjs", ...(REGISTRY[name]?.peerDependencies?.["zone.js"] ? ["zone.js"] : [])]) if (existsSync(join(repoModules, dep))) symlinkSync(join(repoModules, dep), join(dir, "node_modules", dep));
  }
  if (!name.startsWith("@angular/")) cpSync(join(packages, name), join(dir, "node_modules", name), { recursive: true });
  if (flavor === "react") {
    for (const dep of ["react", "react-dom", "scheduler"]) if (existsSync(join(repoModules, dep))) symlinkSync(join(repoModules, dep), join(dir, "node_modules", dep));
  }
  if (flavor === "vue") {
    for (const dep of ["vue", "@vue"]) if (existsSync(join(repoModules, dep))) symlinkSync(join(repoModules, dep), join(dir, "node_modules", dep));
  }
  const react = flavor === "react" ? JSON.parse(readFileSync(join(repoModules, "react", "package.json"), "utf8")).version : null;
  const vue = flavor === "vue" ? JSON.parse(readFileSync(join(repoModules, "vue", "package.json"), "utf8")).version : null;
  const angular = flavor === "angular" ? JSON.parse(readFileSync(join(repoModules, "@angular", "core", "package.json"), "utf8")).version : null;
  return { dir, warnings: [], react, reactDom: react, vue, angular, version };
}

