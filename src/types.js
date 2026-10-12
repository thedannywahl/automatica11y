// Shared JSDoc types. This module has no runtime code. Import with import("../types.js").Name.

/** @typedef {ReturnType<typeof import("./schema.js").parsePlan>} Plan */
/** @typedef {Plan["targets"][number]} PlanTarget */
/** @typedef {Plan["options"]} PlanOptions */
/** @typedef {NonNullable<PlanTarget["mapping"]>[string]} MappingEntry */
/** @typedef {NonNullable<Plan["options"]["fail"]>} FailConfig */

/** @typedef {ReturnType<typeof import("./schema.js").parseResults>} Results */
/** @typedef {Results["targets"][number]} TargetResult */
/** @typedef {TargetResult["archetypes"][string]} ArchetypeResult */
/** @typedef {ArchetypeResult["configs"][number]} ConfigResult */
/** @typedef {ConfigResult["tiers"][string]} TierResult */
/** @typedef {NonNullable<TierResult["engines"]>[string]} EngineResult */
/** @typedef {NonNullable<EngineResult["violations"]>[number]} Finding */
/** @typedef {TargetResult["summary"]} TargetSummary */
/** @typedef {TargetSummary["engines"][string]} EngineSummary */
/** @typedef {NonNullable<TierResult["checks"]>[number]} CheckResult */
/** @typedef {NonNullable<Results["failCheck"]>} FailCheck */

/** @typedef {import("playwright-core").Browser} Browser */
/** @typedef {import("playwright-core").BrowserContext} BrowserContext */
/** @typedef {import("playwright-core").Page} Page */
/** @typedef {import("playwright-core").Frame} Frame */
/** @typedef {import("playwright-core").Locator} Locator */

/** @typedef {"axe" | "ibm"} EngineName */
/** @typedef {"rules" | "interactions" | "computed" | "conditions" | "vsr"} TierName */

/** @typedef {{ id: string, summary: string, source: string, used: string[] }} Candidate */
/** @typedef {{ name: string, type: string, parts?: string[] }} ExportSummary */
/** @typedef {{ attributes: string[], members: string[], slots: string[] }} WcFacts */

/** @typedef {Omit<CheckResult, "name" | "criteria">} CheckOutcome */
/** @typedef {ReturnType<Window["__a11y"]["snapshot"]>} PageSnapshot */
/** @typedef {ReturnType<Window["__a11y"]["items"]>[number]} PageItem */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */
/**
 * @typedef {object} CheckContext What a check can do, bound to one fresh page.
 * @property {Page} page
 * @property {Locator} trigger
 * @property {() => Promise<PageSnapshot>} snap
 * @property {(selector: string) => Promise<PageItem[]>} items
 * @property {(ms?: number) => Promise<void>} settle
 * @property {(key: string) => Promise<void>} press
 * @property {() => Promise<void>} focus
 * @property {(predicate: (s: PageSnapshot) => boolean, ms?: number) => Promise<PageSnapshot | null>} waitFor
 * @property {(max?: number) => Promise<number | null>} tabToTrigger
 * @property {() => Promise<boolean>} openCombo
 * @property {(box: Box, margin?: number) => Box} clipAround
 * @property {(options: NonNullable<Parameters<typeof import("./harness/url.js").openPage>[2]>) => Promise<CheckContext>} [variant]
 */
/** @typedef {{ name: string, criteria: string[], run: (ctx: CheckContext) => Promise<CheckOutcome> }} Check */

export {};
