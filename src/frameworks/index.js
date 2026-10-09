/**
 * The framework adapters. Each one says how to recognize a package built for its framework, install the framework's runtime,
 * bundle and mount a fixture, list a package's exports, template the simple archetypes, generate the rest, and describe the
 * result in a report. Everything after that (the browser, the tiers, the probe, the reports) knows nothing about a framework.
 *
 * To add a framework, write a module with the same shape as react.js, add it here, and add its id to FLAVORS and its kind to
 * TARGET_KINDS in schema.js. A test checks that the two lists agree.
 *
 * @typedef {"npm-react" | "npm-vue" | "npm-angular" | "npm-html" | "npm-wc" | "npm-unsupported"} AdapterKind
 * @typedef {{ kind: AdapterKind, framework: string, reason: string }} AdapterDetection
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: string,
 *   noun: string,
 *   extension: string,
 *   runtime: string[],
 *   detect: (meta: unknown) => AdapterDetection | null,
 *   inspect?: (workDir: string, entries?: Array<{ name: string, subpath: string | null }>) => Record<string, unknown>,
 *   bundle: (workDir: string) => { alias: Record<string, string>, define?: Record<string, string>, plugins?: import("esbuild").Plugin[], esbuild: import("esbuild").BuildOptions },
 *   entry: (fixturePath: string, pkg: string, context?: Record<string, unknown>) => string,
 *   discoverEntry: (pkg: string) => string,
 *   template: (archetype: string, pkg: string, name?: string, info?: unknown) => string | null,
 *   generate: (input: unknown) => { candidates: Array<{ id: string, summary: string, source: string, used: string[] }>, reason: string | null },
 *   describe: (npm: unknown) => string,
 * }} Adapter
 */
import angular from "./angular.js";
import html from "./html.js";
import react from "./react.js";
import vue from "./vue.js";
import wc from "./wc.js";

/** @type {Record<string, Adapter>} */
export const ADAPTERS = { react, vue, angular, html, wc };

/** The adapter for a flavor (`react`, `vue`, or `wc`). */
export function adapterFor(id) {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`There's no adapter for "${id}".`);
  return adapter;
}

/** The adapter for a plan target's kind, such as `npm-vue`, or null for a kind no adapter owns. */
export function adapterForKind(kind) {
  return Object.values(ADAPTERS).find((adapter) => adapter.kind === kind) ?? null;
}
