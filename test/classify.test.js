import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTarget, parseTargetInput } from "../src/plan/classify.js";
import { STORYBOOK_INDEX, fakeFetch, makeTree } from "./helpers/fixtures.js";

test("label syntax", () => {
  assert.deepEqual(parseTargetInput("radix=npm:@radix-ui/react-dialog"), { label: "radix", spec: "npm:@radix-ui/react-dialog" });
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

test("a bare word is a folder in the working folder, not a package", async () => {
  const cwd = makeTree({ "button/index.html": "<h1>Hi</h1>", "demo.html": "<h1>Hi</h1>" });
  const folder = await classifyTarget("button", { cwd });
  assert.equal(folder.status, "ok");
  assert.equal(folder.kind, "static-dir");
  assert.equal(folder.resolved.path, `${cwd}/button`);
  assert.equal((await classifyTarget("demo.html", { cwd })).kind, "html-file");
  assert.equal((await classifyTarget("button/index.html", { cwd })).kind, "html-file");
});

test("npm: picks a package, even when a folder has the same name", async () => {
  const cwd = makeTree({ "button/index.html": "<h1>Hi</h1>" });
  const target = await classifyTarget("npm:button", { cwd });
  assert.equal(target.kind, "npm");
  assert.equal(target.resolved.name, "button");
  assert.equal(target.resolved.requested, null);
  assert.equal((await classifyTarget("button", { cwd })).kind, "static-dir", "without the prefix, the folder wins");
});

test("npm package forms need the npm: prefix", async () => {
  const cases = [
    ["npm:lodash", "lodash", null],
    ["npm:@scope/name", "@scope/name", null],
    ["npm:react@18.3.1", "react", "18.3.1"],
    ["npm:@radix-ui/react-dialog@^1.1.0", "@radix-ui/react-dialog", "^1.1.0"],
    ["npm:react@latest", "react", "latest"],
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

test("a bare word that isn't a path fails, and the message says how to ask for a package or a web page", async () => {
  const cwd = makeTree();
  const react = await classifyTarget("react", { cwd });
  assert.equal(react.status, "failed");
  assert.match(react.reason, /Path not found: .*\/react\./);
  assert.match(react.reason, /If you meant the npm package, write npm:react\./);
  assert.doesNotMatch(react.reason, /web page/);
  assert.match((await classifyTarget("@radix-ui/react-dialog", { cwd })).reason, /write npm:@radix-ui\/react-dialog\./);
  assert.match((await classifyTarget("react@18", { cwd })).reason, /write npm:react@18\./);
  const host = await classifyTarget("example.com", { cwd });
  assert.match(host.reason, /If you meant a web page, write https:\/\/example\.com\./);
  const nothing = await classifyTarget("My Folder!", { cwd });
  assert.doesNotMatch(nothing.reason, /If you meant/, "no hint when the word could be neither");
  // An explicit path that's missing gets no hint, because the user was clear.
  assert.doesNotMatch((await classifyTarget("./react", { cwd })).reason, /If you meant/);
});

test("npm: with a bad name fails with a reason", async () => {
  const cwd = makeTree();
  assert.match((await classifyTarget("npm:React", { cwd })).reason, /lowercase/);
  assert.match((await classifyTarget("npm:foo/bar", { cwd })).reason, /isn't a valid npm package name\. Write npm:name/);
  assert.match((await classifyTarget("npm:react@", { cwd })).reason, /no version/);
  assert.match((await classifyTarget("npm:", { cwd })).reason, /isn't a valid npm package name/);
});

test("a URL that isn't http or https fails clearly", async () => {
  const target = await classifyTarget("ftp://example.com", { cwd: makeTree() });
  assert.equal(target.status, "failed");
  assert.match(target.reason, /Only http and https URLs are supported\. Got "ftp:\/\/"\./);
});

test("label names the target; package name or host is the default", async () => {
  const cwd = makeTree();
  const labelled = await classifyTarget("radix=npm:@radix-ui/react-dialog", { cwd });
  assert.equal(labelled.label, "radix");
  assert.equal(labelled.name, "radix");
  assert.equal((await classifyTarget("npm:@radix-ui/react-dialog", { cwd })).name, "@radix-ui/react-dialog");
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
