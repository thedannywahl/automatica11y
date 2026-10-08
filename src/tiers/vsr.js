import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readPackageVersion } from "../env/versions.js";

const require = createRequire(import.meta.url);
let injected = null;

/**
 * The browser build of the virtual screen reader is one ES module. Turn its `export` line into a global,
 * so `page.evaluate` can run it. `evaluate` isn't subject to the page's CSP, and a script tag would be.
 */
function loadSource() {
  if (injected) return injected;
  const source = readFileSync(require.resolve("@guidepup/virtual-screen-reader/browser.js"), "utf8").replace(/\/\/# sourceMappingURL=.*$/m, "");
  const exported = /export\s*\{([^}]*)\};?/.exec(source);
  if (!exported) throw new Error("The virtual screen reader's browser build has an unexpected shape.");
  const names = exported[1].split(",").map((part) => {
    const [local, alias] = part.trim().split(/\s+as\s+/);
    return `${alias ?? local}:${local}`;
  });
  injected = `(()=>{${source.replace(/export\s*\{[^}]*\};?/, "")}\nwindow.__vsr={${names.join(",")}};})()`;
  return injected;
}

/** Roles that should come with a name. A phrase that is only the role means the control has none. */
export const UNNAMED_ROLES = new Set([
  "button", "link", "image", "textbox", "searchbox", "checkbox", "radio", "switch", "slider", "spinbutton",
  "combobox", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "dialog", "alertdialog", "listbox", "menu",
]);
const GENERIC_ROLES = new Set(["generic", "none", "presentation"]);

/**
 * Point at phrases a person should look at. This doesn't judge the log. It marks two patterns and nothing else:
 * a control announced as only its role, and a role announced as generic.
 * @param {string[]} phrases
 */
export function flagPhrases(phrases) {
  /** @type {Array<{ type: string, phrase: string, index: number }>} */
  const flags = [];
  phrases.forEach((phrase, index) => {
    const text = phrase.trim().toLowerCase();
    if (UNNAMED_ROLES.has(text)) flags.push({ type: "unnamed-control", phrase, index });
    else if (GENERIC_ROLES.has(text)) flags.push({ type: "generic-role", phrase, index });
  });
  return flags;
}

/**
 * Walk the page with the virtual screen reader and record what it would announce.
 * Every result is simulated. It's not a real screen reader's output.
 * Open shadow roots inside the scope aren't read, and the result says so.
 * @param {import("playwright-core").Page} page
 * @param {{ scope?: string, state?: string | null, maxSteps?: number }} [options]
 */
export async function runVsr(page, { scope = "body", state = null, maxSteps = 150 } = {}) {
  await page.evaluate(loadSource());
  const hosts = await page.evaluate(async (scope) => {
    const container = document.querySelector(scope);
    if (!container) throw new Error(`Nothing matches the scope ${scope}.`);
    /** Hosts of open shadow roots inside the container, with counts. */
    const found = {};
    const visit = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          found[el.localName] = (found[el.localName] ?? 0) + 1;
          visit(el.shadowRoot);
        }
      }
    };
    visit(container);
    await window.__vsr.virtual.start({ container });
    return found;
  }, scope);
  let phrases = [];
  let reachedEnd = false;
  try {
    while (phrases.length < maxSteps + 1 && !reachedEnd) {
      const chunk = await page.evaluate(async (steps) => {
        const virtual = window.__vsr.virtual;
        for (let i = 0; i < steps; i += 1) {
          if ((await virtual.lastSpokenPhrase()) === "end of document") break;
          await virtual.next();
        }
        return { log: await virtual.spokenPhraseLog(), ended: (await virtual.lastSpokenPhrase()) === "end of document" };
      }, 10);
      phrases = chunk.log;
      // Inside a container that isn't the whole document, the reader wraps around instead of ending.
      const period = repeatLength(phrases);
      if (chunk.ended) reachedEnd = true;
      else if (period) {
        phrases = phrases.slice(0, period);
        reachedEnd = true;
      }
    }
  } finally {
    await page.evaluate(() => window.__vsr.virtual.stop());
  }
  phrases = phrases.slice(0, maxSteps + 1);
  const notTestable = Object.entries(hosts).map(([tag, n]) => `open shadow root in <${tag}> (${n}): the virtual screen reader doesn't read inside it`);
  return {
    status: /** @type {const} */ ("ran"),
    simulated: true,
    version: readPackageVersion("@guidepup/virtual-screen-reader"),
    log: [{ state, announcements: phrases, reachedEnd, truncated: !reachedEnd }],
    flags: flagPhrases(phrases).map((flag) => ({ ...flag, state })),
    notTestable,
    notes: reachedEnd ? [] : [`The walk stopped after ${maxSteps} steps, before it came back around to the start.`],
  };
}

/**
 * When a walk wraps around, the log repeats. Returns how much of the log is the first full pass, or 0 if it hasn't repeated yet.
 * The first pass can start with a stray phrase (a container announced twice), so the repeating part may begin a step or two in.
 * A pass counts only after it has run a full time and started again, so a long document isn't cut short.
 * @param {string[]} log
 */
export function repeatLength(log) {
  for (let offset = 0; offset <= 2; offset += 1) {
    for (let period = 1; offset + period * 2 + 1 <= log.length; period += 1) {
      let same = true;
      for (let i = offset; i + period < log.length; i += 1) {
        if (log[i] !== log[i + period]) {
          same = false;
          break;
        }
      }
      if (same) return offset + period;
    }
  }
  return 0;
}

/** What the tier reports when it can't run. */
export const failedVsr = (error) => ({ status: /** @type {const} */ ("failed"), simulated: true, reason: (error instanceof Error ? error.message : String(error)).split("\n")[0] });
