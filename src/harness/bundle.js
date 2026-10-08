import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSET_LOADERS = /** @type {Record<string, import("esbuild").Loader>} */ (Object.fromEntries(
  [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".woff", ".woff2", ".ttf", ".eot"].map((ext) => [ext, "dataurl"]),
));

/**
 * The package names esbuild couldn't resolve, such as `@emotion/react`. A subpath import counts as its package.
 * @param {{ text?: string }[]} errors
 * @returns {string[]}
 */
export function unresolvedPackages(errors) {
  const names = new Set();
  for (const { text = "" } of errors) {
    const match = /^Could not resolve "([^".\/][^"]*)"/.exec(text);
    if (match) names.add(match[1].split("/").slice(0, match[1].startsWith("@") ? 2 : 1).join("/"));
  }
  return [...names];
}

/**
 * Bundle fixture entries into one folder of browser-ready ES modules, plus one HTML shell per entry.
 * esbuild loads here and only here. It doesn't type-check, and fixtures don't need it to.
 * @param {{ entries: Record<string, string>, outdir: string, workDir: string, react?: boolean }} options
 * @returns {Promise<Record<string, string>>} Entry name to page path, for example `{ dialog: "/dialog.html" }`.
 */
export async function bundleEntries({ entries, outdir, workDir, react = false }) {
  const esbuild = await import("esbuild");
  mkdirSync(outdir, { recursive: true });
  try {
    await esbuild.build({
      entryPoints: entries,
      outdir,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      absWorkingDir: workDir,
      nodePaths: [join(workDir, "node_modules")],
      // One copy of React for the library and the fixture, or hooks break.
      alias: react ? { react: join(workDir, "node_modules", "react"), "react-dom": join(workDir, "node_modules", "react-dom") } : {},
      loader: ASSET_LOADERS,
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
    });
  } catch (error) {
    const messages = (error.errors ?? []).slice(0, 3).map((e) => `${e.text}${e.location ? ` (${e.location.file}:${e.location.line})` : ""}`);
    throw Object.assign(new Error(`Bundling failed: ${messages.join("; ") || error.message}`), { unresolved: unresolvedPackages(error.errors ?? []) });
  }
  /** @type {Record<string, string>} */
  const pages = {};
  for (const name of Object.keys(entries)) {
    const css = existsSync(join(outdir, `${name}.css`)) ? `<link rel="stylesheet" href="./${name}.css">` : "";
    writeFileSync(
      join(outdir, `${name}.html`),
      `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${name}</title><link rel="icon" href="data:,">${css}</head>\n<body><main><div id="root"></div></main><script type="module" src="./${name}.js"></script></body>\n</html>\n`,
    );
    pages[name] = `/${name}.html`;
  }
  return pages;
}
