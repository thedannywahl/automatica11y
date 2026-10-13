#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function syncReleaseVersion() {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const skillPath = join(root, "skills/automatica11y-runner/SKILL.md");
  writeFileSync(skillPath, updateRunnerSkillVersion(readFileSync(skillPath, "utf8"), version));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) syncReleaseVersion();
