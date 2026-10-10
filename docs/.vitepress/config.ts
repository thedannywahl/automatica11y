import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type MarkdownIt from "markdown-it";
import type { Plugin } from "vite";
import { defineConfig } from "vitepress";
import { prepareDocs } from "../../scripts/prepare-docs.js";

const hostname = "https://automatica11y.dev";
const description = "Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.";
const repo = "https://github.com/thedannywahl/automatica11y";
const root = fileURLToPath(new URL("../../", import.meta.url));
const skillFiles = [
  resolve(root, "skills/automatica11y-runner/SKILL.md"),
  resolve(root, "skills/automatica11y-runner/references/fixtures.md"),
];

const docsContentPlugin: Plugin = {
  name: "automatica11y-doc-content",
  configureServer(server) {
    server.watcher.add(skillFiles);
    server.watcher.on("change", (changedFile) => {
      if (!skillFiles.includes(resolve(changedFile))) return;
      prepareDocs();
      server.ws.send({ type: "full-reload" });
    });
  },
};

const pantokenRootPlugin: Plugin = {
  name: "automatica11y-pantoken-root",
  transformIndexHtml(html) {
    return html.replace(/<html([^>]*)>/, (tag) =>
      tag.includes("data-pantoken-color") ? tag : tag.replace(/>$/, ' data-pantoken-color="plum">'),
    );
  },
};

function installAccessibleTables(md: MarkdownIt) {
  const renderHeading = md.renderer.rules.heading_open;

  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    env.automatica11yTableHeading = tokens[index + 1]?.content || "this page";
    return renderHeading ? renderHeading(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };
  md.renderer.rules.table_open = (tokens, index, options, env, self) => {
    const heading = env.automatica11yTableHeading || "this page";
    const counts = env.automatica11yTableCounts ??= new Map();
    const count = (counts.get(heading) ?? 0) + 1;
    counts.set(heading, count);
    const label = `Table: ${heading.replace(/\.$/, "")}${count > 1 ? ` (${count})` : ""}`;
    return `<div class="scroll" role="region" tabindex="0" aria-label="${md.utils.escapeHtml(label)}">\n<table>\n`;
  };
  md.renderer.rules.table_close = () => "</table>\n</div>\n";
}

export default defineConfig({
  lang: "en",
  title: "automatica11y",
  titleTemplate: false,
  description,
  outDir: "../site",
  cleanUrls: true,
  sitemap: { hostname },
  srcExclude: ["engineering-log.md"],
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "automatica11y" }],
    ["meta", { property: "og:image", content: `${hostname}/og.png` }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: "automatica11y: test accessibility and compare results for web pages, Storybook builds, and npm components." }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: `${hostname}/og.png` }],
  ],
  transformHead({ pageData }) {
    const title = pageData.title;
    const pageDescription = pageData.description || description;
    const path = pageData.relativePath.replace(/index\.md$/, "").replace(/\.md$/, "");
    const url = `${hostname}/${path}`;
    const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
    const structuredData = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${hostname}/`, url: `${hostname}/`, name: "automatica11y" },
        {
          "@type": "SoftwareApplication",
          "@id": `${hostname}/#software`,
          name: "automatica11y",
          description,
          url: `${hostname}/`,
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "Accessibility testing",
          operatingSystem: "macOS, Windows, Linux",
          softwareVersion: version,
          license: "https://opensource.org/licenses/MIT",
          codeRepository: `${repo}.git`,
          downloadUrl: "https://www.npmjs.com/package/automatica11y",
        },
        {
          "@type": "WebPage",
          "@id": url,
          url,
          name: title,
          description: pageDescription,
          isPartOf: { "@id": `${hostname}/` },
          about: { "@id": `${hostname}/#software` },
        },
      ],
    }).replace(/</g, "\\u003c");
    return [
      ["link", { rel: "canonical", href: url }],
      ["meta", { name: "description", content: pageDescription }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: pageDescription }],
      ["script", { type: "application/ld+json" }, structuredData],
    ];
  },
  transformPageData(pageData) {
    if (pageData.relativePath === "index.md") {
      return { title: "automatica11y: Accessibility Testing and Comparison" };
    }
    return { title: `${pageData.title.replace(/\.$/, "")} - automatica11y` };
  },
  transformHtml(html) {
    return html
      .replace(/<html([^>]*)>/, (tag) =>
        tag.includes("data-pantoken-color") ? tag : tag.replace(/>$/, ' data-pantoken-color="plum">'),
      )
      .replace(/<div class="VPContent([^\"]*)" id="VPContent"/, (tag, classes) =>
        `${tag}${classes.includes("is-home") ? ' role="main"' : ""} tabindex="-1"`,
      )
      .replace('<aside class="VPSidebar"', '<aside class="VPSidebar" aria-label="Documentation navigation"');
  },
  markdown: { config: installAccessibleTables },
  vite: {
    plugins: [docsContentPlugin, pantokenRootPlugin],
    build: { cssTarget: "chrome130" },
  },
  buildEnd(siteConfig) {
    mkdirSync(siteConfig.outDir, { recursive: true });
    writeFileSync(resolve(siteConfig.outDir, ".nojekyll"), "");
  },
  themeConfig: {
    siteTitle: '<span class="brand-mark" aria-hidden="true"></span><span class="brand-main">automatic</span><span class="brand-accent">a11y</span>',
    nav: [
      { text: "Guide", link: "/quick-start" },
      { text: "Options", link: "/options" },
      { text: "Reports", link: "/reports" },
    ],
    sidebar: [
      { text: "Guide", items: [
        { text: "Quick start", link: "/quick-start" },
        { text: "Targets", link: "/targets" },
        { text: "What it checks", link: "/checks" },
        { text: "Options and exit codes", link: "/options" },
        { text: "Reading a report", link: "/reports" },
        { text: "npm packages and fixtures", link: "/npm-packages" },
        { text: "Writing fixtures", link: "/fixtures" },
        { text: "Using it with an AI agent", link: "/agents" },
        { text: "The agent steps", link: "/agent-steps" },
        { text: "Limits", link: "/limits" },
      ] },
    ],
    footer: {
      message: "Released under the MIT License",
      copyright: `automatica11y. Source on <a href="${repo}">GitHub</a>; install from <a href="https://www.npmjs.com/package/automatica11y">npm</a>.`,
    },
    socialLinks: [
      {
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
        },
        link: "/llms.txt",
        ariaLabel: "llms.txt - documentation for AI agents",
      },
      { icon: "github", link: repo },
    ],
  },
});