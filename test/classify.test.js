import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTarget, parseTargetInput } from "../src/plan/classify.js";
import { STORYBOOK_INDEX, fakeFetch, makeTree } from "./helpers/fixtures.js";

test("label syntax", () => {
  assert.deepEqual(parseTargetInput("radix=@radix-ui/react-dialog"), { label: "radix", spec: "@radix-ui/react-dialog" });
  assert.deepEqual(parseTargetInput("react"), { label: null, spec: "react" });
  assert.deepEqual(parseTargetInput("site=https://example.com/?a=b"), { label: "site", spec: "https://example.com/?a=b" });
  assert.deepEqual(parseTargetInput("https://example.com/?a=b"), { label: null, spec: "https://example.com/?a=b" });
  assert.deepEqual(parseTargetInput("./dir=odd"), { label: null, spec: "./dir=odd" });
});

test("local path: .html file is served as html-file", async () => {
  const cwd = makeTree({ "page.html": "<h1>Hi</h1>" });
  const target = await classifyTarget("./page.html", { cwd });
  assert.equal(target.status, "ok");
  assert.equal(target.kind, "html-file");
  assert.equal(target.evidenceLevel, "page");
  assert.equal(target.resolved.path, `${cwd}/page.html`);
});

test("local path: directory is a static site", async () => {
  const cwd = makeTree({ "site/index.html": "<h1>Hi</h1>" });
  const target = await classifyTarget("./site", { cwd });
  assert.equal(target.kind, "static-dir");
});

test("local path: directory with a Storybook index.json is Storybook", async () => {
  const cwd = makeTree({ "sb/index.json": STORYBOOK_INDEX, "sb/iframe.html": "" });
  const target = await classifyTarget("./sb", { cwd });
  assert.equal(target.kind, "storybook");
  assert.equal(target.evidenceLevel, "component");
  assert.equal(target.resolved.index, "index.json");
});

test("local path: older stories.json is Storybook too", async () => {
  const cwd = makeTree({ "sb/stories.json": JSON.stringify({ v: 3, stories: {} }) });
  assert.equal((await classifyTarget("./sb", { cwd })).kind, "storybook");
});

test("local path: an index.json that isn't a Storybook index stays a static site", async () => {
  const cwd = makeTree({ "site/index.json": JSON.stringify({ hello: "world" }), "site/index.html": "" });
  assert.equal((await classifyTarget("./site", { cwd })).kind, "static-dir");
});

test("local path: rejects other file types with a clear message", async () => {
  const cwd = makeTree({ "doc.pdf": "", "Button.tsx": "", "notes": "" });
  const pdf = await classifyTarget("./doc.pdf", { cwd });
  assert.equal(pdf.status, "failed");
  assert.match(pdf.reason, /Unsupported file type ".pdf"/);
  const tsx = await classifyTarget("./Button.tsx", { cwd });
  assert.match(tsx.reason, /Component source files/);
  assert.match((await classifyTarget("./notes", { cwd })).reason, /"\(none\)"|Unsupported file type/);
});

test("local path: missing path fails with the absolute path", async () => {
  const cwd = makeTree();
  const target = await classifyTarget("./nope.html", { cwd });
  assert.equal(target.status, "failed");
  assert.match(target.reason, /Path not found: .*nope\.html/);
});

test("local path prefixes: ../, /, ~/, file:, and file://", async () => {
  const cwd = makeTree({ "a/page.html": "", "a/b/.keep": "" });
  const nested = `${cwd}/a/b`;
  assert.equal((await classifyTarget("../page.html", { cwd: nested })).kind, "html-file");
  assert.equal((await classifyTarget(`${cwd}/a/page.html`, { cwd })).kind, "html-file");
  assert.equal((await classifyTarget("~/page.html", { cwd, home: `${cwd}/a` })).kind, "html-file");
  assert.equal((await classifyTarget("file:a/page.html", { cwd })).kind, "html-file");
  assert.equal((await classifyTarget(`file://${cwd}/a/page.html`, { cwd })).kind, "html-file");
});

test("a bare name is a package, never a folder", async () => {
  const cwd = makeTree({ "button/index.html": "" });
  const target = await classifyTarget("button", { cwd });
  assert.equal(target.kind, "npm");
  assert.equal(target.resolved.name, "button");
  assert.equal(target.resolved.requested, null);
});

test("npm package forms", async () => {
  const cases = [
    ["lodash", "lodash", null],
    ["@scope/name", "@scope/name", null],
    ["react@18.3.1", "react", "18.3.1"],
    ["@radix-ui/react-dialog@^1.1.0", "@radix-ui/react-dialog", "^1.1.0"],
    ["react@latest", "react", "latest"],
    ["npm:react", "react", null],
    ["npm:@a/b@2", "@a/b", "2"],
  ];
  for (const [input, name, requested] of cases) {
    const target = await classifyTarget(input, { cwd: makeTree() });
    assert.equal(target.status, "ok", input);
    assert.equal(target.kind, "npm", input);
    assert.equal(target.evidenceLevel, "component", input);
    assert.equal(target.resolved.name, name, input);
    assert.equal(target.resolved.requested, requested, input);
  }
});

test("npm: bad specs fail with a reason", async () => {
  const cwd = makeTree();
  assert.match((await classifyTarget("React", { cwd })).reason, /lowercase/);
  assert.match((await classifyTarget("foo/bar", { cwd })).reason, /Can't classify/);
  assert.match((await classifyTarget("react@", { cwd })).reason, /no version/);
  assert.match((await classifyTarget("ftp://example.com", { cwd })).reason, /Can't classify/);
});

test("label names the target; package name or host is the default", async () => {
  const cwd = makeTree();
  const labelled = await classifyTarget("radix=@radix-ui/react-dialog", { cwd });
  assert.equal(labelled.label, "radix");
  assert.equal(labelled.name, "radix");
  assert.equal((await classifyTarget("@radix-ui/react-dialog", { cwd })).name, "@radix-ui/react-dialog");
});

test("URL: Storybook index.json at the root", async () => {
  const fetch = fakeFetch({ "https://sb.example.com/index.json": { body: STORYBOOK_INDEX } });
  const target = await classifyTarget("https://sb.example.com", { fetch });
  assert.equal(target.kind, "storybook");
  assert.equal(target.resolved.url, "https://sb.example.com/");
});

test("URL: Storybook under a path, and stories.json", async () => {
  const fetch = fakeFetch({ "https://example.com/docs/sb/stories.json": { body: JSON.stringify({ v: 3, stories: {} }) } });
  const target = await classifyTarget("https://example.com/docs/sb/", { fetch });
  assert.equal(target.kind, "storybook");
  assert.equal(target.resolved.index, "stories.json");
});

test("URL: a page inside a Storybook build finds the index next to it", async () => {
  const fetch = fakeFetch({ "https://example.com/sb/index.json": { body: STORYBOOK_INDEX } });
  assert.equal((await classifyTarget("https://example.com/sb/iframe.html", { fetch })).kind, "storybook");
});

test("URL: anything else that responds is a plain URL", async () => {
  const fetch = fakeFetch({ "https://example.com/": { body: "<h1>Hi</h1>" } });
  const target = await classifyTarget("https://example.com/", { fetch });
  assert.equal(target.kind, "url");
  assert.equal(target.evidenceLevel, "page");
  assert.equal(target.name, "example.com");
});

test("URL: a non-Storybook index.json doesn't make it Storybook", async () => {
  const fetch = fakeFetch({
    "https://example.com/index.json": { body: JSON.stringify({ posts: [] }) },
    "https://example.com/": { body: "<h1>Hi</h1>" },
  });
  assert.equal((await classifyTarget("https://example.com/", { fetch })).kind, "url");
});

test("URL: failures name the problem", async () => {
  const fetch = fakeFetch({ "https://example.com/missing": { status: 404 } });
  assert.match((await classifyTarget("https://example.com/missing", { fetch })).reason, /HTTP 404/);
  assert.match((await classifyTarget("https://down.example.com/", { fetch })).reason, /didn't respond/);
});
