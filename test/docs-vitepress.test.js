import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "site");
const pageList = [
  { source: "docs/index.md", out: "index.html", route: "/" },
  { source: "docs/quick-start.md", out: "quick-start.html", route: "/quick-start" },
  { source: "docs/targets.md", out: "targets.html", route: "/targets" },
  { source: "docs/checks.md", out: "checks.html", route: "/checks" },
  { source: "docs/options.md", out: "options.html", route: "/options" },
  { source: "docs/reports.md", out: "reports.html", route: "/reports" },
  { source: "docs/npm-packages.md", out: "npm-packages.html", route: "/npm-packages" },
  { source: "skills/automatica11y-runner/references/fixtures.md", out: "fixtures.html", route: "/fixtures" },
  { source: "docs/agents.md", out: "agents.html", route: "/agents" },
  { source: "skills/automatica11y-runner/SKILL.md", out: "agent-steps.html", route: "/agent-steps" },
  { source: "docs/limits.md", out: "limits.html", route: "/limits" },
];

execFileSync(process.execPath, ["scripts/prepare-docs.js"], { cwd: root, stdio: "pipe" });
execFileSync(process.execPath, ["node_modules/vitepress/bin/vitepress.js", "build", "docs"], { cwd: root, stdio: "pipe" });
const html = Object.fromEntries(pageList.map((page) => [page.out, readFileSync(join(out, page.out), "utf8")]));
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

test("all documentation sources build at clean VitePress routes", () => {
  const sources = readdirSync(join(root, "docs"))
    .filter((name) => name.endsWith(".md") && !["404.md", "agent-steps.md", "fixtures.md"].includes(name))
    .map((name) => `docs/${name}`)
    .sort();
  assert.deepEqual(pageList.filter((page) => page.source.startsWith("docs/")).map((page) => page.source).sort(), sources);
  assert.deepEqual(
    readdirSync(out).filter((name) => name.endsWith(".html")).sort(),
    [...pageList.map((page) => page.out), "404.html"].sort(),
  );
  assert.ok(readdirSync(out).includes(".nojekyll"));
  assert.equal(readFileSync(join(out, "CNAME"), "utf8"), "automatica11y.dev\n");
  for (const page of pageList) {
    assert.ok(html[page.out], `${page.route} was built`);
    const hrefs = [...html[page.out].matchAll(/\shref="([^"]*)"/g)].map((match) => match[1]).join("\n");
    assert.doesNotMatch(hrefs, /\.html(?:#|"|$)/, `${page.route} uses clean URLs`);
    assert.match(html[page.out], /Skip to content/);
    assert.match(html[page.out], /id="VPContent"[^>]*tabindex="-1"/);
    if (page.route === "/") assert.match(html[page.out], /id="VPContent" role="main" tabindex="-1"/);
    else assert.match(html[page.out], /<aside class="VPSidebar" aria-label="Documentation navigation"/);
    assert.match(html[page.out], /<html[^>]*lang="en"[^>]*data-pantoken-color="plum"/);
    assert.equal((html[page.out].match(/<h1\b/g) ?? []).length, 1, `${page.route} has one h1`);
    const ids = [...html[page.out].matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page.route} has unique ids`);
  }
  for (const page of pageList.slice(1)) assert.ok(html[page.out].includes(page.route), `${page.route} appears in documentation navigation`);
  assert.match(html["index.html"], /<title>automatica11y: Accessibility Testing and Comparison<\/title>/);
  for (const anchor of ["quick-start-cli", "quick-start-ci", "quick-start-ai"]) {
    assert.ok(html["index.html"].includes(`href="/quick-start#${anchor}"`), `home action links to ${anchor}`);
    assert.ok(html["quick-start.html"].includes(`id="${anchor}"`), `${anchor} section exists in the guide`);
    assert.ok(!html["index.html"].includes(`id="${anchor}"`), "quick-start content is not on the homepage");
  }
  assert.ok(html["index.html"].includes('href="/llms.txt"'));
  assert.ok(html["index.html"].includes('class="brand-main">automatic</span>'));
  assert.ok(html["index.html"].includes('class="brand-accent">a11y</span>'));
  assert.ok(html["index.html"].includes('class="brand-mark" aria-hidden="true"'));
  assert.doesNotMatch(html["index.html"], /<footer\b/);
  assert.match(html["index.html"], /Accessibility testing,<br\s*\/?>with evidence\./);
  assert.match(html["index.html"], /Across frameworks/);
  assert.match(html["index.html"], /React, Vue 3, Angular 22\+, Svelte 5\+, plain HTML, and web components\./);
});

test("each page has canonical, social, and application metadata", () => {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  for (const page of pageList) {
    const text = html[page.out];
    const canonical = `https://automatica11y.dev${page.route === "/" ? "/" : page.route}`;
    assert.ok(text.includes(`<link rel="canonical" href="${canonical}">`), `${page.route} has a clean canonical URL`);
    assert.match(text, /<meta property="og:site_name" content="automatica11y">/);
    assert.match(text, /<meta property="og:image" content="https:\/\/automatica11y\.dev\/og\.png">/);
    assert.match(text, /<meta property="og:image:alt" content="automatica11y: test accessibility and compare results for web pages, Storybook builds, and npm components\."/);
    assert.match(text, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(text, /<meta name="twitter:image" content="https:\/\/automatica11y\.dev\/og\.png">/);
    assert.match(text, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(text);
    assert.ok(match, `${page.route} has JSON-LD`);
    const data = JSON.parse(match[1]);
    const application = data["@graph"].find((item) => item["@type"] === "SoftwareApplication");
    const webpage = data["@graph"].find((item) => item["@type"] === "WebPage");
    assert.equal(application.softwareVersion, version);
    assert.equal(webpage.url, canonical);
    assert.deepEqual(webpage.about, { "@id": "https://automatica11y.dev/#software" });
  }
  for (const [source, destination] of [["automatica11y-og.png", "og.png"], ["automatica11y-og-light.png", "og-light.png"], ["home-light.svg", "home-light.svg"], ["home-dark.svg", "home-dark.svg"], ["automatica11y-favicon.ico", "favicon.ico"], ["automatica11y-favicon.svg", "favicon.svg"]]) {
    assert.deepEqual(readFileSync(join(out, destination)), readFileSync(join(root, "site-assets", source)));
  }
});

test("internal links resolve to built clean routes and existing sections", () => {
  for (const page of pageList) {
    for (const [, href] of html[page.out].matchAll(/\shref="([^"]*)"/g)) {
      if (/^(https?:|mailto:|\/\/)/.test(href) || href.endsWith(".css")) continue;
      assert.doesNotMatch(href, /\.md(?:#|$)/, `${page.route} does not link to Markdown`);
      const pageUrl = new URL(page.route, "https://automatica11y.dev");
      const targetUrl = new URL(href, pageUrl);
      const route = targetUrl.pathname;
      const hash = targetUrl.hash.slice(1);
      if (/^\/(?:assets|fonts)\//.test(route) || /\.(?:svg|png|ico|woff2|css|js|txt)$/i.test(route)) {
        assert.ok(existsSync(join(out, route.slice(1))), `${href} is a built asset`);
        continue;
      }
      const target = route === "/" ? "index.html" : `${route.slice(1)}.html`;
      assert.ok(html[target], `${page.route} links to built route ${route}`);
      if (hash) assert.ok(html[target].includes(`id="${hash}"`), `${page.route} links to existing anchor ${href}`);
    }
  }
});

test("skill pages stay synchronized with their canonical sources", () => {
  const steps = readFileSync(join(root, "skills/automatica11y-runner/SKILL.md"), "utf8");
  const sentence = /This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results\./.exec(steps)[0];
  assert.ok(html["agent-steps.html"].includes(sentence.replace(/`([^`]+)`/g, "<code>$1</code>")));
  assert.doesNotMatch(html["agent-steps.html"], /compatibility: Needs Node/);
  const fixtures = readFileSync(join(root, "skills/automatica11y-runner/references/fixtures.md"), "utf8");
  assert.ok(fixtures.startsWith("# Writing fixtures"));
  assert.ok(html["fixtures.html"].includes("<h1 id=\"writing-fixtures\""));
  assert.ok(html["agent-steps.html"].includes('href="/fixtures"'));
});

test("scrollable tables have keyboard-focusable, uniquely labelled regions", () => {
  const text = html["agent-steps.html"];
  const labels = [...text.matchAll(/<div class="scroll" role="region" tabindex="0" aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(labels.length > 0);
  assert.equal(new Set(labels).size, labels.length);
  assert.equal((text.match(/<table>/g) ?? []).length, labels.length);
});

test("Pantoken plum styling and responsive pattern are included", () => {
  const styles = readdirSync(join(out, "assets"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(join(out, "assets", name), "utf8"))
    .join("\n");
  assert.match(styles, /:root\[data-pantoken-color=plum\]/);
  assert.match(styles, /--brand-mark-image:url\(["']?data:image\/svg\+xml/);
  assert.doesNotMatch(styles, /object-position:-100px/);
  assert.match(styles, /--vp-c-text-1:var\(--instui-color-text-base\)/);
  assert.match(styles, /--vp-c-brand-1:var\(--instui-color-institutional-brand-primary\)/);
  assert.match(styles, /--vp-button-brand-bg:var\(--instui-primitive-color-plum-plum150\)/);
  assert.match(styles, /radial-gradient\(circle at 16px 16px/);
  assert.match(styles, /background-size:32px 32px/);
  assert.doesNotMatch(styles, /repeating-linear-gradient/);
  assert.match(styles, /background-position:(?:100% 0|right top)/);
  assert.match(styles, /mask-composite:intersect/);
  assert.match(styles, /linear-gradient\((?:270deg|to left),\s*(?:#000|black),\s*(?:#0000|transparent) 66\.666\d*%\)/);
  assert.match(styles, /linear-gradient\((?:(?:180deg|to bottom),\s*)?(?:#000|black),\s*(?:#0000|transparent) 66\.666\d*%\)/);
  assert.match(styles, /--vp-code-bg:var\(--instui-color-background-muted\)/);
  for (const name of ["home-light.svg", "home-dark.svg"]) {
    const background = readFileSync(join(out, name), "utf8");
    assert.match(background, /<stop offset="0\.333" stop-color="black"\/>/);
    assert.match(background, /<pattern id="dots" width="32" height="32"/);
    assert.match(background, /<circle cx="16" cy="16" r="2\.5"/);
    assert.doesNotMatch(background, /viewBox=/);
  }
  assert.match(styles, /--vp-nav-home-bg-color:var\(--vp-c-bg\)/);
  assert.match(styles, /html\[data-pantoken-color=plum\]\s+\.VPNavBar\.home:{1,2}before\{background-color:var\(--vp-c-bg\)/);
  assert.doesNotMatch(styles, /VPHomeHero::before/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /@pantoken\/vitepress|--vp-c-text-1:var\(--instui-color-text-base\)/);
});

test("README preview and public domain remain correct", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^\[\!\[automatica11y Open Graph preview\]\(https:\/\/automatica11y\.dev\/og\.png\)\]\(https:\/\/automatica11y\.dev\/\)/);
  assert.match(readme, /\(https:\/\/automatica11y\.dev\/\)/);
  assert.match(readFileSync(join(out, "404.html"), "utf8"), /<title>Page not found - automatica11y<\/title>/);
  const llms = readFileSync(join(out, "llms.txt"), "utf8");
  assert.match(llms, /^# automatica11y/m);
  for (const page of pageList) assert.ok(llms.includes(`https://automatica11y.dev${page.route}`));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.homepage, "https://automatica11y.dev");
  assert.equal(pkg.devDependencies["@pantoken/vitepress"], "0.3.0");
  for (const file of [join(root, "README.md"), join(root, "AGENTS.md"), join(root, "package.json"), join(root, "docs/.vitepress/config.ts"), ...readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => join(root, "docs", name))]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /github\.io/, `${file} has no old address`);
  }
});

test("the home, quick-start, and runner pages pass the tool's accessibility checks", { skip, timeout: 400_000 }, async () => {
  for (const page of ["index.html", "quick-start.html", "agent-steps.html"]) {
    const cwd = makeTree();
    const { io } = makeIo({ cwd, env: process.env });
    const code = await main(["audit", join(out, page), "--tiers", "rules,conditions"], io);
    assert.equal(code, 0);
    const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
    const tiers = results.targets[0].archetypes.page.configs[0].tiers;
    for (const [engine, result] of Object.entries(tiers.rules.engines)) assert.deepEqual(result.violations.map((violation) => violation.ruleId), [], `${page}: ${engine} violations`);
    assert.deepEqual(tiers.conditions.checks.filter((check) => check.result === "fail" || check.result === "error").map((check) => `${check.name}: ${check.detail}`), [], `${page}: conditions`);
  }
});