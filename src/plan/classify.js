import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanSubpath } from "./subpath.js";

/**
 * @typedef {"npm" | "npm-react" | "npm-vue" | "npm-angular" | "npm-wc" | "npm-unsupported" | "storybook" | "url" | "html-file" | "static-dir"} TargetKind
 * @typedef {{
 *   input: string,
 *   label: string | null,
 *   name: string,
 *   status: "ok" | "failed",
 *   reason: string | null,
 *   kind: TargetKind | null,
 *   evidenceLevel: "component" | "page" | null,
 *   resolved: Record<string, string | null> | null,
 *   companions?: Array<{ name: string, requested: string | null, version: string | null, subpath: string | null }>,
 * }} ClassifiedTarget
 * @typedef {(url: string | URL, init?: { signal?: AbortSignal, redirect?: string }) => Promise<{ ok: boolean, status: number, text(): Promise<string> }>} FetchLike
 * @typedef {{ cwd?: string, home?: string, fetch?: FetchLike, timeoutMs?: number, npmView?: (spec: string) => Promise<unknown> }} ClassifyContext
 */

const LOCAL_PATH = /^(\.{1,2}(\/|$)|\/|~(\/|$)|file:)/;
const LABEL = /^([A-Za-z0-9][\w.-]*)=(.+)$/;
const HTTP_URL = /^https?:\/\//i;
const NPM_NAME = /^(?:@([a-z0-9][a-z0-9._~-]*)\/)?([a-z0-9][a-z0-9._~-]*)(?:@([^/]*))?(?:\/(.+))?$/;
const COMPONENT_SOURCE = new Set([".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".vue", ".svelte"]);

/**
 * Split `[label=]<spec>`. A label is a short word followed by `=`, so URLs with query strings stay whole.
 * @param {string} raw
 */
export function parseTargetInput(raw) {
  const match = LABEL.exec(raw);
  if (match) return { label: match[1], spec: match[2] };
  return { label: null, spec: raw };
}

/** @param {string} reason @param {{ input: string, label: string | null, name: string }} base @returns {ClassifiedTarget} */
function failed(reason, base) {
  return { ...base, status: "failed", reason, kind: null, evidenceLevel: null, resolved: null };
}

/** Expand `~` and `file:` into an absolute path. */
function toAbsolutePath(spec, cwd, home) {
  if (spec.startsWith("file://")) return fileURLToPath(spec);
  if (spec.startsWith("file:")) return resolve(cwd, spec.slice("file:".length));
  if (spec === "~" || spec.startsWith("~/")) return resolve(home, spec.slice(2));
  return resolve(cwd, spec);
}

/** A Storybook build has `index.json` (`entries`) or the older `stories.json` (`stories`) at its root. */
function readStorybookIndex(text) {
  try {
    const json = JSON.parse(text);
    return Boolean(json && typeof json === "object" && (typeof json.entries === "object" || typeof json.stories === "object"));
  } catch {
    return false;
  }
}

/** @param {string} abs @param {{ input: string, label: string | null, name: string }} base @param {string} [hint] @returns {ClassifiedTarget} */
function classifyLocal(abs, base, hint = "") {
  if (!existsSync(abs)) return failed(`Path not found: ${abs}.${hint}`, base);
  const stats = statSync(abs);
  if (stats.isDirectory()) {
    for (const file of ["index.json", "stories.json"]) {
      const candidate = resolve(abs, file);
      if (existsSync(candidate) && readStorybookIndex(readFileSync(candidate, "utf8"))) {
        return { ...base, status: "ok", reason: null, kind: "storybook", evidenceLevel: "component", resolved: { path: abs, index: file } };
      }
    }
    return { ...base, status: "ok", reason: null, kind: "static-dir", evidenceLevel: "page", resolved: { path: abs } };
  }
  const ext = extname(abs).toLowerCase();
  if (ext === ".html" || ext === ".htm") {
    return { ...base, status: "ok", reason: null, kind: "html-file", evidenceLevel: "page", resolved: { path: abs } };
  }
  if (COMPONENT_SOURCE.has(ext)) {
    return failed(`Component source files (${ext}) aren't supported as targets. Use an npm package, a Storybook build, an .html file, or a URL.`, base);
  }
  return failed(`Unsupported file type "${ext || "(none)"}". Use an .html file, a directory, or a URL.`, base);
}

/** Directory that would hold a Storybook's `index.json` for this URL. */
function storybookBase(url) {
  const base = new URL(url);
  base.search = "";
  base.hash = "";
  const last = base.pathname.split("/").pop() ?? "";
  if (base.pathname.endsWith("/")) return base;
  base.pathname = last.includes(".") ? base.pathname.slice(0, base.pathname.length - last.length) : `${base.pathname}/`;
  return base;
}

/** @param {string} spec @param {{ input: string, label: string | null, name: string }} base @param {ClassifyContext} ctx @returns {Promise<ClassifiedTarget>} */
async function classifyUrl(spec, base, ctx) {
  const doFetch = ctx.fetch ?? globalThis.fetch;
  const signal = () => AbortSignal.timeout(ctx.timeoutMs ?? 8000);
  let url;
  try {
    url = new URL(spec);
  } catch {
    return failed(`Not a valid URL: ${spec}`, base);
  }
  const root = storybookBase(spec);
  for (const file of ["index.json", "stories.json"]) {
    try {
      const response = await doFetch(new URL(file, root), { signal: signal(), redirect: "follow" });
      if (response.ok && readStorybookIndex(await response.text())) {
        return { ...base, status: "ok", reason: null, kind: "storybook", evidenceLevel: "component", resolved: { url: root.href, index: file } };
      }
    } catch {
      // A failed probe means "not Storybook here." The page check below reports real network trouble.
    }
  }
  try {
    const response = await doFetch(url, { signal: signal(), redirect: "follow" });
    if (!response.ok) return failed(`The URL responded with HTTP ${response.status}.`, base);
    return { ...base, status: "ok", reason: null, kind: "url", evidenceLevel: "page", resolved: { url: url.href } };
  } catch (error) {
    return failed(`The URL didn't respond: ${error instanceof Error ? error.message : String(error)}`, base);
  }
}

/**
 * Read one npm spec: `name`, `name@version`, or either with a sub-path.
 * @param {string} spec
 * @returns {{ name: string, requested: string | null, subpath: string | null } | { error: string }}
 */
function parseNpmSpec(spec) {
  const match = NPM_NAME.exec(spec);
  if (!match) {
    if (/[A-Z]/.test(spec) && NPM_NAME.test(spec.toLowerCase())) return { error: `"${spec}" isn't a valid package name. npm package names are lowercase.` };
    return { error: `"${spec}" isn't a valid npm package name. Write npm:name, npm:@scope/name, or npm:name@version.` };
  }
  const [, scope, name, version, rawSubpath] = match;
  if (version === "") return { error: `"${spec}" ends with @ but has no version.` };
  let subpath = null;
  if (rawSubpath !== undefined) {
    const cleaned = cleanSubpath(rawSubpath);
    if ("reason" in cleaned) return { error: `"${spec}" isn't a valid sub-path: ${cleaned.reason}. Write npm:name/sub/path or npm:name@version/sub/path.` };
    subpath = /** @type {{ subpath: string }} */ (cleaned).subpath;
  }
  return { name: scope ? `@${scope}/${name}` : name, requested: version ?? null, subpath };
}

/**
 * An npm target. A comma-separated list (`npm:a,b@1.2`) is one target made of several packages that install into one folder.
 * The first is the primary: it names the target and decides the framework. The rest are companions, such as a script package
 * that goes with a stylesheet package.
 * @param {string} spec @param {{ input: string, label: string | null, name: string }} base @returns {ClassifiedTarget}
 */
function classifyNpm(spec, base) {
  const entries = spec.split(",").map((entry) => entry.trim());
  if (entries.length > 1 && entries.some((entry) => entry === "")) {
    return failed(`"${spec}" has an empty entry in its list. Write the packages with commas and no spaces, for example npm:a,b.`, base);
  }
  const parsed = entries.map(parseNpmSpec);
  for (const entry of parsed) if ("error" in entry) return failed(entry.error, base);
  const [primary, ...companions] = /** @type {Array<{ name: string, requested: string | null, subpath: string | null }>} */ (parsed);
  const seen = new Set();
  for (const entry of [primary, ...companions]) {
    const key = `${entry.name}/${entry.subpath ?? ""}`;
    if (seen.has(key)) return failed(`"${entry.name}${entry.subpath ? `/${entry.subpath}` : ""}" is in the list more than once.`, base);
    seen.add(key);
  }
  return {
    ...base,
    name: base.name || (primary.subpath ? `${primary.name}/${primary.subpath}` : primary.name),
    status: "ok",
    reason: null,
    kind: "npm",
    evidenceLevel: "component",
    resolved: { name: primary.name, requested: primary.requested, version: null, subpath: primary.subpath },
    ...(companions.length ? { companions: companions.map((c) => ({ name: c.name, requested: c.requested, version: null, subpath: c.subpath })) } : {}),
  };
}

/** What to say when a bare word isn't a path on disk: it might have been a package or a web address. */
function notFoundHint(spec) {
  const hints = [];
  if (NPM_NAME.test(spec)) hints.push(`If you meant the npm package, write npm:${spec}.`);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(spec)) hints.push(`If you meant a web page, write https://${spec}.`);
  return hints.length ? ` ${hints.join(" ")}` : "";
}

/**
 * Classify one target. A URL starts with http:// or https://. An npm package starts with npm:. Everything else is a path,
 * relative to the working folder unless it's absolute, so `button` means the folder `./button`. First match wins: URL, npm package, path.
 * A path that isn't there fails with a hint about `npm:` and `https://`, so a mistake never turns into a different target.
 * A failure comes back as a `failed` target with a reason, never as a throw, so one bad target can't stop a comparison.
 * @param {string} raw `[label=]<spec>`
 * @param {ClassifyContext} [ctx]
 * @returns {Promise<ClassifiedTarget>}
 */
export async function classifyTarget(raw, ctx = {}) {
  const cwd = ctx.cwd ?? process.cwd();
  const home = ctx.home ?? homedir();
  const { label, spec } = parseTargetInput(raw.trim());
  const base = { input: raw, label, name: label ?? "" };

  if (HTTP_URL.test(spec)) {
    let host = spec;
    try {
      host = new URL(spec).hostname;
    } catch {
      // classifyUrl reports the invalid URL.
    }
    return classifyUrl(spec, { ...base, name: label ?? host }, ctx);
  }
  if (spec.startsWith("npm:")) return classifyNpm(spec.slice("npm:".length), base);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(spec) && !spec.startsWith("file:")) {
    return failed(`Only http and https URLs are supported. Got "${spec.split("://")[0]}://".`, base);
  }
  const explicit = LOCAL_PATH.test(spec) || spec === "." || spec === "..";
  const abs = toAbsolutePath(spec, cwd, home);
  return classifyLocal(abs, { ...base, name: label ?? basename(abs) }, explicit ? "" : notFoundHint(spec));
}
