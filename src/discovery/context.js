import { AsyncLocalStorage } from "node:async_hooks";

/**
 * @typedef {object} PagePolicy
 * @property {import("playwright-core").BrowserContextOptions} [contextOptions]
 * @property {(context: import("playwright-core").BrowserContext) => Promise<void>} [setupContext]
 * @property {(page: import("playwright-core").Page) => Promise<void>} [verifyPage]
 * @property {(page: import("playwright-core").Page) => Promise<void>} [guardPage]
 */
/** @type {AsyncLocalStorage<PagePolicy>} */
export const pagePolicy = new AsyncLocalStorage();

/** @param {string} candidate @param {string} root @param {"subtree" | "origin"} scope */
export function inScope(candidate, root, scope) {
  const url = new URL(candidate);
  const base = new URL(root);
  const path = base.pathname.replace(/\/$/, "");
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
    && url.origin === base.origin
    && (scope === "origin" || url.pathname === path || url.pathname.startsWith(path + "/"));
}
