import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** What `npm pack` would put in the tarball, without writing one. */
function packed() {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" });
  return JSON.parse(out)[0];
}

test("the package is ready to publish: public, MIT, ESM, Node 20 or newer", () => {
  assert.equal(pkg.name, "automatica11y");
  assert.equal(pkg.private, undefined, "private is gone, so npm will publish it");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.publishConfig.access, "public");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.ok(pkg.description.length > 20);
  assert.deepEqual(Object.keys(pkg.bin), ["automatica11y", "a11y"]);
  assert.equal(pkg.bin.a11y, pkg.bin.automatica11y, "the short name runs the same file");
  assert.ok(existsSync(join(root, pkg.bin.automatica11y)));
  assert.match(readFileSync(join(root, pkg.bin.automatica11y), "utf8"), /^#!\/usr\/bin\/env node\n/);
  assert.ok(statSync(join(root, pkg.bin.automatica11y)).mode & 0o111, "the bin file is executable");
});

test("the tarball holds the tool, the skill, the docs, and the license, and nothing else", () => {
  const { files } = packed();
  const names = files.map((f) => f.path);
  for (const must of ["package.json", "README.md", "LICENSE", "AGENTS.md", "skills/automatica11y/SKILL.md", "skills/automatica11y-runner/SKILL.md", "skills/automatica11y-runner/references/fixtures.md", "bin/automatica11y.js", "src/cli.js", "src/tiers/rules/index.js", "src/tiers/interactions/archetypes.js", "src/tiers/vsr.js", "src/report/comparison.js", "src/wcag/index.js", "src/data/wcag-2.2.json", "src/data/wcag-2.2.source.json", "src/data/README.md"]) {
    assert.ok(names.includes(must), `${must} is in the tarball`);
  }
  for (const path of names) {
    assert.ok(!/^(test|\.agents|\.github|a11y-report|node_modules|fixtures)\//.test(path), `${path} stays out of the tarball`);
    assert.ok(!path.endsWith(".test.js"), `${path} stays out`);
  }
  const size = files.reduce((n, f) => n + f.size, 0);
  // The W3C's WCAG JSON ships unmodified, and it's about half a megabyte of this.
  assert.ok(size < 1_250_000, `the tarball is small (${size} bytes unpacked)`);
});

test("every dependency the code imports is a real dependency", () => {
  const imports = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      // These write code for fixtures to bundle. The imports in their templates belong to the bundle, not to this package.
      else if (entry.name.endsWith(".js") && !["react.js", "vue.js", "angular.js", "svelte.js", "angular-recipes.js", "wc.js", "dialects.js", "jsx-recipes.js", "wc-recipes.js"].includes(entry.name)) {
        const text = readFileSync(path, "utf8");
        for (const m of text.matchAll(/(?:from|import\()\s*["']([^."'/][^"']*)["']/g)) imports.add(m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0]);
      }
    }
  };
  walk(join(root, "src"));
  const builtins = new Set(["fs", "path", "os", "url", "util", "module", "http", "net", "child_process", "assert", "test"]);
  const declared = new Set(Object.keys(pkg.dependencies));
  for (const name of imports) {
    if (name.startsWith("node:") || builtins.has(name)) continue;
    assert.ok(declared.has(name), `${name} is imported by the code, so it must be in dependencies`);
  }
  for (const dev of Object.keys(pkg.devDependencies)) assert.ok(!imports.has(dev), `${dev} is a dev dependency, so the code can't import it`);
});


test("the docs document every flag, every exit code, and the skill install, and the README says what the tool won't do", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const docs = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => readFileSync(join(root, "docs", name), "utf8")).join("\n");
  const common = readFileSync(join(root, "src/commands/common.js"), "utf8");
  const defs = /OPTION_DEFS = [^{]*\{([\s\S]*?)\n\}\);/.exec(common)[1];
  const flags = [...defs.matchAll(/^\s*"?([a-z0-9-]+)"?: \{/gm)].map((m) => m[1]).filter((f) => f !== "help");
  assert.ok(flags.length >= 12);
  for (const flag of flags) assert.ok(docs.includes(`--${flag}`), `the docs document --${flag}`);
  for (const code of ["0", "1", "2", "3", "4"]) assert.match(docs, new RegExp(`\\| ${code} \\|`), `the docs explain exit code ${code}`);
  assert.match(readme, /skills\/automatica11y/);
  // The README is the short case for the tool. The guide commands live in the docs.
  assert.match(docs, /automatica11y@latest guide/);
  for (const text of [readme, docs]) {
    assert.doesNotMatch(text, /init-skill/);
    assert.doesNotMatch(text, /\bis (fully )?(accessible|compliant)\b/i);
  }
  assert.match(docs, /no automated violations found/i);
  assert.match(readme, /no automated violations found|never says "accessible/i);
});
