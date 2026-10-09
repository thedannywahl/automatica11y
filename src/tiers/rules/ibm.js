import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readPackageVersion } from "../../env/versions.js";

const require = createRequire(import.meta.url);
let aceSource = null;

/** Read ace.js once. The engine runs inside the page, so we only need its source text. */
function loadAce() {
  aceSource ??= readFileSync(require.resolve("accessibility-checker-engine/ace.js"), "utf8");
  return aceSource;
}

const LEVEL_ORDER = { A: 1, AA: 2 };

export const helpUrl = (ruleId) => `https://able.ibm.com/rules/archives/latest/doc/en-US/${ruleId}.html`;

/**
 * Group raw IBM results into findings, one per rule and kind, with the first few nodes.
 * @param {Array<{ ruleId: string, message: string, value: string[], dom?: string, snippet?: string }>} items
 * @param {Map<string, { wcag: string[], toolkitLevel: number | null }>} ruleInfo
 * @param {(item: { value: string[] }) => string} kindOf
 * @param {number} maxNodes
 */
function group(items, ruleInfo, kindOf, maxNodes, withKind) {
  const groups = new Map();
  for (const item of items) {
    const kind = kindOf(item);
    const key = withKind ? `${item.ruleId}|${kind}` : item.ruleId;
    let entry = groups.get(key);
    if (!entry) {
      const info = ruleInfo.get(item.ruleId);
      entry = {
        ruleId: item.ruleId,
        impact: null,
        toolkitLevel: info?.toolkitLevel ?? null,
        wcag: info?.wcag ?? [],
        ...(withKind ? { kind } : {}),
        help: item.message,
        helpUrl: helpUrl(item.ruleId),
        nodeCount: 0,
        nodes: [],
      };
      groups.set(key, entry);
    }
    entry.nodeCount += 1;
    if (entry.nodes.length < maxNodes) entry.nodes.push({ selector: item.dom ?? "", html: String(item.snippet ?? "").slice(0, 300) });
  }
  return [...groups.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

/**
 * Run the IBM Equal Access engine against the page.
 * The engine's WCAG rulesets cover levels A and AA. Level AAA runs the AA rules and says so.
 * ace.js goes in through page.evaluate, because a strict CSP blocks addScriptTag.
 * @param {import("playwright-core").Page} page
 * @param {{ wcag: string, level: string, maxNodes?: number, scope?: string | string[] | null }} options
 *   `scope` is a CSS selector. Component evidence checks only that element.
 */
export async function runIbm(page, { wcag, level, maxNodes = 5, scope = null }) {
  const ruleset = `WCAG_${wcag.replace(".", "_")}`;
  const maxLevel = LEVEL_ORDER[level] ?? LEVEL_ORDER.AA;
  await page.evaluate(loadAce());
  const scopes = [scope ?? []].flat();
  const raw = await page.evaluate(async ({ id, scopes }) => {
    // @ts-ignore ace.js defines window.ace in the page.
    const checker = new window.ace.Checker();
    const set = checker.rulesets.find((r) => r.id === id);
    if (!set) throw new Error(`The IBM engine has no ruleset ${id}.`);
    const roots = scopes.length ? scopes.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document];
    if (roots.length === 0) throw new Error(`Nothing matches the scope ${scopes.join(", ")}.`);
    const passed = new Set();
    const found = [];
    const seen = new Set();
    for (const root of roots) {
      const report = await checker.check(root, [id]);
      for (const r of report.results) {
        if (r.value[1] === "PASS") passed.add(r.ruleId);
        else {
          const key = `${r.ruleId}|${r.path?.dom}|${r.value.join()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ ruleId: r.ruleId, value: r.value, message: r.message, dom: r.path?.dom, snippet: r.snippet });
        }
      }
    }
    return {
      checkpoints: set.checkpoints.map((cp) => ({ num: cp.num, level: cp.wcagLevel, rules: cp.rules.map((x) => [x.id, x.toolkitLevel]) })),
      found,
      passedRules: [...passed],
    };
  }, { id: ruleset, scopes });

  /** @type {Map<string, { wcag: string[], toolkitLevel: number | null }>} */
  const ruleInfo = new Map();
  for (const checkpoint of raw.checkpoints) {
    if ((LEVEL_ORDER[checkpoint.level] ?? 99) > maxLevel) continue;
    for (const [id, toolkit] of checkpoint.rules) {
      const info = ruleInfo.get(id) ?? { wcag: [], toolkitLevel: null };
      if (!info.wcag.includes(checkpoint.num)) info.wcag.push(checkpoint.num);
      const number = Number(toolkit);
      if (Number.isFinite(number)) info.toolkitLevel = info.toolkitLevel === null ? number : Math.min(info.toolkitLevel, number);
      ruleInfo.set(id, info);
    }
  }

  const inScope = raw.found.filter((item) => ruleInfo.has(item.ruleId));
  const violations = inScope.filter((item) => item.value[0] === "VIOLATION" && item.value[1] === "FAIL");
  const review = inScope.filter((item) => !(item.value[0] === "VIOLATION" && item.value[1] === "FAIL"));
  const reviewKind = (item) => (item.value[1] === "MANUAL" ? "manual" : item.value[1] === "POTENTIAL" ? "potential" : "recommendation");
  const notes = level === "AAA" ? ["IBM's WCAG rulesets cover levels A and AA. This run used the AA rules."] : [];
  return {
    status: /** @type {const} */ ("ran"),
    version: readPackageVersion("accessibility-checker-engine"),
    config: { ruleset, levels: level === "A" ? ["A"] : ["A", "AA"], ...(scope ? { scope } : {}) },
    violations: group(violations, ruleInfo, () => "violation", maxNodes, false),
    incomplete: group(review, ruleInfo, reviewKind, maxNodes, true),
    passesCount: raw.passedRules.filter((id) => ruleInfo.has(id)).length,
    notes,
  };
}
