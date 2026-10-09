/**
 * Sub-paths of an npm package: `@scope/pkg/button/v2` imports `button/v2` from `@scope/pkg`.
 * A package says what it lets people import in its `exports` field. A package without one lets people import any file in it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Split a sub-path into clean segments, or say what's wrong with it. Rejects empty parts, `.` and `..`, and backslashes,
 * so a sub-path can't point outside the package. A trailing slash is dropped.
 * @param {string} text
 * @returns {{ ok: true, subpath: string } | { ok: false, reason: string }}
 */
export function cleanSubpath(text) {
  const trimmed = text.replace(/\/+$/, "");
  if (!trimmed) return { ok: false, reason: "the sub-path is empty" };
  if (trimmed.includes("\\")) return { ok: false, reason: "a sub-path uses forward slashes" };
  const segments = trimmed.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return { ok: false, reason: 'a sub-path can\'t contain empty parts, "." or ".."' };
  return { ok: true, subpath: segments.join("/") };
}

/**
 * The export keys that name a sub-path (`./button`), and the patterns (`./es/*`), from an `exports` field.
 * A string, an array, or an object with no `./` keys only exports the package root.
 */
function exportKeys(exportsField) {
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) return { exact: [], patterns: [], hasMap: false };
  const keys = Object.keys(exportsField).filter((key) => key === "." || key.startsWith("./"));
  if (keys.length === 0) return { exact: [], patterns: [], hasMap: false };
  const usable = keys.filter((key) => exportsField[key] !== null);
  return { exact: usable.filter((key) => !key.includes("*") && key !== "." && key !== "./package.json"), patterns: usable.filter((key) => key.includes("*")), hasMap: true };
}

/** Does a pattern key like `./es/*` or `./features/*.js` match a sub-path? */
function matchesPattern(pattern, subpath) {
  const [before, after] = pattern.slice(2).split("*");
  return subpath.length >= before.length + after.length && subpath.startsWith(before) && subpath.endsWith(after);
}

/**
 * Does the package's `exports` field let a sub-path be imported? Returns the sub-paths to suggest when it doesn't.
 * `package.json` is always allowed. A package with no exports map isn't judged here, because its files are the answer.
 * @param {unknown} exportsField
 * @param {string} subpath
 * @returns {{ checked: boolean, ok: boolean, exact: string[], patterns: string[] }}
 */
export function checkExports(exportsField, subpath) {
  const { exact, patterns, hasMap } = exportKeys(exportsField);
  if (!hasMap) {
    // A string or array exports field means only the root is exported. No field means nothing here can say.
    return { checked: exportsField !== undefined && exportsField !== null, ok: false, exact: [], patterns: [] };
  }
  const key = `./${subpath}`;
  const ok = key === "./package.json" || exact.includes(key) || patterns.some((pattern) => matchesPattern(pattern, subpath));
  return { checked: true, ok, exact, patterns };
}

/**
 * What's wrong with a sub-path of an installed package, or null when it can be imported.
 * @param {string} workDir The folder the package was installed into.
 * @param {string} name
 * @param {string} subpath
 * @param {string | null} version
 * @returns {string | null}
 */
export function subpathProblem(workDir, name, subpath, version) {
  const packageDir = join(workDir, "node_modules", name);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  } catch {
    return `${name} was installed, but its package.json couldn't be read to check the sub-path "${subpath}".`;
  }
  const result = checkExports(manifest.exports, subpath);
  if (result.checked) return result.ok ? null : notExportedMessage({ name, version, subpath, exact: result.exact, patterns: result.patterns });
  return fileExists(packageDir, subpath) ? null : `"${name}/${subpath}" isn't a file in ${name}${version ? `@${version}` : ""}, and the package has no exports map that lists what it offers.`;
}

/**
 * Sub-paths an installed package offers, as specs a person could pass (`@scope/pkg/button`), for a message that says where
 * to look when a package's main entry has no components. Patterns and `package.json` are left out.
 * @param {string} workDir
 * @param {string} name
 * @param {number} [limit]
 * @returns {string[]}
 */
export function offeredSubpaths(workDir, name, limit = 4) {
  try {
    const manifest = JSON.parse(readFileSync(join(workDir, "node_modules", name, "package.json"), "utf8"));
    return exportKeys(manifest.exports).exact.slice(0, limit).map((key) => `${name}${key.slice(1)}`);
  } catch {
    return [];
  }
}

/** The extensions a file can be imported without writing, for a package with no exports map. */
const EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".json", "/index.js", "/index.mjs", "/index.cjs"];

/** Is there a file for this sub-path in an installed package that has no exports map? */
export function fileExists(packageDir, subpath) {
  return EXTENSIONS.some((extension) => existsSync(join(packageDir, `${subpath}${extension}`)));
}

/** How many single-character edits turn one word into another. */
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    previous = row;
  }
  return previous[b.length];
}

/** The exports closest to what was asked for: a shared start, a shared last part, or a typo of it. */
function closest(subpath, exact) {
  const wanted = subpath.toLowerCase().split("/");
  const last = wanted[wanted.length - 1];
  return exact
    .map((key) => {
      const parts = key.slice(2).toLowerCase().split("/");
      const shared = parts.findIndex((part, i) => part !== wanted[i]);
      const lead = shared === -1 ? parts.length : shared;
      const tail = parts[parts.length - 1];
      const rank = lead * 2 + (tail.includes(last) || last.includes(tail) ? 1 : 0) + (distance(last, tail) <= 2 ? 2 : 0);
      return { key, rank };
    })
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.key.length - b.key.length)
    .slice(0, 3)
    .map((entry) => entry.key);
}

/**
 * The message for a sub-path a package doesn't offer, with the closest matches first.
 * @param {{ name: string, version: string | null, subpath: string, exact: string[], patterns: string[] }} input
 */
export function notExportedMessage({ name, version, subpath, exact, patterns }) {
  const spec = (key) => `${name}${key === "." ? "" : key.slice(1)}`;
  const close = closest(subpath, exact);
  const shown = exact.slice(0, 12).map(spec);
  const more = exact.length > shown.length ? `, and ${exact.length - shown.length} more` : "";
  const parts = [`"${name}/${subpath}" isn't something ${name}${version ? `@${version}` : ""} exports.`];
  if (close.length) parts.push(`Did you mean ${close.map(spec).join(" or ")}?`);
  if (exact.length) parts.push(`It exports ${shown.join(", ")}${more}.`);
  if (patterns.length) parts.push(`It also exports files by pattern: ${patterns.slice(0, 4).map(spec).join(", ")}.`);
  if (!exact.length && !patterns.length) parts.push("It exports only its main entry.");
  return parts.join(" ");
}
