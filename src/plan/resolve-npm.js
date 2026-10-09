import { execFile } from "node:child_process";
import { isAsset } from "../frameworks/html.js";
import { ADAPTERS } from "../frameworks/index.js";
import { checkExports, notExportedMessage } from "./subpath.js";

const FIELDS = ["name", "version", "peerDependencies", "dependencies", "keywords", "customElements", "deprecated", "exports", "style", "unpkg", "jsdelivr"];
const OTHER_FRAMEWORKS = {
  "solid-js": "Solid",
  preact: "Preact",
  "@builder.io/qwik": "Qwik",
  "ember-source": "Ember",
};
const WEB_COMPONENT_BASES = ["lit", "lit-element", "@lit/reactive-element", "@stencil/core", "@microsoft/fast-element", "@polymer/polymer"];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a package's registry metadata without installing it.
 * @param {string} spec `name`, `name@version`, or `name@range`
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<unknown>} The metadata. Throws an Error with a plain reason when the package can't be read.
 */
export function npmView(spec, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["view", spec, ...FIELDS, "--json"],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        if (error) {
          const text = `${stdout}\n${stderr}`;
          if (/E404|404 Not Found|is not in this registry/.test(text)) return reject(new Error(`"${spec}" wasn't found on npm.`));
          if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network/i.test(text)) return reject(new Error("The npm registry couldn't be reached."));
          if ((error).killed) return reject(new Error("The npm registry didn't answer in time."));
          return reject(new Error(`npm couldn't read "${spec}": ${text.split("\n").find((line) => line.trim())?.trim() ?? error.message}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed);
        } catch {
          reject(new Error(`npm returned something unreadable for "${spec}".`));
        }
      },
    );
  });
}

/**
 * Guess how a package renders from its metadata alone. React wins when both signals appear, then a custom elements manifest, then Vue, then Angular.
 * `npm` means the metadata can't say, so the run decides after it installs and loads the package.
 * @param {unknown} meta
 * @returns {{ kind: "npm-react" | "npm-vue" | "npm-angular" | "npm-svelte" | "npm-html" | "npm-wc" | "npm-unsupported" | "npm", framework: string | null, reason: string }}
 */
export function detectFlavor(meta) {
  const data = isRecord(meta) ? meta : {};
  const peers = isRecord(data.peerDependencies) ? data.peerDependencies : {};
  const deps = isRecord(data.dependencies) ? data.dependencies : {};
  const react = ADAPTERS.react.detect(data);
  if (react) return react;
  if (data.customElements) return { kind: "npm-wc", framework: "Web components", reason: "The package has a customElements manifest." };
  const vue = ADAPTERS.vue.detect(data);
  if (vue) return vue;
  const angular = ADAPTERS.angular.detect(data);
  if (angular) return angular;
  const svelte = ADAPTERS.svelte.detect(data);
  if (svelte) return svelte;
  for (const [name, label] of Object.entries(OTHER_FRAMEWORKS)) {
    if (name in peers) return { kind: "npm-unsupported", framework: label, reason: `The package needs ${label}.` };
  }
  const base = WEB_COMPONENT_BASES.find((name) => name in deps || name in peers);
  if (base) return { kind: "npm-wc", framework: "Web components", reason: `The package builds on ${base}.` };
  const html = ADAPTERS.html.detect(data);
  if (html) return html;
  return { kind: "npm", framework: null, reason: "The metadata doesn't say. The run decides after it loads the package." };
}

/**
 * Fill in a classified npm target: the concrete version and the framework guess.
 * @param {import("./classify.js").ClassifiedTarget} target
 * @param {(spec: string) => Promise<unknown>} view
 * @returns {Promise<import("./classify.js").ClassifiedTarget>}
 */
export async function resolveNpmTarget(target, view) {
  if (target.status !== "ok" || target.kind !== "npm" || !target.resolved) return target;
  const { name, requested, subpath } = target.resolved;
  try {
    const metadata = await view(`${name}@${requested ?? "latest"}`);
    if (!isRecord(metadata)) throw new Error("npm returned package metadata in an unreadable shape.");
    const meta = metadata;
    // The registry lists a package's exports, so a wrong sub-path is caught here, before anything is installed.
    if (subpath) {
      const result = checkExports(meta.exports, subpath);
      if (result.checked && !result.ok) throw new Error(notExportedMessage({ name, version: typeof meta.version === "string" ? meta.version : null, subpath, exact: result.exact, patterns: result.patterns }));
    }
    let flavor = detectFlavor(meta);
    // A list that names a stylesheet or a script (`npm:a/components.css,b/interactions.iife.js`) is plain HTML when the metadata names no framework.
    if (flavor.kind === "npm" && [target.resolved.subpath, ...(target.companions ?? []).map((c) => c.subpath)].some(isAsset)) {
      flavor = { kind: "npm-html", framework: "HTML", reason: "The target names a stylesheet or a script to load." };
    }
    // Each companion is looked up the same way, so a wrong name, version, or sub-path fails here, before anything is installed.
    /** @type {Array<{ name: string, requested: string | null, version: string | null, subpath: string | null }>} */
    const companions = [];
    for (const companion of target.companions ?? []) {
      const found = await view(`${companion.name}@${companion.requested ?? "latest"}`);
      if (!isRecord(found)) throw new Error(`npm returned metadata for ${companion.name} in an unreadable shape.`);
      const version = typeof found.version === "string" ? found.version : null;
      if (companion.subpath) {
        const result = checkExports(found.exports, companion.subpath);
        if (result.checked && !result.ok) throw new Error(notExportedMessage({ name: companion.name, version, subpath: companion.subpath, exact: result.exact, patterns: result.patterns }));
      }
      companions.push({ ...companion, version });
    }
    return {
      ...target,
      kind: flavor.kind,
      resolved: { ...target.resolved, version: typeof meta.version === "string" ? meta.version : null, framework: flavor.framework, detectedBy: flavor.reason },
      ...(companions.length ? { companions } : {}),
    };
  } catch (error) {
    return { ...target, status: "failed", reason: error instanceof Error ? error.message : String(error), kind: null, evidenceLevel: null, resolved: null };
  }
}
