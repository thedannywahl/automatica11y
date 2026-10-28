#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isScalar, parseDocument } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} source @param {string} version */
export function updateRunnerSkillVersion(source, version) {
  const [major, minor] = version.split(".");
  const series = major === "0" ? `${major}.${minor}.x` : `${major}.x`;
  const prefix = major === "0" ? `${major}.${minor}` : major;
  const updated = source
    .replace(/(This skill works with automatica11y \*\*)\d+(?:\.\d+)?\.x(\*\*)/, `$1${series}$2`)
    .replace(/(doesn't start with `)\d+(?:\.\d+)?\./, `$1${prefix}.`)
    .replace(/series this copy expects \(`{1,2}\d+(?:\.\d+)?\.x`{1,2}\)/, `series this copy expects (\`${series}\`)`);
  if (!updated.includes(`**${series}**`) || !updated.includes(`doesn't start with \`${prefix}.`) || !updated.includes(`series this copy expects (\`${series}\`)`)) {
    throw new Error(`Couldn't update the runner skill's version instructions to ${series}.`);
  }
  return updated;
}

/** @param {string} source @param {string} version */
export function updateEvalVersions(source, version) {
  const [major, minor] = version.split(".");
  const series = major === "0" ? `${major}.${minor}.x` : `${major}.x`;
  const prefix = major === "0" ? `${major}.${minor}` : major;
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error(`Couldn't parse eval YAML: ${doc.errors[0].message}`);
  const definition = doc.toJS();
  /** @type {{ start: number, end: number, replacement: string }[]} */
  const edits = [];
  /** @param {(string | number)[]} path @param {string} value */
  const editScalar = (path, value) => {
    const node = doc.getIn(path, true);
    if (!isScalar(node) || !node.range) throw new Error(`Couldn't update eval value at ${path.join(".")}.`);
    edits.push({ start: node.range[0], end: node.range[1], replacement: JSON.stringify(value) });
  };
  /** @param {unknown} value @param {(string | number)[]} path */
  const visit = (value, path = []) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    const record = /** @type {Record<string, unknown>} */ (value);
    if (definition.id !== "runner-preflight-version-mismatch"
      && Array.isArray(record.args)
      && record.args.at(-1) === "--version"
      && record.args.includes("automatica11y@latest")
      && typeof record.stdout === "string"
      && /^\d+\.\d+\.\d+\n$/.test(record.stdout)
      && record.stdout !== `${version}\n`) {
      editScalar([...path, "stdout"], `${version}\n`);
    }
    for (const [key, child] of Object.entries(record)) visit(child, [...path, key]);
  };
  visit(definition);

  if (definition.id === "runner-preflight-version-error") {
    const graderIndex = definition.graders?.findIndex((/** @type {{ name?: string }} */ grader) => grader.name === "includes-error-text");
    if (graderIndex >= 0) {
      const contains = definition.graders[graderIndex].config?.contains ?? [];
      contains.forEach((/** @type {string} */ item, /** @type {number} */ index) => {
        if (/^\d+\.\d+\.x$/.test(item) && item !== series) editScalar(["graders", graderIndex, "config", "contains", index], series);
      });
    }
  }

  if (definition.id === "runner-preflight-version-mismatch") {
    const description = definition.description?.replace(/outside the \d+(?:\.\d+)?\.x series/g, `outside the ${series} series`);
    if (description !== definition.description) editScalar(["description"], description);
    const graderIndex = definition.graders?.findIndex((/** @type {{ name?: string }} */ grader) => grader.name === "reports-both-versions");
    if (graderIndex >= 0) {
      const contains = definition.graders[graderIndex].config?.contains ?? [];
      contains.forEach((/** @type {string} */ item, /** @type {number} */ index) => {
        if (/^\d+\.\d+$/.test(item) && item !== prefix) editScalar(["graders", graderIndex, "config", "contains", index], prefix);
      });
    }
  }

  let updated = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    updated = `${updated.slice(0, edit.start)}${edit.replacement}${updated.slice(edit.end)}`;
  }
  return updated;
}

/** @param {string} directory @returns {string[]} */
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function syncReleaseVersion() {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const skillPath = join(root, "skills/automatica11y-runner/SKILL.md");
  const skill = updateRunnerSkillVersion(readFileSync(skillPath, "utf8"), version);
  writeFileSync(skillPath, skill);
  const evalsDir = join(root, "evals");
  for (const path of filesUnder(evalsDir)) {
    if (path.endsWith(".yaml")) {
      const source = readFileSync(path, "utf8");
      const updated = updateEvalVersions(source, version);
      if (updated !== source) writeFileSync(path, updated);
    } else if (path.endsWith("guide-skill.md")) {
      writeFileSync(path, skill);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) syncReleaseVersion();
