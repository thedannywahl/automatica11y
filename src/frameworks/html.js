/**
 * The plain HTML adapter, for packages with no framework: stylesheets, and scripts that wire up behavior on markup the page
 * already has. A fixture is a snippet of markup. The tool loads the target's stylesheets, puts the markup on the page, then
 * loads the scripts, so a script that looks for its elements when it starts finds them.
 *
 * What loads is named by the target itself. In a list such as `npm:a/components.css,b/interactions.iife.js`, an entry whose
 * sub-path ends in `.css` is a stylesheet, and one that ends in `.js` or `.mjs` is a script. Every other entry is just a package.
 */

const STYLE = /\.css$/i;
const SCRIPT = /\.(m?js)$/i;

/** @param {string | null | undefined} subpath */
export const isStyle = (subpath) => Boolean(subpath && STYLE.test(subpath));
/** @param {string | null | undefined} subpath */
export const isScript = (subpath) => Boolean(subpath && SCRIPT.test(subpath));
/** Is this sub-path a file the page loads, rather than something a framework imports? */
export const isAsset = (subpath) => isStyle(subpath) || isScript(subpath);

/**
 * The stylesheets and scripts a list of packages names, in the order they were written.
 * @param {Array<{ name: string, subpath: string | null }>} entries
 * @returns {{ styles: string[], scripts: string[] }}
 */
export function assetsOf(entries) {
  const spec = (entry) => `${entry.name}/${entry.subpath}`;
  return {
    styles: entries.filter((entry) => isStyle(entry.subpath)).map(spec),
    scripts: entries.filter((entry) => isScript(entry.subpath)).map(spec),
  };
}

/**
 * Does the registry's metadata say a package is plain HTML and CSS? It has to ship a stylesheet or a browser script, and it can't
 * need a framework (those are decided before this runs).
 * @param {any} meta
 */
export function shipsBrowserAssets(meta) {
  if (typeof meta?.style === "string" || typeof meta?.unpkg === "string" || typeof meta?.jsdelivr === "string") return true;
  const keys = meta?.exports && typeof meta.exports === "object" ? Object.keys(meta.exports) : [];
  return keys.some((key) => STYLE.test(key) || /\.(iife|umd)\.m?js$/.test(key));
}

/**
 * Mounts a fixture. The stylesheets come first, as imports, so they load with the page. The markup goes on the page next. A
 * `<script>` inside the markup is made again so the browser runs it, because markup set by the page never runs its scripts.
 * Then the target's scripts load, one after the other.
 * @param {string} fixturePath
 * @param {string} _pkg
 * @param {{ assets?: { styles: string[], scripts: string[] } }} [context]
 */
export const entry = (fixturePath, _pkg, context = {}) => {
  const { styles = [], scripts = [] } = context.assets ?? {};
  return `${styles.map((spec) => `import ${JSON.stringify(spec)};`).join("\n")}
import markup from ${JSON.stringify(fixturePath)};
const root = document.getElementById("root");
root.innerHTML = markup;
for (const old of [...root.querySelectorAll("script")]) {
  const script = document.createElement("script");
  for (const { name, value } of old.attributes) script.setAttribute(name, value);
  script.textContent = old.textContent;
  old.replaceWith(script);
}
try {
${scripts.map((spec) => `  await import(${JSON.stringify(spec)});`).join("\n")}
} catch (error) {
  window.__error = String(error);
  console.error(error);
}
`;
};

export default {
  id: "html",
  label: "HTML",
  kind: "npm-html",
  noun: "element",
  extension: "html",
  runtime: [],
  /** @returns {import("./index.js").AdapterDetection | null} */
  detect(meta) {
    if (!shipsBrowserAssets(meta)) return null;
    return { kind: "npm-html", framework: "HTML", reason: "The package ships a stylesheet or a browser script and needs no framework." };
  },
  /** What the page loads, from the packages the target lists. */
  inspect: (/** @type {string} */ _workDir, /** @type {Array<{ name: string, subpath: string | null }>} */ entries = []) => ({ assets: assetsOf(entries) }),
  bundle: () => ({ alias: {}, esbuild: { loader: { ".html": /** @type {"text"} */ ("text") } } }),
  entry,
  discoverEntry: () => "window.__a11yExports = [];\n",
  template: () => null,
  generate: () => ({ candidates: [], reason: "Plain HTML has no exports or selectors to build a fixture from." }),
  describe: (npm) => {
    const loaded = /** @type {any} */ (npm).assets;
    return `plain HTML${loaded ? ` (${loaded.styles.length} ${loaded.styles.length === 1 ? "stylesheet" : "stylesheets"}, ${loaded.scripts.length} ${loaded.scripts.length === 1 ? "script" : "scripts"})` : ""}`;
  },
};

