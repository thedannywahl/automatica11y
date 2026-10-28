import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { VIEWPORT } from "../harness/browser.js";
import { findBrowser } from "../env/browser.js";
import { recordClosedShadowRoots, recordCustomElements } from "../harness/shadow.js";
import { failedTarget } from "../run/summary.js";
import { inScope, pagePolicy } from "./context.js";
import { loadSitemaps } from "./sitemap.js";
import { openPage } from "../harness/url.js";

/**
 * Trusted executable configuration; never serialize returned objects or sessions.
 * @typedef {object} CrawlerHooks
 * @property {import("@crawlee/playwright").PlaywrightCrawlerOptions["preNavigationHooks"]} [preNavigationHooks]
 * @property {import("@crawlee/playwright").PlaywrightCrawlerOptions["postNavigationHooks"]} [postNavigationHooks]
 * @property {import("@crawlee/playwright").PlaywrightCrawlerOptions["browserPoolOptions"]} [browserPoolOptions]
 * @property {(context: import("playwright-core").BrowserContext) => Promise<void>} [setupContext]
 * @property {(page: import("playwright-core").Page) => Promise<void>} [verifyPage]
 * @property {import("playwright-core").BrowserContextOptions} [contextOptions]
 * @property {string[]} [loginOrigins]
 * @property {(url: string) => Promise<Record<string, string>>} [sitemapHeaders]
 */

/** @param {string | null} file @returns {Promise<CrawlerHooks>} */
export async function loadHooks(file) {
  if (!file) return {};
  const hooks = (await import(pathToFileURL(file).href)).default;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) throw new Error("Crawler config must default-export a trusted hook configuration.");
  const allowed = ["preNavigationHooks", "postNavigationHooks", "browserPoolOptions", "setupContext", "verifyPage", "contextOptions", "loginOrigins", "sitemapHeaders"];
  for (const key of Object.keys(hooks)) if (!allowed.includes(key)) throw new Error(`Unsupported crawler config key: ${key}.`);
  if (typeof hooks.verifyPage !== "function") throw new Error("Crawler config requires verifyPage(page) to reject expired/login pages.");
  for (const key of ["setupContext", "sitemapHeaders"]) if (hooks[key] !== undefined && typeof hooks[key] !== "function") throw new Error(`${key} must be a function.`);
  for (const key of ["preNavigationHooks", "postNavigationHooks"]) if (hooks[key] !== undefined && (!Array.isArray(hooks[key]) || hooks[key].some((/** @type {unknown} */ hook) => typeof hook !== "function"))) throw new Error(`${key} must be an array of functions.`);
  const poolKeys = ["preLaunchHooks", "postLaunchHooks", "prePageCreateHooks", "postPageCreateHooks", "prePageCloseHooks", "postPageCloseHooks"];
  for (const [key, value] of Object.entries(hooks.browserPoolOptions ?? {})) {
    if (!poolKeys.includes(key) || !Array.isArray(value) || value.some((hook) => typeof hook !== "function")) throw new Error(`Unsupported Browser Pool hook: ${key}.`);
  }
  if (hooks.loginOrigins !== undefined && !Array.isArray(hooks.loginOrigins)) throw new Error("loginOrigins must be an array.");
  for (const origin of hooks.loginOrigins ?? []) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error("loginOrigins must contain exact HTTP(S) origins without credentials.");
  }
  return hooks;
}

/**
 * @param {import("../types.js").Plan} plan
 * @param {import("../commands/common.js").Io} io
 * @param {typeof import("../run/run-plan.js").auditOpenedPage} audit
 */
export async function runSite(plan, io, audit) {
  const { PlaywrightCrawler, Configuration, RequestQueue, Log, LogLevel } = await import("@crawlee/playwright");
  const { chromium } = await import("playwright-core");
  const options = plan.options.discovery;
  const site = plan.targets[0];
  const root = site.resolved.url;
  const hooks = await loadHooks(options.config);
  const contextOptions = () => {
    const credentials = hooks.contextOptions?.httpCredentials;
    return {
      ...hooks.contextOptions,
      httpCredentials: Array.isArray(credentials)
        ? credentials.map((entry) => ({ ...entry, origin: entry.origin ?? new URL(root).origin }))
        : credentials ? { ...credentials, origin: credentials.origin ?? new URL(root).origin } : undefined,
    };
  };
  const { browser: found } = await findBrowser({ env: io.env, platform: io.platform });
  if (!found) throw new Error("No browser available for site discovery.");
  const configuration = new Configuration({ persistStorage: false, purgeOnStart: false, logLevel: 0 });
  const queue = await RequestQueue.open(`automatica11y-${randomUUID()}`, { config: configuration });
  /** @type {Map<string, import("../types.js").TargetResult>} */
  const results = new Map();
  /** @type {{ url: string, reason: string }[]} */
  const events = [];
  const gaps = new Set();
  /** @type {WeakMap<import("playwright-core").Page, unknown>} */
  const isolationErrors = new WeakMap();
  /** @param {string} url @param {string} reason */
  const event = (url, reason) => {
    if (events.length < 10_000) events.push({ url, reason });
    else gaps.add("Discovery event limit reached; event details truncated.");
  };
  /** @param {import("playwright-core").Page} page */
  const guardPage = async (page) => {
    const session = await page.context().newCDPSession(page);
    const { frameTree } = await session.send("Page.getFrameTree");
    // Playwright routes only the first request in a redirect chain; CDP pauses every hop.
    session.on("Fetch.requestPaused", (paused) => {
      void (async () => {
        const { requestId, request, resourceType, frameId } = paused;
        const origin = new URL(request.url).origin;
        const topNavigation = resourceType === "Document" && frameId === frameTree.frame.id;
        if (topNavigation && !inScope(request.url, root, options.scope) && !hooks.loginOrigins?.includes(origin)) {
          await session.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
          return;
        }
        const sensitive = new Set(["authorization", "proxy-authorization", ...Object.keys(hooks.contextOptions?.extraHTTPHeaders ?? {}).map((name) => name.toLowerCase())]);
        const headers = Object.entries(request.headers)
          .filter(([name]) => origin === new URL(root).origin || !sensitive.has(name.toLowerCase()))
          .map(([name, value]) => ({ name, value: String(value) }));
        await session.send("Fetch.continueRequest", { requestId, headers });
      })().catch((error) => {
        if (!page.isClosed()) isolationErrors.set(page, error);
      });
    });
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  };
  /** @param {import("playwright-core").Page} page */
  const verify = async (page) => {
    if (isolationErrors.has(page)) throw new Error("Request credential isolation failed; refusing to audit this page.");
    if (!inScope(page.url(), root, options.scope)) throw new Error("Navigation ended outside the site scope (possibly a login redirect).");
    try { await hooks.verifyPage?.(page); } catch {
      const error = new Error("Authentication verification failed; refusing to audit a login/expired page.");
      error.name = "AuthenticationError";
      throw error;
    }
  };
  /** @param {string} url */
  const add = async (url) => {
    if (!inScope(url, root, options.scope)) { event(url, "outside-scope"); return; }
    if ((await queue.getInfo()).totalRequestCount >= 10_000) {
      gaps.add("Native queue admission limit reached; remaining inventory is unknown.");
      return;
    }
    await queue.addRequest({ url });
  };
  const pool = hooks.browserPoolOptions ?? {};
  const crawler = new PlaywrightCrawler({
    log: new Log({ level: LogLevel.OFF }),
    requestQueue: queue,
    maxConcurrency: 1,
    maxRequestsPerCrawl: options.maxPages,
    maxCrawlDepth: options.maxDepth,
    sameDomainDelaySecs: options.delay,
    maxRequestRetries: 2,
    maxSessionRotations: 0,
    useSessionPool: false,
    respectRobotsTxtFile: options.ignoreRobots ? false : { userAgent: "automatica11y" },
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 600,
    launchContext: {
      launcher: chromium,
      useIncognitoPages: true,
      launchOptions: {
        executablePath: found.path,
        args: io.env.CI ? ["--no-sandbox"] : [],
        // Crawlee injects a shared fallback proxy whose upstream tunnels can outlive the browser.
        proxy: { bypass: "*" },
      },
    },
    browserPoolOptions: {
      ...pool,
      useFingerprints: false,
      prePageCreateHooks: [
        ...pool.prePageCreateHooks ?? [],
        (_id, _controller, pageOptions) => { Object.assign(pageOptions, { ...contextOptions(), viewport: VIEWPORT, deviceScaleFactor: 1 }); },
      ],
      postPageCreateHooks: [
        ...pool.postPageCreateHooks ?? [],
        async (page) => {
          await guardPage(page);
          await page.context().addInitScript(recordClosedShadowRoots);
          await page.context().addInitScript(recordCustomElements);
          await hooks.setupContext?.(page.context());
        },
      ],
    },
    preNavigationHooks: hooks.preNavigationHooks,
    postNavigationHooks: [
      ...hooks.postNavigationHooks ?? [],
      async ({ page, response }) => {
        if (response && response.status() >= 400) throw new Error(`Page responded with HTTP ${response.status()}.`);
        await verify(page);
      },
    ],
    onSkippedRequest: ({ url, reason }) => {
      event(url, reason);
      if (["robotsTxt", "limit", "enqueueLimit", "depth"].includes(reason)) gaps.add(`Crawlee skipped intended coverage: ${reason}.`);
    },
    failedRequestHandler: async ({ request }, error) => {
      const id = `${site.id}-${createHash("sha256").update(request.uniqueKey).digest("hex").slice(0, 16)}`;
      const authFailed = error.name === "AuthenticationError";
      results.set(request.uniqueKey, { ...failedTarget(id, authFailed ? "Authentication verification failed after bounded retries; the intended page was not audited." : "Crawlee exhausted its bounded request/login retries; the intended page was not audited."), page: { siteId: site.id, url: request.url, finalUrl: request.loadedUrl ?? request.url, key: request.uniqueKey } });
      event(request.url, authFailed ? "authentication-failed" : "request-failed");
      gaps.add("One or more crawl requests failed after bounded retries.");
    },
    requestHandler: async ({ page, request, browserController, enqueueLinks, response }) => {
      const contentType = response?.headers()["content-type"] ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("The discovered URL is not an HTML page.");
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch((/** @type {Error} */ error) => {
        if (error.name !== "TimeoutError") throw error;
        event(request.url, "network-idle-timeout: audited rendered state");
      });
      const id = `${site.id}-${createHash("sha256").update(request.uniqueKey).digest("hex").slice(0, 16)}`;
      const target = { ...site, id, kind: /** @type {const} */ ("url"), label: request.url, resolved: { url: request.url } };
      const policy = {
        contextOptions: { ...contextOptions(), storageState: await page.context().storageState() },
        setupContext: hooks.setupContext,
        verifyPage: verify,
        guardPage,
      };
      const result = await pagePolicy.run(policy, async () => {
        const opened = await openPage(browserController.browser, page.url());
        try {
          return await audit(browserController.browser, opened.page, opened.page.url(), target, plan, opened.warnings, resolve(io.cwd, plan.options.out));
        } finally { await opened.close(); }
      });
      results.set(request.uniqueKey, { ...result, page: { siteId: site.id, url: request.url, finalUrl: page.url(), key: request.uniqueKey } });
      if (options.crawl) {
        if ((await queue.getInfo()).totalRequestCount >= 10_000) { gaps.add("Native queue admission limit reached."); return; }
        await enqueueLinks({
          strategy: "same-origin",
          limit: Math.max(1, 10_000 - (await queue.getInfo()).totalRequestCount),
          transformRequestFunction: (candidate) => {
            if (!inScope(candidate.url, root, options.scope)) { event(candidate.url, "outside-scope"); return false; }
            if (/\.(?:png|jpe?g|gif|webp|svg|pdf|zip|css|js|woff2?)(?:[?#]|$)/i.test(candidate.url)) { event(candidate.url, "non-page-asset"); return false; }
            return candidate;
          },
        });
      }
    },
  }, configuration);
  /** @type {import("playwright-core").Browser | undefined} */
  let authBrowser;
  try {
    if (options.sitemaps.length) {
      authBrowser = await chromium.launch({ executablePath: found.path });
      const context = await authBrowser.newContext(contextOptions());
      try {
        await hooks.setupContext?.(context);
        await loadSitemaps(options.sitemaps, {
          root, add, event, gap: (reason) => gaps.add(reason),
          headers: async (url) => {
            const headers = { ...hooks.contextOptions?.extraHTTPHeaders, ...await hooks.sitemapHeaders?.(url) };
            const cookies = await context.cookies(url);
            if (cookies.length) headers.Cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
            const credentialOptions = hooks.contextOptions?.httpCredentials;
            for (const credentials of Array.isArray(credentialOptions) ? credentialOptions : credentialOptions ? [credentialOptions] : []) {
              if (!credentials.origin || credentials.origin === new URL(url).origin) headers.Authorization ??= `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
            }
            return headers;
          },
        });
      } finally { await context.close(); }
    }
    if (options.crawl) await add(root);
    const statistics = await crawler.run();
    const info = await queue.getInfo();
    if (info.pendingRequestCount) gaps.add("Crawlee stopped with pending queued requests.");
    if (!results.size) gaps.add("Discovery produced no page audit results.");
    const nativeStatistics = JSON.parse(JSON.stringify(statistics));
    return {
      targets: [...results.values()],
      discovery: { root, scope: options.scope, statistics: nativeStatistics, queue: { totalRequestCount: info.totalRequestCount, handledRequestCount: info.handledRequestCount, pendingRequestCount: info.pendingRequestCount }, events, gaps: [...gaps] },
    };
  } finally {
    await authBrowser?.close();
    await crawler.teardown();
    await queue.drop();
    await configuration.getEventManager().close();
    await configuration.getStorageClient().teardown?.();
  }
}
