import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DOMAIN, PAGES, buildDocs } from "../scripts/build-docs.js";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), "a11y-docs-")), "site");
const written = buildDocs({ root, outDir: out });
const html = Object.fromEntries(written.map((page) => [page.out, readFileSync(join(out, page.out), "utf8")]));
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

test("every Markdown page in docs/ is on the site, in the navigation, and nothing else is missing", () => {
  const sources = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`).sort();
  assert.deepEqual(PAGES.filter((p) => p.file.startsWith("docs/")).map((p) => p.file).sort(), sources, "a page that isn't listed in PAGES would be left out of the site");
  assert.deepEqual(readdirSync(out).filter((name) => name.endsWith(".html")).sort(), [...PAGES.map((p) => p.out), "404.html"].sort());
  assert.ok(readdirSync(out).includes(".nojekyll"), "GitHub Pages doesn't run Jekyll over the site");
  for (const page of PAGES) {
    for (const other of PAGES) assert.ok(html[page.out].includes(`<a href="${other.out}"`), `${page.out} links to ${other.out} in the navigation`);
    assert.equal((html[page.out].match(/<a href="[^"]+" aria-current="page"/g) ?? []).length, 1, `${page.out} marks its own entry as the current page`);
  }
});

test("each page has the structure a screen reader user needs: language, title, skip link, landmarks, one h1", () => {
  for (const page of PAGES) {
    const text = html[page.out];
    assert.match(text, /^<!doctype html>\n<html lang="en" data-pantoken-color="plum">/, `${page.out} has a language and the plum scheme`);
    assert.match(text, /<link rel="stylesheet" href="pantoken.css">/, `${page.out} loads the pantoken styles`);
    assert.match(text, /<title>[^<]+<\/title>/);
    assert.match(text, /<meta name="viewport" content="width=device-width, initial-scale=1">/, `${page.out} works on a phone`);
    assert.match(text, /<a class="skip" href="#main">/, `${page.out} has a skip link`);
    assert.match(text, /<main id="main" tabindex="-1">/, `${page.out} has a main landmark the skip link lands on`);
    assert.match(text, /<nav class="docs" aria-label="Documentation">/);
    assert.match(text, /<header class="site">[\s\S]*<footer class="site">/);
    assert.equal((text.match(/<h1[ >]/g) ?? []).length, 1, `${page.out} has one h1`);
    assert.doesNotMatch(text, /<script/i, `${page.out} needs no script`);
    const ids = [...text.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${page.out} has no duplicate ids`);
  }
  assert.match(html["index.html"], /<title>automatica11y<\/title>/);
  assert.match(html["targets.html"], /<title>Targets - automatica11y<\/title>/);
});

test("every link on the site points at a page and a section that exist", () => {
  for (const page of PAGES) {
    for (const [, href] of html[page.out].matchAll(/ href="([^"]*)"/g)) {
      if (/^(https?:|mailto:)/.test(href) || href.endsWith(".css")) continue;
      assert.doesNotMatch(href, /\.md(#|$)/, `${page.out} links to a Markdown file: ${href}`);
      const [file, hash] = href.split("#");
      const target = file === "" ? page.out : file;
      assert.ok(html[target] !== undefined, `${page.out} links to ${href}, which isn't a page`);
      if (hash) assert.ok(html[target].includes(` id="${hash}"`), `${page.out} links to ${href}, which has no such section`);
    }
  }
});

test("the agent steps and the fixture guide are the skills' own words, so they can't drift", () => {
  const steps = readFileSync(join(root, "skills/automatica11y-runner/SKILL.md"), "utf8");
  const sentence = /This skill turns a request into an `automatica11y` command, runs it, and writes a report from the results\./.exec(steps)[0];
  assert.ok(html["agent-steps.html"].includes(sentence.replace(/`([^`]+)`/g, "<code>$1</code>")), "the steps page carries the runner skill's text");
  assert.doesNotMatch(html["agent-steps.html"], /compatibility: Needs Node/, "the skill's front matter isn't shown");
  const guide = readFileSync(join(root, "skills/automatica11y-runner/references/fixtures.md"), "utf8");
  assert.ok(html["fixtures.html"].includes("<h1 id=\"writing-fixtures\">Writing fixtures</h1>") && guide.startsWith("# Writing fixtures"));
  // The runner links to its own reference file. On the site that's a page, and a file elsewhere in the repository is a link to GitHub.
  assert.ok(html["agent-steps.html"].includes('href="fixtures.html"'));
});

test("tables and code can be read without a mouse", () => {
  for (const page of PAGES) {
    const labels = [...html[page.out].matchAll(/<div class="scroll" role="region" tabindex="0" aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(labels).size, labels.length, `${page.out}: each scrollable table has its own label`);
    assert.equal((html[page.out].match(/<table>/g) ?? []).length, labels.length, `${page.out}: every table is wrapped`);
    assert.doesNotMatch(html[page.out], /<pre tabindex/, "code wraps instead of scrolling, so it doesn't need focus");
  }
  assert.match(html["options.html"], /aria-label="Table: Options"/);
  assert.match(html["agent-steps.html"], /aria-label="Table: 3\. Turn the request into a command \(2\)"/, "a second table under the same heading gets its own label");
  assert.match(html["index.html"], /white-space: pre-wrap/);
  assert.match(html["index.html"], /color-scheme: light dark/);
  const css = readFileSync(join(out, "pantoken.css"), "utf8");
  assert.match(css, /:root\[data-pantoken-color=plum\]\{/, "the plum scheme is in the stylesheet");
  assert.match(css, /light-dark\(/, "pantoken switches light and dark itself");
  assert.match(html["index.html"], /forced-colors: active/);
});

test("the README points at the site, and the pages it names exist", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /\(https:\/\/automatica11y\.dev\/\)/);
  for (const [, page] of readme.matchAll(/automatica11y\.dev\/([a-z-]+\.html)/g)) assert.ok(html[page] !== undefined, `the README links to ${page}`);
  assert.ok(readme.split("\n").length < 100, "the README stays short: the details live in the docs");
});

test("the site passes the tool's own checks: no axe-core or IBM violations, and every conditions check holds", { skip, timeout: 400_000 }, async () => {
  for (const page of ["index.html", "agent-steps.html"]) {
    const cwd = makeTree();
    const { io } = makeIo({ cwd, env: process.env });
    const code = await main(["audit", join(out, page), "--tiers", "rules,conditions"], io);
    assert.equal(code, 0);
    const results = parseResults(JSON.parse(readFileSync(join(cwd, "a11y-report", "results.json"), "utf8")));
    const tiers = results.targets[0].archetypes.page.configs[0].tiers;
    for (const [engine, result] of Object.entries(tiers.rules.engines)) assert.deepEqual(result.violations.map((v) => v.ruleId), [], `${page}: ${engine} violations`);
    assert.deepEqual(tiers.conditions.checks.filter((c) => c.result === "fail" || c.result === "error").map((c) => `${c.name}: ${c.detail}`), [], `${page}: conditions`);
  }
});

test("the site is served from automatica11y.dev: a CNAME in every build, and no reference to the old address", () => {
  assert.equal(DOMAIN, "automatica11y.dev");
  assert.equal(readFileSync(join(out, "CNAME"), "utf8"), "automatica11y.dev\n", "Pages reads the domain from this file, and each publish replaces the branch");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.homepage, "https://automatica11y.dev");
  assert.match(html["index.html"], /<link rel="canonical" href="https:\/\/automatica11y\.dev\/">/);
  assert.match(html["targets.html"], /<link rel="canonical" href="https:\/\/automatica11y\.dev\/targets\.html">/);
  assert.match(readFileSync(join(out, "404.html"), "utf8"), /href="https:\/\/automatica11y\.dev\/"/);
  const sources = [join(root, "README.md"), join(root, "AGENTS.md"), join(root, "package.json"), join(root, "scripts/build-docs.js"), ...readdirSync(join(root, "docs")).map((name) => join(root, "docs", name))];
  for (const file of sources) assert.doesNotMatch(readFileSync(file, "utf8"), /github\.io/, `${file} has no reference to the old github.io address`);
  for (const page of PAGES) assert.doesNotMatch(html[page.out], /github\.io/, `${page.out} has no reference to the old address`);
});
