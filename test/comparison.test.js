import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { findBrowser } from "../src/env/browser.js";
import { parseResults } from "../src/schema.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";
import { installPackage, npmView } from "./helpers/npm-fakes.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const { browser: available } = await findBrowser();
const skip = available ? false : "No Chrome or Chromium found";

const DIALOG = `import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "fake-ui";
export default function Fixture() {
  return (
    <Dialog>
      <DialogTrigger data-a11y-trigger>Open</DialogTrigger>
      <DialogContent data-a11y-root aria-labelledby="t"><DialogTitle id="t">Edit profile</DialogTitle><DialogClose>Close</DialogClose></DialogContent>
    </Dialog>
  );
}
`;

async function compare(args, { files = {} } = {}) {
  const cwd = makeTree(files);
  const { io, out } = makeIo({ cwd, env: process.env });
  io.npmView = npmView;
  io.installPackage = installPackage;
  const code = await main(["compare", ...args], io);
  const read = (file) => readFileSync(join(cwd, "a11y-report", file), "utf8");
  const has = existsSync(join(cwd, "a11y-report", "results.json"));
  return { code, report: has ? read("report.md") : null, results: has ? parseResults(JSON.parse(read("results.json"))) : null, ...out };
}

/** The lines of one markdown table that follows a heading. */
function table(report, heading) {
  const start = report.indexOf(heading);
  assert.ok(start >= 0, `report has "${heading}"`);
  const lines = report.slice(start).split("\n").slice(1);
  const first = lines.findIndex((line) => line.startsWith("|"));
  const rows = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith("|")) break;
    rows.push(line);
  }
  return rows;
}

test("two React libraries: the report opens with the coverage matrix, then findings per archetype", { skip }, async () => {
  const run = await compare(["ui=npm:fake-ui", "ns=npm:fake-nospread", "--archetypes", "button,dialog,tabs"], { files: { "fixtures/ui/dialog.jsx": DIALOG } });
  assert.equal(run.code, 0, run.stderr);
  const { report } = run;
  assert.match(report, /^# Accessibility comparison\./);
  assert.match(report, /Every target was checked with the same settings: WCAG 2\.2, level AA, axe-core and IBM Equal Access, and the same archetypes \(button, dialog, tabs\)/);
  // The coverage section comes before the findings, and has one matrix per tier.
  assert.ok(report.indexOf("## Coverage.") < report.indexOf("## Findings."));
  for (const heading of ["### Rules.", "### Interactions.", "### Virtual screen reader (simulated)."]) assert.ok(report.includes(heading), heading);

  const rules = table(report, "### Rules.");
  assert.deepEqual(rules.slice(2), ["| button | ran | gap |", "| dialog | ran (closed state; open state) | gap |", "| tabs | gap | gap |"]);
  const interactions = table(report, "### Interactions.");
  assert.deepEqual(interactions.slice(2), ["| button | ran | gap |", "| dialog | ran | gap |", "| tabs | gap | gap |"]);
});

test("each engine gets its own table, and counts are never added across engines or targets", { skip }, async () => {
  const run = await compare(["ui=npm:fake-ui", "ns=npm:fake-nospread", "--archetypes", "button"], {});
  const { report } = run;
  assert.ok(report.includes("### axe-core, violations by impact."));
  assert.ok(report.includes("### IBM Equal Access, violations by Toolkit level."));
  assert.doesNotMatch(report, /\btotal\b/i);
  assert.doesNotMatch(report, /\bscore\b/i);
  const axe = table(report, "### axe-core, violations by impact.");
  assert.equal(axe[0], "| Target | Critical | Serious | Moderate | Minor | Needs review |");
  assert.equal(axe[2], "| ui | 0 | 0 | 0 | 0 | 0 |");
  // The target with no usable fixture shows why, in its own row. It doesn't show zeros.
  assert.match(axe[3], /^\| ns \| failed \|/);
  const ibm = table(report, "### IBM Equal Access, violations by Toolkit level.");
  assert.equal(ibm[0], "| Target | Level 1 | Level 2 | Level 3 | Level 4 | Needs review |");
});

test("a gap reads as a gap in the findings, with the reason, and never as clean", { skip }, async () => {
  const run = await compare(["ui=npm:fake-ui", "ns=npm:fake-nospread", "--archetypes", "button,tabs"]);
  const rows = table(run.report, "### tabs.");
  assert.match(rows[2], /^\| ui \| - \| gap: No export looks like the tabs archetype/);
  assert.match(rows[3], /^\| ns \| - \| gap: No export looks like the tabs archetype/);
  const buttons = table(run.report, "### button.");
  assert.match(buttons[2], /^\| ui \| initial state \| none found/);
  assert.match(buttons[3], /^\| ns \| - \| gap: The fixture didn't render an element with data-a11y-trigger/);
  assert.doesNotMatch(run.report, /\bis (fully )?(accessible|compliant)\b/i);
});

test("mixing components and pages opens with the non-equivalence warning", { skip }, async () => {
  const run = await compare(["ui=npm:fake-ui", `site=${fixtures}clean.html`, "--archetypes", "button"]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.report, /\*\*Warning\.\*\* This comparison mixes component evidence and page evidence\. They test different things, so the results aren't equivalent\./);
  assert.ok(run.report.indexOf("**Warning.**") < run.report.indexOf("## Coverage."));
  const rules = table(run.report, "### Rules.");
  assert.ok(rules.some((row) => row === "| page | not-applicable | ran |"), rules.join("\n"));
  assert.ok(rules.some((row) => row === "| button | ran | not-applicable |"), rules.join("\n"));
  const interactions = table(run.report, "### Interactions.");
  assert.ok(interactions.some((row) => row === "| page | not-applicable | not-applicable |"));
});

test("a canvas-only target shows as not-testable in the matrix, beside one that ran", { skip }, async () => {
  const run = await compare([`chart=${fixtures}canvas-only.html`, `table=${fixtures}canvas-table.html`, "--tiers", "rules"]);
  const rules = table(run.report, "### Rules.");
  assert.deepEqual(rules.slice(2), ["| page | not-testable | ran |"]);
  assert.match(run.report, /\*\*Not testable in chart\.\*\*\n\n- Canvas output exposes nothing to rule checks\./);
  const axe = table(run.report, "### axe-core, violations by impact.");
  assert.match(axe[2], /^\| chart \| not-testable \|/);
  assert.equal(run.results.targets[0].summary.engines.axe.status, "not-testable");
});

test("--lib-a11y rows are labeled in the matrix and the findings", { skip }, async () => {
  const fixture = `import { Button } from "fake-ui";\nexport default function Fixture({ libA11y }) {\n  return <Button data-a11y-trigger data-a11y-root aria-label={libA11y ? "Save" : undefined} />;\n}\n`;
  const files = { "fixtures/ui/button.jsx": fixture, "map.json": JSON.stringify({ ui: { button: { libA11y: true } } }) };
  const run = await compare(["ui=npm:fake-ui", `site=${fixtures}clean.html`, "--mapping", "map.json", "--archetypes", "button", "--tiers", "rules"], { files });
  assert.equal(run.code, 0, run.stderr);
  const rules = table(run.report, "### Rules.");
  assert.ok(rules.includes("| button | ran (initial state, library accessibility on; initial state, library accessibility off) | not-applicable |"), rules.join("\n"));
  const findings = table(run.report, "### button.");
  assert.match(findings[2], /^\| ui \| initial state, library accessibility on \| none found \|/);
  assert.match(findings[3], /^\| ui \| initial state, library accessibility off \| `button-name` \(one\) \| `input_label_exists` \(one\)/);
});

test("a Storybook and a page compare by archetype, using the stories each archetype matched", { skip }, async () => {
  const run = await compare([`sb=${fixtures}storybook-static`, `site=${fixtures}clean.html`, "--tiers", "rules,vsr"]);
  assert.equal(run.code, 0, run.stderr);
  const rules = table(run.report, "### Rules.");
  const row = (name) => rules.find((r) => r.startsWith(`| ${name} |`));
  assert.equal(row("button"), "| button | ran (two stories of two) | not-applicable |");
  assert.equal(row("dialog"), "| dialog | ran (one story of one) | not-applicable |");
  assert.match(row("form-field"), /^\| form-field \| ran/);
  assert.equal(row("page"), "| page | not-applicable | ran |");
  const buttons = table(run.report, "### button.");
  assert.match(buttons[2], /^\| sb \| two stories of two \| `button-name` \(one\)/);
});

test("an audit of one target keeps the single-target report", { skip }, async () => {
  const cwd = makeTree();
  const { io } = makeIo({ cwd, env: process.env });
  assert.equal(await main(["audit", `${fixtures}clean.html`, "--tiers", "rules"], io), 0);
  const report = readFileSync(join(cwd, "a11y-report", "report.md"), "utf8");
  assert.match(report, /^# Accessibility report\./);
  assert.doesNotMatch(report, /Accessibility comparison/);
});

test("report rules: date and versions up top, snapshot note, simulated label, method note, engine labels", { skip }, async () => {
  const run = await compare([`a=${fixtures}clean.html`, `b=${fixtures}missing-label.html`]);
  const { report } = run;
  assert.ok(report.indexOf("Run date:") < report.indexOf("## Coverage."));
  assert.match(report, /\*\*Tool versions\.\*\*\n\n- node: /);
  assert.match(report, /These results are a snapshot\./);
  assert.match(report, /Virtual screen reader \(simulated\)/);
  assert.match(report, /## Method note\./);
  assert.match(report, /don't add their counts together/);
  assert.match(report, /No automated violations found by axe-core/);
  assert.ok(report.indexOf("## Coverage.") < report.indexOf("## Details by target."));
});
