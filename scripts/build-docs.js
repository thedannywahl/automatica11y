#!/usr/bin/env node
// Build the documentation site: Markdown from docs/ (plus two pages taken from the skills, so they can't drift) into plain HTML.
//   node scripts/build-docs.js [outDir]       Default out folder: site/
// The pages are semantic HTML with no script. A skip link, landmarks, labelled scrollable regions, and light, dark,
// and forced-colors styles come from the template below. A workflow publishes the output to the `docs` branch.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "https://github.com/thedannywahl/automatica11y";
const SITE = "https://thedannywahl.github.io/automatica11y/";

/**
 * Every page, in navigation order. A page's `file` is relative to the repository. A `stripFrontMatter` page starts with the YAML
 * block a skill file carries. The last two pages are the skills' own files, so the site shows the same words an agent reads.
 */
export const PAGES = [
  { file: "docs/index.md", out: "index.html", nav: "Home" },
  { file: "docs/targets.md", out: "targets.html", nav: "Targets" },
  { file: "docs/checks.md", out: "checks.html", nav: "What it checks" },
  { file: "docs/options.md", out: "options.html", nav: "Options and exit codes" },
  { file: "docs/reports.md", out: "reports.html", nav: "Reading a report" },
  { file: "docs/npm-packages.md", out: "npm-packages.html", nav: "npm packages and fixtures" },
  { file: "skills/automatica11y-runner/references/fixtures.md", out: "fixtures.html", nav: "Writing fixtures", from: "skills" },
  { file: "docs/agents.md", out: "agents.html", nav: "Using it with an AI agent" },
  { file: "skills/automatica11y-runner/SKILL.md", out: "agent-steps.html", nav: "The agent steps", from: "skills", stripFrontMatter: true },
  { file: "docs/limits.md", out: "limits.html", nav: "Limits" },
];

/** Where a relative link in a source file points once the site is built: another page, or the file on GitHub. */
function rewriteHref(href, sourceFile) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return href;
  const [path, hash] = href.split("#");
  const target = posix.normalize(posix.join(posix.dirname(sourceFile), path));
  const page = PAGES.find((p) => p.file === target);
  if (page) return `${page.out}${hash ? `#${hash}` : ""}`;
  return `${REPO}/blob/main/${target}${hash ? `#${hash}` : ""}`;
}

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Render one Markdown source to the article HTML, with its title and a short description. */
function renderMarkdown(source, sourceFile) {
  const used = new Set();
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        let id = slug(html);
        for (let n = 2; used.has(id); n += 1) id = `${slug(html)}-${n}`;
        used.add(id);
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<a href="${escapeHtml(rewriteHref(href, sourceFile))}"${title ? ` title="${escapeHtml(title)}"` : ""}>${text}</a>`;
      },
    },
  });
  let html = /** @type {string} */ (marked.parse(source));
  // A scrollable table gets a label and a way to focus it, so a keyboard user can scroll it.
  let lastHeading = "this page";
  const labels = new Map();
  html = html.replace(/<h[1-6] id="[^"]*">(.*?)<\/h[1-6]>|<table>/gs, (match, heading) => {
    if (heading !== undefined) {
      lastHeading = plain(heading);
      return match;
    }
    // Two tables under one heading would share a label, and a landmark's label has to be unique, so a repeat gets a number.
    const base = `Table: ${lastHeading.replace(/\.$/, "")}`;
    const count = (labels.get(base) ?? 0) + 1;
    labels.set(base, count);
    return `<div class="scroll" role="region" tabindex="0" aria-label="${escapeHtml(count === 1 ? base : `${base} (${count})`)}"><table>`;
  });
  html = html.replace(/<\/table>/g, "</table></div>");
  const title = plain(/<h1 id="[^"]*">(.*?)<\/h1>/s.exec(html)?.[1] ?? "automatica11y").replace(/\.$/, "");
  const firstParagraph = /<p>(.*?)<\/p>/s.exec(html)?.[1] ?? "";
  const description = plain(firstParagraph).replace(/\s+/g, " ").slice(0, 200);
  return { html, title, description };
}

const STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1a1a1a; --muted: #4a4a4a; --link: #0b4fb3; --rule: #c9c9c9; --code: #f1f1f1; --nav: #f6f6f6; --focus: #0b4fb3; }
@media (prefers-color-scheme: dark) { :root { --bg: #121212; --fg: #ececec; --muted: #b8b8b8; --link: #8ab4f8; --rule: #444444; --code: #1e1e1e; --nav: #1a1a1a; --focus: #8ab4f8; } }
* { box-sizing: border-box; }
html { font-size: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--link); text-underline-offset: 0.15em; }
a:focus-visible, [tabindex]:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.skip { position: absolute; left: 1rem; top: -4rem; background: var(--bg); color: var(--fg); padding: 0.5rem 1rem; border: 2px solid var(--fg); z-index: 10; }
.skip:focus { top: 1rem; }
header.site { padding: 1rem; border-bottom: 1px solid var(--rule); }
header.site p { margin: 0; font-weight: 700; font-size: 1.25rem; }
header.site a { color: inherit; text-decoration: none; }
.layout { display: block; }
nav.docs { padding: 1rem; background: var(--nav); border-bottom: 1px solid var(--rule); }
nav.docs ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
nav.docs a { display: inline-block; padding: 0.25rem 0; }
nav.docs a[aria-current="page"] { font-weight: 700; color: var(--fg); text-decoration-thickness: 3px; }
main { padding: 1.5rem 1rem 3rem; max-width: 52rem; }
main:focus { outline: none; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1rem; }
h2 { font-size: 1.5rem; line-height: 1.3; margin: 2.5rem 0 0.75rem; }
h3 { font-size: 1.2rem; margin: 2rem 0 0.5rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin: 0.25rem 0; }
code { background: var(--code); padding: 0.1em 0.3em; border-radius: 0.25rem; font: 0.9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
/* Long lines wrap instead of scrolling, so a code block never needs focus to be read, and it reflows at 320 pixels. */
pre { background: var(--code); padding: 1rem; border-radius: 0.5rem; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 1rem; border: 1px solid var(--rule); }
pre code { background: none; padding: 0; overflow-wrap: inherit; white-space: inherit; }
.scroll { overflow-x: auto; margin: 0 0 1rem; border: 1px solid var(--rule); border-radius: 0.5rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--rule); }
th { border-bottom: 2px solid var(--fg); }
tr:last-child td { border-bottom: 0; }
hr { border: 0; border-top: 1px solid var(--rule); }
footer.site { padding: 1.5rem 1rem 3rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: 0.95rem; }
footer.site p { margin: 0 0 0.5rem; max-width: 52rem; }
@media (min-width: 56rem) {
  .layout { display: grid; grid-template-columns: 17rem minmax(0, 1fr); align-items: start; }
  nav.docs { position: sticky; top: 0; min-height: calc(100vh - 4.5rem); border-bottom: 0; border-right: 1px solid var(--rule); }
  nav.docs ul { display: block; }
  nav.docs li { margin: 0.1rem 0; }
  main { padding: 2rem 2.5rem 4rem; }
}
@media (forced-colors: active) { a:focus-visible, [tabindex]:focus-visible { outline: 3px solid Highlight; } nav.docs a[aria-current="page"] { text-decoration: underline; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;

/** One page's full HTML. */
function template({ page, article, version }) {
  const nav = PAGES.map((p) => `<li><a href="${p.out}"${p.out === page.out ? ' aria-current="page"' : ""}>${escapeHtml(p.nav)}</a></li>`).join("\n        ");
  const canonical = `${SITE}${page.out === "index.html" ? "" : page.out}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.out === "index.html" ? "automatica11y" : `${article.title} - automatica11y`)}</title>
<meta name="description" content="${escapeHtml(article.description)}">
<link rel="canonical" href="${canonical}">
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="site">
  <p><a href="index.html">automatica11y</a></p>
</header>
<div class="layout">
  <nav class="docs" aria-label="Documentation">
    <ul>
        ${nav}
    </ul>
  </nav>
  <main id="main" tabindex="-1">
${article.html}
  </main>
</div>
<footer class="site">
  <p>automatica11y ${escapeHtml(version)}. MIT license. <a href="${REPO}">Source on GitHub</a> and <a href="https://www.npmjs.com/package/automatica11y">the npm package</a>.</p>
  <p>Criterion names and levels in reports come from the W3C's <a href="https://www.w3.org/WAI/WCAG22/wcag.json">WCAG 2.2 JSON</a>. See <a href="limits.html#attribution">the attribution</a>.</p>
</footer>
</body>
</html>
`;
}

/**
 * Build the site into `outDir`. Returns the pages it wrote.
 * @param {{ root?: string, outDir?: string }} [options]
 */
export function buildDocs({ root = ROOT, outDir = join(root, "site") } = {}) {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const page of PAGES) {
    let source = readFileSync(join(root, page.file), "utf8");
    if (page.stripFrontMatter) source = source.replace(/^---\n[\s\S]*?\n---\n/, "");
    const article = renderMarkdown(source, page.file);
    writeFileSync(join(outDir, page.out), template({ page, article, version }));
    written.push({ ...page, title: article.title });
  }
  // GitHub Pages runs Jekyll unless told not to, and Jekyll would hide files that start with an underscore.
  writeFileSync(join(outDir, ".nojekyll"), "");
  writeFileSync(join(outDir, "404.html"), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found - automatica11y</title><style>${STYLE}</style></head>\n<body><main id="main" style="padding:2rem 1rem"><h1>Page not found.</h1><p>That page isn't in the documentation. Start at the <a href="${SITE}">home page</a>.</p></main></body></html>\n`);
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] ?? join(ROOT, "site"));
  const pages = buildDocs({ outDir });
  console.log(`Built ${pages.length} pages into ${outDir}.`);
}
