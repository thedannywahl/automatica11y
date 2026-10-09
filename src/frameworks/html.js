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

/**
 * The bare native markup for an archetype, with no class names and nothing guessed from a stylesheet. It tests what the target's
 * styles and scripts do to ordinary elements. A component built on classes needs a fixture a person writes. The browser does the
 * opening and closing (`<dialog>`, `<details>`, popovers), so a template needs no script of its own except where there's no
 * native way (a dialog's trigger, a message that appears).
 */
const TEMPLATES = {
  button: '<button type="button" data-a11y-trigger data-a11y-root>Save</button>\n',
  link: '<a href="#top" data-a11y-trigger data-a11y-root>Read more</a>\n',
  "form-field": `<fieldset data-a11y-root>
  <legend>Contact details</legend>
  <p><label for="name">Name</label> <input id="name" name="name" type="text" autocomplete="name" data-a11y-trigger></p>
  <p><label for="about">About you</label> <textarea id="about" name="about"></textarea></p>
  <p><label for="size">Size</label> <select id="size" name="size"><option>Small</option><option>Medium</option><option>Large</option></select></p>
  <p><input id="news" name="news" type="checkbox"> <label for="news">Send me news</label></p>
  <fieldset>
    <legend>Contact me by</legend>
    <p><input id="by-email" name="by" type="radio" value="email"> <label for="by-email">Email</label></p>
    <p><input id="by-phone" name="by" type="radio" value="phone"> <label for="by-phone">Phone</label></p>
  </fieldset>
  <p><label for="email">Email address</label> <input id="email" name="email" type="email" aria-invalid="true" aria-describedby="email-error"> <span id="email-error">Enter an email address like name@example.com.</span></p>
</fieldset>
`,
  dialog: `<button type="button" id="open-dialog" data-a11y-trigger>Open dialog</button>
<dialog id="dialog" data-a11y-root aria-labelledby="dialog-title">
  <h2 id="dialog-title">Edit profile</h2>
  <p>Update your details.</p>
  <form method="dialog"><button>Close</button></form>
</dialog>
<script>document.getElementById("open-dialog").addEventListener("click", () => document.getElementById("dialog").showModal());</script>
`,
  accordion: `<details name="faq">
  <summary data-a11y-trigger>Shipping</summary>
  <div data-a11y-root><p>Orders ship within two business days.</p></div>
</details>
<details name="faq">
  <summary>Returns</summary>
  <div><p>Returns are free for 30 days.</p></div>
</details>
`,
  "live-region": `<button type="button" id="show-message" data-a11y-trigger>Show message</button>
<div id="message-region" role="status" data-a11y-root></div>
<script>document.getElementById("show-message").addEventListener("click", () => {
  document.getElementById("message-region").textContent = "Saved.";
});</script>
`,
  menu: `<button type="button" data-a11y-trigger popovertarget="actions" aria-haspopup="menu">Actions</button>
<div id="actions" popover data-a11y-root role="menu" aria-label="Actions">
  <button type="button" role="menuitem">Copy</button>
  <button type="button" role="menuitem">Paste</button>
</div>
`,
  tooltip: `<button type="button" data-a11y-trigger interestfor="save-tip">Save</button>
<div id="save-tip" popover="hint" role="tooltip" data-a11y-root>Saves your work.</div>
`,
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
  template: (/** @type {string} */ archetype) => TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (archetype)] ?? null,
  generate: () => ({ candidates: [], reason: "Plain HTML has no exports or selectors to build a fixture from." }),
  describe: (npm) => {
    const loaded = /** @type {any} */ (npm).assets;
    return `plain HTML${loaded ? ` (${loaded.styles.length} ${loaded.styles.length === 1 ? "stylesheet" : "stylesheets"}, ${loaded.scripts.length} ${loaded.scripts.length === 1 ? "script" : "scripts"})` : ""}`;
  },
};

