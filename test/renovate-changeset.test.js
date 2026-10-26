import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import YAML from "yaml";

const script = fileURLToPath(new URL("../scripts/renovate-changeset.js", import.meta.url));

test("Renovate writes a patch Changeset describing grouped updates", () => {
  const directory = mkdtempSync(join(tmpdir(), "automatica11y-renovate-"));
  try {
    mkdirSync(join(directory, ".changeset"));
    const dataFile = join(directory, "upgrades.json");
    const upgrades = [
      { depName: "axe-core", currentValue: "^4.13.0", newValue: "^4.14.0" },
      { depName: "actions/checkout", currentValue: "v7", newValue: "v7", newDigest: "abc123" },
      { updateType: "lockFileMaintenance" },
      { depName: "example", newVersion: "2.0.0" },
      { depName: "digest-only", currentDigest: "abc", newDigest: "def" },
      { depName: "untrusted ' $(echo nope)", currentValue: "1.0.0", newValue: "2.0.0\n---" },
    ];
    writeFileSync(dataFile, JSON.stringify([...upgrades, upgrades[0]]));
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      env: { ...process.env, RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE: dataFile },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(directory, ".changeset/renovate-dependencies.md"), "utf8"), [
      "---", "automatica11y: patch", "---", "", "Update dependencies:", "",
      '- Update "axe-core" from "^4.13.0" to "^4.14.0".',
      '- Update "actions/checkout" from "v7" to "v7" (digest "abc123").',
      "- Refresh the dependency lockfile.",
      '- Update "example" to "2.0.0".',
      '- Update "digest-only" from "abc" to "def".',
      '- Update "untrusted \' $(echo nope)" from "1.0.0" to "2.0.0\\n---".',
      "",
    ].join("\n"));
    rmSync(join(directory, ".changeset/renovate-dependencies.md"));
    for (const data of ["[]", "{}", "invalid JSON", '[{"depName":"example"}]']) {
      writeFileSync(dataFile, data);
      const invalid = spawnSync(process.execPath, [script], {
        cwd: directory,
        env: { ...process.env, RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE: dataFile },
        encoding: "utf8",
      });
      assert.notEqual(invalid.status, 0);
      assert.ok(invalid.stderr.length > 0);
      assert.equal(existsSync(join(directory, ".changeset/renovate-dependencies.md")), false);
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("Renovate allowlists only the Changeset script and passes upgrades as JSON", () => {
  const config = JSON.parse(readFileSync(new URL("../renovate.json", import.meta.url), "utf8"));
  const workflow = YAML.parse(readFileSync(new URL("../.github/workflows/renovate.yml", import.meta.url), "utf8"));
  const allowed = JSON.parse(workflow.jobs.renovate.steps[0].env.RENOVATE_ALLOWED_COMMANDS)
    .map((/** @type {string} */ pattern) => new RegExp(pattern));
  assert.equal(config.postUpgradeTasks.dataFileTemplate, "{{{toJSON upgrades}}}");
  assert.equal(config.postUpgradeTasks.executionMode, "branch");
  assert.deepEqual(config.postUpgradeTasks.fileFilters, [".changeset/renovate-dependencies.md"]);
  assert.deepEqual(config.postUpgradeTasks.commands, ["node scripts/renovate-changeset.js"]);
  assert.ok(allowed.some((/** @type {RegExp} */ pattern) => pattern.test(config.postUpgradeTasks.commands[0])));
  assert.ok(!allowed.some((/** @type {RegExp} */ pattern) => pattern.test("node scripts/renovate-changeset.js; echo unsafe")));
});
