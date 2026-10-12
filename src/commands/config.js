import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

/**
 * @typedef {object} ServerConfig
 * @property {string} command
 * @property {string} url
 * @property {number} [timeoutSeconds]
 * @property {string} [cwd]
 */
/**
 * The YAML file's shape. The option and fail values are any because they come straight from YAML and loadConfig validates them.
 * @typedef {object} Config
 * @property {number} [version]
 * @property {string[]} [targets]
 * @property {Record<string, any>} [options]
 * @property {Record<string, any>} [fail]
 * @property {ServerConfig} [server]
 * @property {{ enabled?: boolean, name?: string, retentionDays?: number }} [artifacts]
 * @property {boolean} [summary]
 */

/** @type {Record<string, string>} */
const OPTION_NAMES = {
  wcag: "wcag", level: "level", tiers: "tiers", engines: "engine",
  archetypes: "archetypes", libA11y: "lib-a11y", mapping: "mapping",
  maxStories: "max-stories", out: "out", generate: "generate",
};
/** @type {Record<string, string>} */
const FAIL_NAMES = { axe: "fail-on-axe", ibm: "fail-on-ibm", mode: "fail-mode", incomplete: "fail-on-incomplete", review: "fail-on-review", checks: "fail-on-checks" };

/**
 * @template T
 * @param {T} value
 * @param {string} label
 * @param {string[]} keys
 * @returns {T}
 */
function object(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} key: ${key}.`);
  return value;
}

/**
 * @param {string | undefined} file
 * @param {string} cwd
 * @returns {Config}
 */
export function loadConfig(file, cwd) {
  const path = resolve(cwd, file || ".automatica11y.yml");
  if (!file && !existsSync(path)) return {};
  const document = parseDocument(readFileSync(path, "utf8"), { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error(`Invalid YAML: ${[...document.errors, ...document.warnings].map((error) => error.message).join("; ")}`);
  /** @type {Config} */
  const config = object(document.toJS({ maxAliasCount: 20 }), "config", ["version", "targets", "options", "fail", "server", "artifacts", "summary"]);
  if (config.version !== 1) throw new Error("config.version must be 1.");
  if (config.targets !== undefined && (!Array.isArray(config.targets) || !config.targets.length || config.targets.some((target) => typeof target !== "string" || !target.trim()))) throw new Error("config.targets must be a nonempty array of strings.");
  if (config.options !== undefined) {
    object(config.options, "options", Object.keys(OPTION_NAMES));
    for (const [key, value] of Object.entries(config.options)) {
      if (["tiers", "engines", "archetypes", "libA11y"].includes(key)) {
        if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string")) throw new Error(`options.${key} must be a nonempty string array.`);
      } else if (key === "generate") {
        if (typeof value !== "boolean") throw new Error("options.generate must be boolean.");
      } else if (key === "maxStories") {
        if (!Number.isInteger(value) || value < 1) throw new Error("options.maxStories must be a positive integer.");
      } else if (typeof value !== "string" || !value.trim()) throw new Error(`options.${key} must be a nonempty string (quote WCAG versions).`);
    }
  }
  if (config.fail !== undefined) {
    object(config.fail, "fail", Object.keys(FAIL_NAMES));
    for (const key of ["incomplete", "review", "checks"]) if (config.fail[key] !== undefined && typeof config.fail[key] !== "boolean") throw new Error(`fail.${key} must be boolean.`);
    if (config.fail.axe !== undefined && config.fail.axe !== null && !["minor", "moderate", "serious", "critical"].includes(config.fail.axe)) throw new Error("Invalid fail.axe threshold.");
    if (config.fail.ibm !== undefined && config.fail.ibm !== null && ![1, 2, 3].includes(config.fail.ibm)) throw new Error("Invalid fail.ibm threshold.");
    if (config.fail.mode !== undefined && !["any", "all"].includes(config.fail.mode)) throw new Error("Invalid fail.mode.");
  }
  if (config.server !== undefined) validateServer(config.server);
  if (config.artifacts !== undefined) {
    object(config.artifacts, "artifacts", ["enabled", "name", "retentionDays"]);
    if (config.artifacts.enabled !== undefined && typeof config.artifacts.enabled !== "boolean") throw new Error("artifacts.enabled must be boolean.");
    if (config.artifacts.name !== undefined && (typeof config.artifacts.name !== "string" || !config.artifacts.name.trim())) throw new Error("artifacts.name must be a nonempty string.");
    if (config.artifacts.retentionDays !== undefined && (!Number.isInteger(config.artifacts.retentionDays) || config.artifacts.retentionDays < 1 || config.artifacts.retentionDays > 90)) throw new Error("artifacts.retentionDays must be an integer from 1 to 90.");
  }
  if (config.summary !== undefined && typeof config.summary !== "boolean") throw new Error("summary must be boolean.");
  return config;
}

/** @param {Config} config */
export function configArgs(config) {
  /** @type {string[]} */
  const args = [];
  for (const [key, value] of Object.entries(config.options ?? {})) {
    if (key === "generate") args.push(value ? "--generate" : "--no-generate");
    else args.push(`--${OPTION_NAMES[key]}`, Array.isArray(value) ? value.join(",") : String(value));
  }
  for (const [key, value] of Object.entries(config.fail ?? {})) args.push(`--${FAIL_NAMES[key]}`, value === null ? "none" : String(value));
  return args;
}

/** @param {ServerConfig} server */
export function validateServer(server) {
  object(server, "server", ["command", "url", "timeoutSeconds", "cwd"]);
  if (typeof server.command !== "string" || !server.command.trim()) throw new Error("server.command must be a nonempty string.");
  const url = new URL(server.url);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("server.url must be an HTTP(S) loopback URL without credentials.");
  if (server.timeoutSeconds !== undefined && (!Number.isInteger(server.timeoutSeconds) || server.timeoutSeconds < 1)) throw new Error("server.timeoutSeconds must be a positive integer.");
  if (server.cwd !== undefined && (typeof server.cwd !== "string" || !server.cwd.trim())) throw new Error("server.cwd must be a nonempty string.");
}