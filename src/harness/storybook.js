import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Name patterns that suggest an archetype. They read the story title, name, and tags. */
export const ARCHETYPE_PATTERNS = {
  button: /\bbuttons?\b/i,
  link: /\blinks?\b|\banchors?\b/i,
  dialog: /\bdialogs?\b|\bmodals?\b|\bdrawers?\b|\balert ?dialogs?\b/i,
  menu: /\bmenus?\b|\bdropdown ?menus?\b/i,
  tabs: /\btabs?\b|\btab ?list\b/i,
  combobox: /\bcombo ?box(es)?\b|\bautocomplete\b|\btypeahead\b|\bselect\b/i,
  "form-field": /\binputs?\b|\btext ?(field|area|box)\b|\bform\b|\bcheckbox(es)?\b|\bradio\b|\bswitch\b|\bfield\b/i,
  accordion: /\baccordions?\b|\bcollaps(e|ible)\b|\bdisclosure\b/i,
  tooltip: /\btooltips?\b|\bpopovers?\b/i,
  chart: /\bcharts?\b|\bgraphs?\b|\bplots?\b/i,
};

/**
 * Pull the stories out of a Storybook index. Handles `index.json` (`entries`, with docs pages) and the older `stories.json`.
 * @param {any} index
 * @returns {Array<{ id: string, title: string, name: string, tags: string[] }>}
 */
export function listStories(index) {
  const table = index.entries ?? index.stories ?? {};
  return Object.values(table)
    .filter((entry) => entry && typeof entry === "object" && (entry.type === undefined || entry.type === "story"))
    .map((entry) => ({
      id: String(entry.id),
      title: String(entry.title ?? entry.kind ?? ""),
      name: String(entry.name ?? entry.story ?? ""),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The archetypes a story's title, name, and tags suggest. */
export function matchArchetypes(story) {
  const text = `${story.title} ${story.name} ${story.tags.join(" ")}`;
  return Object.entries(ARCHETYPE_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([archetype]) => archetype);
}

/**
 * Choose which stories to audit. With `archetypes`, keep only stories that match one. Then cap the count.
 * The cap spreads over components, taking one story per title in turn, so one big component can't use up the whole budget.
 * The order is stable, so two runs pick the same stories.
 * @param {ReturnType<typeof listStories>} stories
 * @param {{ archetypes?: string[] | null, max: number }} options
 */
export function selectStories(stories, { archetypes = null, max }) {
  /** Every archetype each story suggests. The comparison matrix uses this even when no filter is set. */
  /** @type {Record<string, string[]>} */
  const all = {};
  for (const story of stories) for (const a of matchArchetypes(story)) (all[a] ??= []).push(story.id);
  const filtered = Boolean(archetypes?.length);
  let pool = stories;
  /** @type {Record<string, string[]>} */
  let matchedByArchetype = all;
  if (filtered) {
    matchedByArchetype = {};
    pool = stories.filter((story) => {
      const hits = matchArchetypes(story).filter((a) => archetypes.includes(a));
      for (const a of hits) (matchedByArchetype[a] ??= []).push(story.id);
      return hits.length > 0;
    });
  }
  const byTitle = new Map();
  for (const story of pool) byTitle.set(story.title, [...(byTitle.get(story.title) ?? []), story]);
  const titles = [...byTitle.keys()].sort();
  const selected = [];
  for (let round = 0; selected.length < Math.min(max, pool.length); round += 1) {
    for (const title of titles) {
      const story = byTitle.get(title)[round];
      if (story && selected.length < max) selected.push(story);
    }
  }
  selected.sort((a, b) => a.id.localeCompare(b.id));
  return { selected, total: stories.length, matched: pool.length, truncated: pool.length > selected.length, matchedByArchetype, filtered };
}

/** The URL that renders one story on its own. `base` must end with a slash. */
export function storyUrl(base, id) {
  return `${base}iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;
}

/**
 * Read a Storybook's index from disk or over HTTP.
 * @param {{ path?: string | null, url?: string | null, index: string }} resolved
 * @param {Function} [doFetch]
 */
export async function readIndex(resolved, doFetch = globalThis.fetch) {
  if (resolved.path) return JSON.parse(readFileSync(join(resolved.path, resolved.index), "utf8"));
  const response = await doFetch(new URL(resolved.index, /** @type {string} */ (resolved.url)), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`The Storybook index responded with HTTP ${response.status}.`);
  return response.json();
}

/**
 * Wait until Storybook says a story rendered, or failed. Storybook marks `body` with a class for each outcome.
 * @param {import("playwright-core").Page} page
 */
export async function waitForStory(page, timeout = 20_000) {
  await page.waitForFunction(
    () => ["sb-show-main", "sb-show-errordisplay", "sb-show-nopreview"].some((name) => document.body.classList.contains(name)),
    undefined,
    { timeout },
  );
  const outcome = await page.evaluate(() => ({
    error: document.body.classList.contains("sb-show-errordisplay"),
    missing: document.body.classList.contains("sb-show-nopreview"),
    detail: document.querySelector(".sb-errordisplay_main, #error-message")?.textContent?.trim().slice(0, 200) ?? "",
  }));
  if (outcome.error) throw new Error(`The story threw an error${outcome.detail ? `: ${outcome.detail}` : "."}`);
  if (outcome.missing) throw new Error("Storybook couldn't find this story.");
}
