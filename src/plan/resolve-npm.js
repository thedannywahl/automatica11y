import { execFile } from "node:child_process";
import { ADAPTERS } from "../frameworks/index.js";

const FIELDS = ["name", "version", "peerDependencies", "dependencies", "keywords", "customElements", "deprecated"];
const OTHER_FRAMEWORKS = {
  "@angular/core": "Angular",
  svelte: "Svelte",
  "solid-js": "Solid",
  preact: "Preact",
  "@builder.io/qwik": "Qwik",
  "ember-source": "Ember",
};
const WEB_COMPONENT_BASES = ["lit", "lit-element", "@lit/reactive-element", "@stencil/core", "@microsoft/fast-element", "@polymer/polymer"];

/**
 * Read a package's registry metadata without installing it.
 * @param {string} spec `name`, `name@version`, or `name@range`
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<any>} The metadata. Throws an Error with a plain reason when the package can't be read.
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
 * Guess how a package renders from its metadata alone. React wins when both signals appear, then a custom elements manifest, then Vue.
 * `npm` means the metadata can't say, so the run decides after it installs and loads the package.
 * @param {any} meta
 * @returns {{ kind: "npm-react" | "npm-vue" | "npm-wc" | "npm-unsupported" | "npm", framework: string | null, reason: string }}
 */
export function detectFlavor(meta) {
  const peers = meta.peerDependencies ?? {};
  const deps = meta.dependencies ?? {};
  const react = /** @type {any} */ (ADAPTERS.react.detect(meta));
  if (react) return react;
  if (meta.customElements) return { kind: "npm-wc", framework: "Web components", reason: "The package has a customElements manifest." };
  const vue = /** @type {any} */ (ADAPTERS.vue.detect(meta));
  if (vue) return vue;
  for (const [name, label] of Object.entries(OTHER_FRAMEWORKS)) {
    if (name in peers) return { kind: "npm-unsupported", framework: label, reason: `The package needs ${label}.` };
  }
  const base = WEB_COMPONENT_BASES.find((name) => name in deps || name in peers);
  if (base) return { kind: "npm-wc", framework: "Web components", reason: `The package builds on ${base}.` };
  return { kind: "npm", framework: null, reason: "The metadata doesn't say. The run decides after it loads the package." };
}

/**
 * Fill in a classified npm target: the concrete version and the framework guess.
 * @param {import("./classify.js").ClassifiedTarget} target
 * @param {(spec: string) => Promise<any>} view
 * @returns {Promise<import("./classify.js").ClassifiedTarget>}
 */
export async function resolveNpmTarget(target, view) {
  if (target.status !== "ok" || target.kind !== "npm" || !target.resolved) return target;
  const { name, requested } = target.resolved;
  try {
    const meta = await view(`${name}@${requested ?? "latest"}`);
    const flavor = detectFlavor(meta);
    return {
      ...target,
      kind: /** @type {any} */ (flavor.kind),
      resolved: { ...target.resolved, version: meta.version ?? null, framework: flavor.framework, detectedBy: flavor.reason },
    };
  } catch (error) {
    return { ...target, status: "failed", reason: error instanceof Error ? error.message : String(error), kind: null, evidenceLevel: null, resolved: null };
  }
}
