---
url: /agent-site-discovery.md
---
# Discovering a site

Read this when the user asks to crawl a site, supplies a sitemap, sets discovery limits, or needs authenticated discovery. Only crawl when requested. Preserve the supplied root, sitemap URLs and limits:

```bash
npx --yes --prefer-online automatica11y@latest audit https://example.com/docs/ --crawl
npx --yes --prefer-online automatica11y@latest audit https://example.com/docs/ --sitemap https://example.com/sitemap.xml --crawl
```

Pages discovered within a single site are one audit, not a comparison. Discovery requires one HTTP(S) root. Do not turn discovered pages into `compare` arguments or generate npm fixtures for them. Crawling never means every application state or page was tested.

## Options

| Option | Default | Use it when |
|---|---|---|
| `--crawl` | off | The user requests crawling a site. |
| `--sitemap <url>` | none | The user supplies a sitemap URL. Repeat for each sitemap; it must share the root's exact origin. |
| `--max-pages <n>` | `100` | The user sets a maximum number of handled requests during discovery (Crawlee handled-request limit; retries are extra). |
| `--max-depth <n>` | `5` | The user sets a maximum discovery depth; seeds are depth 0. |
| `--crawl-delay <seconds>` | `1` | The user sets a crawl delay. |
| `--discovery-scope subtree\|origin` | `subtree` | The user requests origin-wide discovery. |
| `--ignore-robots` | off | The user explicitly requests ignoring robots rules. Robots rules are respected otherwise. |
| `--crawler-config <trusted-local-module>` | none | The user provides a reviewed module for authenticated discovery. |

## Authentication

Authentication uses `--crawler-config <trusted-local-module>`, not inline credentials. Reuse the user's reviewed module; never request tokens, passwords or storage-state contents in chat. If authentication is requested without a module, ask for a trusted module path before auditing. It supplies native Crawlee navigation/Browser Pool hooks plus shared `contextOptions`, `setupContext(context)` and mandatory `verifyPage(page)` for secondary audit contexts. The verifier must reject login/expired pages even with HTTP 200. Hooks can refresh login within at most two request retries; they must not implement unbounded loops. External identity-provider origins require explicit `loginOrigins`; they are not audited. Private sitemaps require cookies configured before fetching or `sitemapHeaders(url)`; localStorage tokens are not automatically HTTP headers. Never run untrusted hook code with secrets or invent a login flow. Link the site's authenticated-discovery documentation when setup help is needed.

For a user-requested crawl capped at 20 pages and depth 2, with a supplied reviewed module at `./crawler.config.mjs`:

```bash
npx --yes --prefer-online automatica11y@latest audit https://example.com/docs/ --crawl --max-pages 20 --max-depth 2 --crawler-config ./crawler.config.mjs
```

Reports and screenshots from authenticated pages may contain sensitive content; avoid copying private data into chat.
