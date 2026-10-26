import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const dataFile = process.env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE;
assert.ok(dataFile, "Renovate must provide its post-upgrade data file.");
const upgrades = JSON.parse(readFileSync(dataFile, "utf8"));
assert.ok(Array.isArray(upgrades) && upgrades.length > 0, "Renovate must provide a nonempty upgrades list.");

const changes = upgrades.map((upgrade) => {
  assert.ok(upgrade && typeof upgrade === "object", "Invalid Renovate upgrade.");
  if (upgrade.updateType === "lockFileMaintenance") {
    return "- Refresh the dependency lockfile.";
  }
  assert.ok(typeof upgrade.depName === "string" && upgrade.depName.length > 0, "Upgrade must name a dependency.");
  const current = upgrade.currentValue ?? upgrade.currentVersion ?? upgrade.currentDigest;
  const next = upgrade.newValue ?? upgrade.newVersion ?? upgrade.newDigest;
  assert.ok(typeof next === "string" && next.length > 0, "Upgrade must provide a new version or digest.");
  assert.ok(current === undefined || typeof current === "string", "Invalid current dependency version.");
  let description = `- Update ${JSON.stringify(upgrade.depName)}`;
  if (current) description += ` from ${JSON.stringify(current)}`;
  description += ` to ${JSON.stringify(next)}`;
  if (upgrade.newDigest && upgrade.newDigest !== next) {
    assert.equal(typeof upgrade.newDigest, "string", "Invalid new dependency digest.");
    description += ` (digest ${JSON.stringify(upgrade.newDigest)})`;
  }
  return description + ".";
});

writeFileSync(
  ".changeset/renovate-dependencies.md",
  `---\nautomatica11y: patch\n---\n\nUpdate dependencies:\n\n${[...new Set(changes)].join("\n")}\n`,
);
