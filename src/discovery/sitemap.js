import { gunzipSync } from "node:zlib";
import { inScope } from "./context.js";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Fetch only approved sitemap documents. Browser cookies are scoped by Playwright;
 * headers are supplied per URL, never forwarded across a redirect automatically.
 * @param {string} input
 * @param {{ root: string, headers: (url: string) => Promise<Record<string, string>>, fetch?: typeof globalThis.fetch }} options
 */
export async function fetchSitemap(input, { root, headers, fetch = globalThis.fetch }) {
  let url = input;
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (!inScope(url, root, "origin")) throw new Error("Sitemap redirect left the approved origin.");
    const response = await fetch(url, { headers: await headers(url), redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Sitemap redirect has no Location header.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Sitemap responded with HTTP ${response.status}.`);
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("Sitemap exceeds the 5 MiB response limit.");
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Error("Sitemap exceeds the 5 MiB response limit.");
      chunks.push(chunk);
    }
    let body = Buffer.concat(chunks);
    if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body, { maxOutputLength: MAX_BYTES });
    const xml = body.toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:[\w.-]+:)?(?:urlset|sitemapindex)(?:\s|\/?>)/.test(xml)) throw new Error("Expected sitemap XML without DTD/entity declarations.");
    return xml;
  }
  throw new Error("Sitemap redirect limit exceeded.");
}

/**
 * Reuse Crawlee's parser but keep authenticated fetching and explicit errors here.
 * @param {string[]} sources
 * @param {{ root: string, headers: (url: string) => Promise<Record<string, string>>, add: (url: string) => Promise<void>, event: (url: string, reason: string) => void, gap: (reason: string) => void }} options
 */
export async function loadSitemaps(sources, { root, headers, add, event, gap }) {
  const { parseSitemap } = await import("@crawlee/utils");
  const pending = sources.map((url) => ({ url, depth: 0 }));
  const seen = new Set();
  const deadline = Date.now() + 120_000;
  let entries = 0;
  while (pending.length) {
    if (seen.size >= 100 || Date.now() > deadline) {
      gap("Sitemap document/time limit reached; remaining inventory is unknown.");
      break;
    }
    const source = pending.shift();
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    try {
      const xml = await fetchSitemap(source.url, { root, headers });
      for await (const item of parseSitemap([{ type: "raw", content: xml }], undefined, { emitNestedSitemaps: true, maxDepth: 0 })) {
        if (++entries > 10_000) {
          gap("Sitemap entry limit reached; remaining inventory is unknown.");
          return;
        }
        const url = new URL(item.loc).href;
        if (!inScope(url, root, "origin")) {
          event(url, "sitemap-outside-origin");
        } else if (item.originSitemapUrl === null) {
          if (source.depth >= 5) gap("Sitemap index depth limit reached.");
          else pending.push({ url, depth: source.depth + 1 });
        } else {
          await add(url);
        }
      }
    } catch (error) {
      event(source.url, "sitemap-failed");
      gap(`Sitemap ${source.url}: ${error instanceof Error ? error.message : "loading failed"}`);
    }
  }
}
