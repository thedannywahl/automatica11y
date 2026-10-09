import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { parsePlan } from "../src/schema.js";
import { STORYBOOK_INDEX, fakeFetch, makeFakeBrowser, makeIo, makeTree } from "./helpers/fixtures.js";

const onUnix = process.platform !== "win32";

/** The registry, faked. Every package looks like a React library at version 1.1.0. */
const npmView = async (spec) => ({ name: spec.replace(/@[^@/]*$/, ""), version: "1.1.0", peerDependencies: { react: "*" } });

async function run(argv, overrides = {}) {
  const { io, out } = makeIo({ npmView, ...overrides });
  const code = await main(argv, io);
  return { code, ...out, cwd: io.cwd };
}

async function usageError(argv, pattern) {
  const result = await run(argv);
  assert.equal(result.code, 2, `${argv.join(" ")} should exit 2, got ${result.code}: ${result.stderr}`);
  assert.match(result.stderr, pattern);
}

test("--version prints the package version", async () => {
  const result = await run(["--version"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});

test("no command, unknown command, and --help", async () => {
  assert.equal((await run([])).code, 2);
  await usageError(["nope"], /Unknown command "nope"/);
  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /automatica11y compare/);
  assert.equal((await run(["audit", "--help"])).code, 0);
});

test("check is an alias for audit", async () => {
  const result = await run(["check", "npm:react", "--plan"]);
  assert.equal(result.code, 0, result.stderr);
  const plan = JSON.parse(readFileSync(join(result.cwd, "a11y-report", "plan.json"), "utf8"));
  assert.equal(plan.command, "audit");
  const help = await run(["check", "--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /automatica11y audit <target>[\s\S]*automatica11y check <target>/);
  assert.match((await run(["--help"])).stdout, /automatica11y check <target>/);
});

test("usage errors exit 2", async () => {
  await usageError(["audit"], /audit needs one target/);
  await usageError(["audit", "a", "b"], /audit takes one target/);
  await usageError(["compare", "a"], /at least two targets/);
  await usageError(["audit", "npm:react", "--wcag", "3.0"], /--wcag must be one of/);
  await usageError(["audit", "npm:react", "--level", "AAAA"], /--level must be one of/);
  await usageError(["audit", "npm:react", "--tiers", "rules,nope"], /Unknown tiers value: nope/);
  await usageError(["audit", "npm:react", "--engine", "alfa"], /Unknown engine value: alfa/);
  await usageError(["audit", "npm:react", "--archetypes", "carousel"], /Unknown archetypes value: carousel/);
  await usageError(["audit", "npm:react", "--lib-a11y", "maybe"], /Unknown lib-a11y/);
  await usageError(["audit", "npm:react", "--max-stories", "0"], /--max-stories/);
  await usageError(["audit", "npm:react", "--bogus"], /bogus/);
  await usageError(["compare", "a=react", "a=vue"], /Two targets use the label "a"/);
});

test("fail flag validation", async () => {
  await usageError(["audit", "npm:react", "--fail-on-axe", "severe"], /--fail-on-axe must be one of/);
  await usageError(["audit", "npm:react", "--fail-on-ibm", "4"], /--fail-on-ibm must be one of/);
  await usageError(["audit", "npm:react", "--fail-mode", "all"], /--fail-mode needs/);
  await usageError(["audit", "npm:react", "--fail-on-axe", "serious", "--fail-mode", "some"], /--fail-mode must be one of/);
  await usageError(["audit", "npm:react", "--engine", "ibm", "--fail-on-axe", "serious"], /--fail-on-axe needs the axe engine/);
  await usageError(["audit", "npm:react", "--engine", "axe", "--fail-on-ibm", "1"], /--fail-on-ibm needs the ibm engine/);
  await usageError(["audit", "npm:react", "--tiers", "vsr", "--fail-on-axe", "serious"], /check the rules tier/);
});

test("--plan writes a valid plan.json and exits 0", async () => {
  const cwd = makeTree({ "page.html": "<h1>Hi</h1>", "sb/index.json": STORYBOOK_INDEX });
  const fetch = fakeFetch({ "https://example.com/": { body: "<h1>Hi</h1>" } });
  const result = await run(["compare", "local=./page.html", "./sb", "https://example.com/", "radix=npm:@radix-ui/react-dialog@1.1.0", "--plan", "--fail-on-axe", "serious", "--fail-on-ibm", "1", "--fail-mode", "all", "--engine", "axe,ibm"], { cwd, fetch });
  assert.equal(result.code, 0, result.stderr);
  const plan = parsePlan(JSON.parse(readFileSync(join(cwd, "a11y-report", "plan.json"), "utf8")));
  assert.equal(plan.command, "compare");
  assert.deepEqual(plan.options.fail, { mode: "all", axe: "serious", ibm: 1 });
  assert.deepEqual(plan.options.tiers, ["rules", "interactions", "computed", "conditions", "vsr"]);
  assert.deepEqual(plan.options.engines, ["axe", "ibm"]);
  assert.deepEqual(plan.options.libA11y, ["on", "off"]);
  assert.equal(plan.options.maxStories, 200);
  assert.deepEqual(plan.targets.map((t) => [t.id, t.kind, t.status]), [
    ["local", "html-file", "ok"],
    ["sb", "storybook", "ok"],
    ["example.com", "url", "ok"],
    ["radix", "npm-react", "ok"],
  ]);
  assert.equal(plan.targets[3].resolved.requested, "1.1.0");
  assert.equal(plan.tools.node, process.versions.node);
  assert.equal(plan.tools.automatica11y, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
  assert.match(result.stdout, /Wrote .*plan\.json/);
});

test("--plan respects --out and shows the same names for duplicate ids", async () => {
  const cwd = makeTree({ "a/page.html": "", "b/page.html": "" });
  const result = await run(["compare", "./a/page.html", "./b/page.html", "--plan", "--out", "./out"], { cwd });
  assert.equal(result.code, 0);
  const plan = JSON.parse(readFileSync(join(cwd, "out", "plan.json"), "utf8"));
  assert.deepEqual(plan.targets.map((t) => t.id), ["page.html", "page.html-2"]);
});

test("a bare word is a path, so a package has to be written npm:name", async () => {
  const bare = await run(["audit", "react", "--plan"]);
  assert.equal(bare.code, 4, "a bare word that isn't a path fails");
  assert.match(bare.stdout, /Path not found: .*react\. If you meant the npm package, write npm:react\./);
  assert.equal((await run(["audit", "npm:react", "--plan"])).code, 0);
  // A folder with the package's name is a folder without the prefix, and a package with it.
  const cwd = makeTree({ "react/index.html": "<h1>Hi</h1>" });
  const folder = JSON.parse((await run(["audit", "react", "--plan"], { cwd }) && readFileSync(join(cwd, "a11y-report", "plan.json"), "utf8")));
  assert.equal(folder.targets[0].kind, "static-dir");
  await run(["audit", "npm:react", "--plan"], { cwd });
  assert.equal(JSON.parse(readFileSync(join(cwd, "a11y-report", "plan.json"), "utf8")).targets[0].kind, "npm-react");
  const scheme = await run(["audit", "ftp://example.com", "--plan"]);
  assert.equal(scheme.code, 4);
  assert.match(scheme.stdout, /Only http and https URLs are supported/);
});

test("--plan never starts a browser and doesn't need one", async () => {
  const result = await run(["audit", "npm:react", "--plan"], { env: { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" } });
  assert.equal(result.code, 0);
});

test("a failed target doesn't stop a comparison, but all failing exits 4", async () => {
  const cwd = makeTree({ "page.html": "" });
  const mixed = await run(["compare", "./page.html", "./missing.html", "--plan"], { cwd });
  assert.equal(mixed.code, 0);
  const plan = JSON.parse(readFileSync(join(cwd, "a11y-report", "plan.json"), "utf8"));
  assert.deepEqual(plan.targets.map((t) => t.status), ["ok", "failed"]);
  assert.match(plan.targets[1].reason, /Path not found/);

  const allBad = await run(["compare", "./x.html", "./y.html", "--plan"], { cwd });
  assert.equal(allBad.code, 4);
  assert.match(allBad.stderr, /Every target failed/);
  assert.equal((await run(["audit", "./x.html", "--plan"], { cwd })).code, 4);
});

test("a real run with no browser exits 3 and prints the install command", async () => {
  const result = await run(["audit", "npm:react"], { env: { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" } });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /npx playwright-core install --only-shell chromium/);
});

test("a real run writes the plan first, even when the browser won't start", { skip: !onUnix }, async () => {
  const result = await run(["audit", "npm:react"], { env: { PATH: "", AUTOMATICA11Y_CHROME: makeFakeBrowser("123.0.4567.89") } });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /Couldn't start the browser/);
  const plan = JSON.parse(readFileSync(join(result.cwd, "a11y-report", "plan.json"), "utf8"));
  assert.equal(plan.tools.chromium, "123.0.4567.89");
});

test("run --plan re-runs a saved plan and warns when versions differ", { skip: !onUnix }, async () => {
  const first = await run(["audit", "npm:react", "--plan"]);
  const planFile = join(first.cwd, "a11y-report", "plan.json");
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  plan.tools.node = "18.0.0";
  writeFileSync(planFile, JSON.stringify(plan));
  const env = { PATH: "", AUTOMATICA11Y_CHROME: makeFakeBrowser() };
  const result = await run(["run", "--plan", planFile], { cwd: first.cwd, env });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /node was 18\.0\.0 when this plan was made/);
});

test("run --plan rejects missing and invalid plans", async () => {
  await usageError(["run"], /needs --plan/);
  await usageError(["run", "--plan", "nope.json"], /Can't read the plan/);
  const cwd = makeTree({ "bad.json": JSON.stringify({ schema: 2 }) });
  const result = await run(["run", "--plan", "bad.json"], { cwd });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Invalid plan/);
});

test("doctor: exits 0 with a browser, 3 without", { skip: !onUnix }, async () => {
  const ok = await run(["doctor"], { env: { PATH: "", AUTOMATICA11Y_CHROME: makeFakeBrowser("130.0.1.2") } });
  assert.equal(ok.code, 0);
  assert.match(ok.stdout, /Node\s+\S+\s+ok/);
  assert.match(ok.stdout, /130\.0\.1\.2/);

  const missing = await run(["doctor"], { env: { PATH: "", AUTOMATICA11Y_CHROME: "/does/not/exist" } });
  assert.equal(missing.code, 3);
  assert.match(missing.stderr, /npx playwright-core install --only-shell chromium/);
});

test("guide prints the guidance files, and each topic prints its own file", async () => {
  const { readFileSync } = await import("node:fs");
  const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.equal((await run(["guide"])).stdout, file("AGENTS.md"), "no topic prints AGENTS.md");
  assert.equal((await run(["guide", "agents"])).stdout, file("AGENTS.md"));
  assert.equal((await run(["guide", "skill"])).stdout, file("skills/automatica11y-runner/SKILL.md"));
  assert.equal((await run(["guide", "fixtures"])).stdout, file("skills/automatica11y-runner/references/fixtures.md"));
  const result = await run(["guide", "skill"]);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
});

test("guide rejects an unknown topic, lists the topics, and has help", async () => {
  await usageError(["guide", "nope"], /Unknown guide topic "nope"[\s\S]*agents[\s\S]*skill[\s\S]*fixtures/);
  await usageError(["guide", "skill", "fixtures"], /guide takes one topic/);
  await usageError(["guide", "--bogus"], /bogus/);
  const help = await run(["guide", "--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: automatica11y guide \[agents\|skill\|fixtures\]/);
  assert.match((await run(["--help"])).stdout, /automatica11y guide/);
  await usageError(["init-skill"], /Unknown command "init-skill"/);
});

test("plan.json isn't written when the command line is invalid", async () => {
  const result = await run(["audit", "npm:react", "--wcag", "9"]);
  assert.equal(result.code, 2);
  assert.equal(existsSync(join(result.cwd, "a11y-report")), false);
});
