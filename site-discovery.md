---
url: /site-discovery.md
---
# Auditing a site

Site discovery is opt-in. A normal URL audit still checks one page; a discovered site's pages are not a comparison.

```bash
# Rendered links under /docs/
npx automatica11y audit https://example.com/docs/ --crawl

# Only URLs listed in a sitemap, filtered to /docs/
npx automatica11y audit https://example.com/docs/ --sitemap https://example.com/sitemap.xml

# Sitemap seeds plus rendered links
npx automatica11y ci https://example.com/docs/ --sitemap https://example.com/sitemap.xml --crawl
```

Use one HTTP(S) root with `audit` or `ci`. `--sitemap` is repeatable. Sitemap sources must use the root's exact origin. `compare`, npm packages, Storybook discovery, local-file crawling and multiple discovery roots are not supported.

## Limits and coverage

| Option | Default | Meaning |
| --- | --- | --- |
| `--max-pages` | 100 | Crawlee handled-request limit; retries are additional attempts |
| `--max-depth` | 5 | Native link depth; seeds are depth 0 |
| `--crawl-delay` | 1 | Same-domain delay in seconds, not a global subresource rate limit |
| `--discovery-scope` | `subtree` | Exact origin and root path subtree; `origin` permits other paths |
| `--ignore-robots` | off | Explicit robots.txt override |
| `--crawler-config` | none | Trusted local ESM hook module |

The crawler runs sequentially and uses Crawlee's queue, deduplication, retries, robots handling and statistics. A request can run up to three times. Native request totals do not count every browser subresource or the additional navigations made by condition checks. Each discovered page is reopened in a separate authenticated audit context: Crawlee's convenience page context does not support every auxiliary page operation used by the rule engines.

Discovery admits at most 10,000 queued URLs. Sitemap loading limits are 100 documents, nesting depth 5, 10,000 entries, 5 MiB per document after decompression, five redirects and a two-minute loading window. Limit events and sitemap errors are coverage gaps, not passes.

Rendered ordinary links are followed; forms, arbitrary controls and hash-router states are not explored. Exhausting the queue does not prove every site page was found. Site reports preserve native crawl metrics separately from individual page and engine outcomes. Axe and IBM findings remain separate.

CI defaults to failing on incomplete coverage, including robots exclusions of intended pages and reached caps. `--fail-on-incomplete false` changes the gate, not the recorded coverage. No page audit results returns exit 4.

## Trusted authentication hooks

Pass a local module with `--crawler-config ./crawler.config.mjs`. It executes with your process privileges: review it as trusted code. Never run untrusted PR hook code with secrets.

```js
export default {
  contextOptions: {
    storageState: process.env.A11Y_STORAGE_STATE_PATH,
  },
  async setupContext(context) {
    // Optional: configure each fresh crawler and condition-check context.
  },
  async verifyPage(page) {
    if (await page.locator('[data-login-form]').count()) {
      throw new Error("Authentication required");
    }
  },
};
```

`verifyPage(page)` is mandatory when a module is supplied. It must assert the application's authenticated state. HTTP 401/403 and a failed verifier cause bounded retries; an application returning its login page with HTTP 200 cannot be recognized automatically.

Supported native pass-through arrays are `preNavigationHooks`, `postNavigationHooks`, and these hooks within `browserPoolOptions`: `preLaunchHooks`, `postLaunchHooks`, `prePageCreateHooks`, `postPageCreateHooks`, `prePageCloseHooks`, `postPageCloseHooks`. Their callback signatures are Crawlee's. The adapter owns queues, request handlers, limits and internal guards.

Use `contextOptions` for Playwright storage state, HTTP credentials or headers. Use `setupContext(context)` and `verifyPage(page)` for shared initialization and validation across the crawler and additional accessibility-check contexts. Native navigation hooks execute for crawler requests only; secondary checks do not fabricate Crawlee request/session objects. Cookie/localStorage state is captured from the authenticated crawler page for each page's checks; sessionStorage or custom initialization must be reapplied by `setupContext`.

For interactive login, a trusted pre-navigation hook can use the page to sign in before continuing to the requested page. Repeated hook executions may refresh expired credentials, but must not contain unbounded login loops. Set `loginOrigins` to exact additional origins such as `["https://login.example.com"]` when an identity provider is required. Those origins are not crawled or audited. The page must return to the audited scope before verification. Authorization and configured extra headers are stripped from requests leaving the site origin, including redirect hops. HTTP credentials without an explicit `origin` are restricted to the site's origin.

Private sitemap fetching uses cookies installed by `contextOptions`/`setupContext`, HTTP credentials, configured headers, and optional `async sitemapHeaders(url)`. Browser navigation hooks are not called to fetch XML. For private sitemaps, establish cookies in `setupContext` or supply `sitemapHeaders`; localStorage tokens do not automatically become Authorization headers.

```js
export default {
  contextOptions: {
    extraHTTPHeaders: { Authorization: `Bearer ${process.env.A11Y_TOKEN}` },
  },
  async verifyPage(page) {
    if (!(await page.locator("[data-authenticated]").count())) {
      throw new Error("Expected authenticated application");
    }
  },
};
```

Do not put credentials in command-line URLs, YAML, checked-in modules, or saved plans. Hooks should read environment secrets or local files. Paths to modules may appear in plans, but returned configuration, storage state and credentials are not serialized. Hook code controls its own logging: never log secrets. Authenticated pages' findings can contain sensitive content; screenshots are opt-in. Restrict report artifact access and retention accordingly.

## YAML and GitHub Action

```yaml
version: 1
targets:
  - https://example.com/docs/
options:
  crawl: true
  sitemaps:
    - https://example.com/sitemap.xml
  maxPages: 50
  maxDepth: 3
  crawlDelay: 1
  discoveryScope: subtree
  crawlerConfig: ./crawler.config.mjs
```

The Action accepts `crawl`, `sitemaps` (one URL per line), `max-pages`, `max-depth`, `crawl-delay`, `discovery-scope`, `ignore-robots`, and `crawler-config`. Provide hook secrets through the step's environment, not action input values. Existing `server-command`/`server-url` inputs support explicit localhost testing.

`--plan` records discovery intent without loading the hook module, launching a browser or claiming a discovered inventory. Running a saved plan rediscovers the site.
