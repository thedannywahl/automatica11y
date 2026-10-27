import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { parseRunArgs } from "../src/commands/common.js";
import { configArgs, loadConfig } from "../src/commands/config.js";
import { inputArgs } from "../src/action/runner.js";
import { inScope } from "../src/discovery/context.js";
import { fetchSitemap, loadSitemaps } from "../src/discovery/sitemap.js";
import { pagePolicy } from "../src/discovery/context.js";
import { openPage } from "../src/harness/url.js";
import { launchBrowser } from "../src/harness/browser.js";
import { runConditions } from "../src/tiers/conditions/index.js";
import { gzipSync } from "node:zlib";
import { findBrowser } from "../src/env/browser.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

test("discovery interfaces validate bounds, scope and Action/YAML parity", () => {
  assert.equal(inScope("https://example.com/docs/a", "https://example.com/docs", "subtree"), true);
  assert.equal(inScope("https://example.com/docs-other", "https://example.com/docs", "subtree"), false);
  assert.equal(inScope("https://other.example/docs", "https://example.com/docs", "origin"), false);
  for (const args of [["https://example.com", "--max-pages", "5"], ["npm:react", "--crawl"], ["https://example.com", "--crawl", "--max-pages", "0"], ["https://example.com", "--crawl", "--max-depth", "-1"]]) {
    assert.throws(() => parseRunArgs("audit", args));
  }
  const cwd = makeTree({ ".automatica11y.yml": "version: 1\ntargets: [https://example.com/docs/]\noptions:\n  crawl: true\n  maxPages: 5\n  maxDepth: 0\n  crawlDelay: 0\n" });
  try {
    const fromConfig = parseRunArgs("ci", [...configArgs(loadConfig(undefined, cwd)), "https://example.com/docs/"]);
    const fromAction = parseRunArgs("ci", inputArgs({ targets: "https://example.com/docs/", crawl: "true", "max-pages": "5", "max-depth": "0", "crawl-delay": "0" }));
    assert.deepEqual(fromConfig.options.discovery, fromAction.options.discovery);
  } finally { rmSync(cwd, { recursive: true }); }
});

test("sitemap fetching rejects redirects out of scope and malformed inputs", async () => {
  await assert.rejects(fetchSitemap("https://example.com/sitemap.xml", {
    root: "https://example.com", headers: async () => ({}),
    fetch: async () => new Response("", { status: 302, headers: { location: "https://elsewhere.test/map.xml" } }),
  }), /approved origin/);
  await assert.rejects(fetchSitemap("https://example.com/sitemap.xml", {
    root: "https://example.com", headers: async () => ({}),
    fetch: async () => new Response("<!DOCTYPE x><urlset/>"),
  }), /without DTD/);
});

test("malformed sitemap XML records a coverage gap instead of a successful empty inventory", async () => {
  const server = createServer((_request, response) => {
    response.end("<urlset><url><loc>https://example.com/page</loc></url>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}`;
  /** @type {string[]} */
  const gaps = [];
  /** @type {string[]} */
  const events = [];
  try {
    await loadSitemaps([`${root}/map.xml`], {
      root, headers: async () => ({}), add: async () => {},
      event: (_url, reason) => events.push(reason), gap: (reason) => gaps.push(reason),
    });
    assert.equal(gaps.length, 1);
    assert.deepEqual(events, ["sitemap-failed"]);
  } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); }
});

const { browser } = await findBrowser();
test("trusted pre-navigation hooks refresh authentication within native retry limits", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") { response.end("User-agent: *\nAllow: /\n"); return; }
    response.setHeader("content-type", "text/html");
    if (request.headers["x-fixture-auth"] !== "refreshed") { response.writeHead(401); response.end("Expired"); return; }
    response.end('<!doctype html><html lang="en"><title>Protected</title><main><h1>Protected refreshed application</h1></main></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { io } = makeIo({ env: process.env });
  try {
    const config = fileURLToPath(new URL("./fixtures/crawl-pages/refresh-auth.mjs", import.meta.url));
    assert.equal(await main(["ci", `http://127.0.0.1:${address.port}/`, "--crawl", "--crawler-config", config, "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run"], io), 0);
    const result = parseResults(JSON.parse(readFileSync(`${io.cwd}/run/results.json`, "utf8")));
    assert.equal(result.targets.length, 1);
    assert.equal(result.discovery.statistics.requestsFinished, 1);
    assert.deepEqual(result.discovery.statistics.retryHistogram, [null, 1]);
  } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); rmSync(io.cwd, { recursive: true }); }
});

test("site crawl uses native metrics, rendered links, robots and site reporting", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    if (request.url === "/robots.txt") { response.setHeader("content-type", "text/plain"); response.end("User-agent: *\nDisallow: /blocked\n"); return; }
    response.end(readFileSync(new URL(request.url === "/" ? "./fixtures/crawl-pages/index.html" : "./fixtures/crawl-pages/second.html", import.meta.url)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}/`;
  const { io } = makeIo({ env: process.env });
  try {
    assert.equal(await main(["ci", root, "--crawl", "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run"], io), 5);
    const results = parseResults(JSON.parse(readFileSync(`${io.cwd}/run/results.json`, "utf8")));
    assert.equal(results.discovery.statistics.requestsFinished, 3);
    assert.equal(results.discovery.statistics.requestsFailed, 0);
    assert.equal(results.targets.length, 3);
    assert.ok(results.discovery.events.some((event) => event.reason === "robotsTxt"));
    assert.match(readFileSync(`${io.cwd}/run/report.md`, "utf8"), /Site accessibility report/);
  } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); rmSync(io.cwd, { recursive: true }); }
});

test("private sitemap and pages use the same trusted auth configuration", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") { response.end("User-agent: *\nAllow: /\n"); return; }
    if (request.headers["x-fixture-auth"] !== "fixture-only") { response.writeHead(401); response.end("Sign in"); return; }
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://${request.headers.host}/protected</loc></url></urlset>`);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><html lang="en"><title>Protected</title><main><h1>Protected page</h1></main></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}/`;
  const { io } = makeIo({ env: process.env });
  try {
    const hooks = fileURLToPath(new URL("./fixtures/crawl-pages/auth.mjs", import.meta.url));
    const code = await main(["ci", root, "--sitemap", `${root}sitemap.xml`, "--crawler-config", hooks, "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run"], io);
    const results = parseResults(JSON.parse(readFileSync(`${io.cwd}/run/results.json`, "utf8")));
    assert.equal(code, 0, JSON.stringify(results.targets));
    assert.equal(results.targets.length, 1);
    assert.equal(results.targets[0].page.finalUrl, `${root}protected`);
    assert.doesNotMatch(JSON.stringify(results), /fixture-only/);
  } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); rmSync(io.cwd, { recursive: true }); }
});

test("combined discovery allows an external login without forwarding site headers or auditing the provider", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
  let root = "";
  /** @type {import("node:http").IncomingHttpHeaders[]} */
  const loginHeaders = [];
  const login = createServer((request, response) => {
    loginHeaders.push(request.headers);
    response.writeHead(302, { "set-cookie": "logged-in=yes; Path=/; HttpOnly", location: root });
    response.end();
  });
  await new Promise((resolve) => login.listen(0, "127.0.0.1", () => resolve(undefined)));
  const loginAddress = login.address();
  assert.ok(loginAddress && typeof loginAddress !== "string");
  const loginOrigin = `http://127.0.0.1:${loginAddress.port}`;
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") { response.end("User-agent: *\nAllow: /"); return; }
    if (request.url === "/sitemap.xml") { response.end(`<urlset><url><loc>${root}</loc></url></urlset>`); return; }
    if (!request.headers.cookie?.includes("logged-in=yes")) { response.writeHead(302, { location: loginOrigin }); response.end(); return; }
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><html lang="en"><title>Protected</title><main><h1>Protected page</h1><a href="/second">Second page</a><a href="${loginOrigin}">Identity provider</a></main></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  root = `http://127.0.0.1:${address.port}/`;
  const cwd = makeTree({ "hooks.mjs": `export default {
    loginOrigins: [${JSON.stringify(loginOrigin)}],
    contextOptions: { extraHTTPHeaders: { Authorization: "Bearer site-only", "X-Site-Secret": "site-only" } },
    async verifyPage(page) { if (!(await page.locator("h1").textContent())?.includes("Protected")) throw new Error("Login required"); },
  };` });
  const { io } = makeIo({ cwd, env: process.env });
  try {
    assert.equal(await main(["ci", root, "--crawl", "--sitemap", `${root}sitemap.xml`, "--crawler-config", `${cwd}/hooks.mjs`, "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run"], io), 0);
    const result = parseResults(JSON.parse(readFileSync(`${cwd}/run/results.json`, "utf8")));
    assert.equal(result.targets.length, 2);
    assert.equal(result.discovery.statistics.requestsFinished, 2);
    assert.ok(loginHeaders.length > 0);
    for (const headers of loginHeaders) {
      assert.equal(headers.authorization, undefined);
      assert.equal(headers["x-site-secret"], undefined);
    }
    assert.ok(result.targets.every((target) => target.page.finalUrl.startsWith(root)));
    assert.doesNotMatch(JSON.stringify(result), /site-only/);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    await new Promise((resolve) => login.close(() => resolve(undefined)));
    rmSync(cwd, { recursive: true });
  }
});

  test("native request caps and depth restrictions produce coverage gaps", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "text/html");
      if (request.url === "/robots.txt") { response.end("User-agent: *\nAllow: /"); return; }
      response.end('<!doctype html><html lang="en"><title>Bounded</title><main><h1>Page</h1><a href="/next">Next</a></main></html>');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      for (const flags of [["--max-pages", "1"], ["--max-depth", "0"]]) {
        const { io } = makeIo({ env: process.env });
        try {
          const code = await main(["ci", `http://127.0.0.1:${address.port}/`, "--crawl", "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run", ...flags], io);
          const result = parseResults(JSON.parse(readFileSync(`${io.cwd}/run/results.json`, "utf8")));
          assert.equal(code, 5);
          assert.equal(result.targets.length, 1);
          assert.equal(result.discovery.statistics.requestsFinished, 1);
          assert.ok(result.discovery.gaps.length > 0);
        } finally { rmSync(io.cwd, { recursive: true }); }
      }
    } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); }
  });

  test("sitemap parsing follows indexes once, handles gzip and records partial failure", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/xml");
      const base = `http://${request.headers.host}`;
      if (request.url === "/index.xml") response.end(`<sitemapindex><sitemap><loc>${base}/pages.xml.gz</loc></sitemap><sitemap><loc>${base}/index.xml</loc></sitemap><sitemap><loc>${base}/broken.xml</loc></sitemap></sitemapindex>`);
      else if (request.url === "/pages.xml.gz") response.end(gzipSync(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/page?a=1&amp;b=2</loc></url></urlset>`));
      else { response.writeHead(503); response.end("Unavailable"); }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const root = `http://127.0.0.1:${address.port}`;
    /** @type {string[]} */
    const urls = [];
    /** @type {string[]} */
    const gaps = [];
    try {
      await loadSitemaps([`${root}/index.xml`], { root, headers: async () => ({}), add: async (url) => { urls.push(url); }, event: () => {}, gap: (reason) => gaps.push(reason) });
      assert.deepEqual(urls, [`${root}/page?a=1&b=2`]);
      assert.equal(gaps.length, 1);
      assert.match(gaps[0], /503/);
    } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); }
  });

  test("secondary media-variant audit contexts retain authenticated state and verification", { skip: browser ? false : "No Chrome or Chromium found", timeout: 60_000 }, async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "text/html");
      if (request.headers["x-auth"] !== "fake-token") { response.writeHead(401); response.end("Login"); return; }
      response.end('<!doctype html><html lang="en"><title>Protected</title><h1>Protected application</h1></html>');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const session = await launchBrowser({ env: process.env });
    let verified = 0;
    try {
      await pagePolicy.run({
        contextOptions: { extraHTTPHeaders: { "X-Auth": "fake-token" } },
        verifyPage: async (page) => { assert.equal(await page.locator("h1").textContent(), "Protected application"); verified++; },
      }, async () => {
        for (const options of [{}, { colorScheme: /** @type {const} */ ("dark") }, { reducedMotion: true }, { forcedColors: true }]) {
          const opened = await openPage(session.browser, `http://127.0.0.1:${address.port}/`, options);
          await opened.close();
        }
        const conditions = await runConditions(session.browser, `http://127.0.0.1:${address.port}/`, "page");
        assert.ok(conditions.checks.length > 0);
        assert.ok(conditions.checks.every((check) => check.result !== "error"), JSON.stringify(conditions));
      });
      assert.ok(verified > 4);
    } finally { await session.browser.close(); await new Promise((resolve) => server.close(() => resolve(undefined))); }
  });
    test("login-page verification exhausts bounded retries without auditing the login page", { skip: browser ? false : "No Chrome or Chromium found", timeout: 120_000 }, async () => {
      const server = createServer((request, response) => {
        if (request.url === "/robots.txt") { response.end("User-agent: *\nAllow: /\n"); return; }
        response.setHeader("content-type", "text/html");
        response.end("<!doctype html><html lang='en'><title>Login</title><h1>Login page</h1></html>");
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const { io } = makeIo({ env: process.env });
      try {
        const config = fileURLToPath(new URL("./fixtures/crawl-pages/auth.mjs", import.meta.url));
        const code = await main(["ci", `http://127.0.0.1:${address.port}/`, "--crawl", "--crawler-config", config, "--crawl-delay", "0", "--tiers", "rules", "--engine", "axe", "--out", "run"], io);
        const result = parseResults(JSON.parse(readFileSync(`${io.cwd}/run/results.json`, "utf8")));
        assert.equal(code, 4);
        assert.equal(result.discovery.statistics.requestsFinished, 0);
        assert.equal(result.discovery.statistics.requestsFailed, 1);
        assert.deepEqual(result.discovery.statistics.retryHistogram, [null, null, 1]);
        assert.equal(result.targets[0].status, "failed");
        assert.deepEqual(result.targets[0].archetypes, {});
        assert.ok(result.discovery.events.some((event) => event.reason === "authentication-failed"));
      } finally { await new Promise((resolve) => server.close(() => resolve(undefined))); rmSync(io.cwd, { recursive: true }); }
    });
