#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const publicDir = join(docs, "public");
const skillSources = [
  {
    source: "skills/automatica11y-runner/references/fixtures.md",
    destination: "fixtures.md",
  },
  {
    source: "skills/automatica11y-runner/SKILL.md",
    destination: "agent-steps.md",
    stripFrontMatter: true,
  },
];
const assets = [
  ["automatica11y-og.png", "og.png"],
  ["automatica11y-og-light.png", "og-light.png"],
  ["home-light.svg", "home-light.svg"],
  ["home-dark.svg", "home-dark.svg"],
  ["automatica11y-favicon.ico", "favicon.ico"],
  ["automatica11y-favicon.svg", "favicon.svg"],
];

function writeIfChanged(path, content) {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch {}
  writeFileSync(path, content);
}

export function prepareDocs() {
  mkdirSync(publicDir, { recursive: true });
  for (const page of skillSources) {
    const source = readFileSync(join(root, page.source), "utf8");
    const content = page.stripFrontMatter ? source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "") : source;
    writeIfChanged(join(docs, page.destination), content);
  }
  for (const [source, destination] of assets) {
    copyFileSync(join(root, "site-assets", source), join(publicDir, destination));
  }
  writeIfChanged(join(publicDir, "CNAME"), "automatica11y.dev\n");
  writeIfChanged(join(publicDir, "llms.txt"), `# automatica11y

> Test and compare the accessibility of web pages, Storybook builds, and npm component libraries.

## Documentation

- [Quick start](https://automatica11y.dev/quick-start)
- [Targets](https://automatica11y.dev/targets)
- [What it checks](https://automatica11y.dev/checks)
- [Options and exit codes](https://automatica11y.dev/options)
- [Reading a report](https://automatica11y.dev/reports)
- [npm packages and fixtures](https://automatica11y.dev/npm-packages)
- [Writing fixtures](https://automatica11y.dev/fixtures)
- [Using it with an AI agent](https://automatica11y.dev/agents)
- [The agent steps](https://automatica11y.dev/agent-steps)
- [Limits](https://automatica11y.dev/limits)
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareDocs();
}