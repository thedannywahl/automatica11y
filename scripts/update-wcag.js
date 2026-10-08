#!/usr/bin/env node
// Download the W3C's published WCAG 2.2 JSON, byte for byte, into src/data/.
// The W3C's terms say to attribute the source and not change the content, so this script never edits what it downloads.
// It also records where and when the file came from, in a separate file. Run it with `npm run update-wcag`.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const URL_ = "https://www.w3.org/WAI/WCAG22/wcag.json";
const response = await fetch(URL_);
if (!response.ok) {
  console.error(`Couldn't download ${URL_}: HTTP ${response.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
const data = JSON.parse(bytes.toString("utf8"));
if (!Array.isArray(data.principles) || !Array.isArray(data.terms)) {
  console.error("The download doesn't look like the WCAG JSON (no principles and terms), so nothing was written.");
  process.exit(1);
}
const dir = new URL("../src/data/", import.meta.url);
writeFileSync(new URL("wcag-2.2.json", dir), bytes);
writeFileSync(
  new URL("wcag-2.2.source.json", dir),
  `${JSON.stringify({ source: URL_, about: "https://github.com/w3c/wcag/blob/main/11ty/json/README.md", retrieved: new Date().toISOString().slice(0, 10), sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2)}\n`,
);
console.log(`Wrote src/data/wcag-2.2.json (${bytes.length} bytes).`);
