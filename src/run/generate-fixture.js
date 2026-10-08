import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { probeFixture } from "../harness/generate/probe.js";

const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split("\n").find((l) => l.trim()) ?? "unknown error";

/**
 * Build a fixture for an archetype from what discovery found, and keep it only if it works.
 * Candidates are bundled (all at once, or one by one if that fails), then probed in the browser in order. The first that
 * passes wins. Every attempt is recorded, whether or not one wins, so a report can say what was tried.
 *
 * @param {{
 *   browser: import("playwright-core").Browser,
 *   adapter: import("../frameworks/index.js").Adapter,
 *   archetype: string,
 *   entry: { export?: string, tag?: string },
 *   found: { exports: any[], tags: string[], facts: Record<string, any> },
 *   pkg: string,
 *   explicit?: boolean,
 *   tmp: string,
 *   workDir: string,
 *   buildDir: string,
 *   getServer: () => Promise<{ origin: string }>,
 *   bundle: (options: any) => Promise<unknown>,
 * }} input
 * @returns {Promise<{ ok: boolean, reason: string | null, attempts: Array<{ recipe: string, summary: string, ok: boolean, reason: string | null }>, winner?: { recipe: string, summary: string, used: string[], source: string, file: string, extension: string } }>}
 */
export async function generateFixture({ browser, adapter, archetype, entry, found, explicit = false, pkg, tmp, workDir, buildDir, getServer, bundle }) {
  const { candidates, reason } = adapter.generate({ archetype, pkg, entry, exports: found.exports, facts: found.facts, explicit });
  if (candidates.length === 0) return { ok: false, reason, attempts: [] };

  const extension = adapter.extension;
  mkdirSync(join(tmp, "generated"), { recursive: true });
  mkdirSync(join(tmp, "entries"), { recursive: true });
  const prepared = candidates.map((candidate, index) => {
    const name = `gen-${archetype}-${index}`;
    const file = join(tmp, "generated", `${archetype}-${index}.${extension}`);
    writeFileSync(file, candidate.source);
    const entryFile = join(tmp, "entries", `${name}.js`);
    writeFileSync(entryFile, adapter.entry(file, pkg));
    return { candidate, name, file, entryFile, bundled: null };
  });

  // One build for every candidate. If a single bad one breaks it, build them one by one so the rest still get a chance.
  try {
    await bundle({ entries: Object.fromEntries(prepared.map((p) => [p.name, p.entryFile])), outdir: buildDir, workDir, framework: adapter });
    for (const p of prepared) p.bundled = true;
  } catch {
    for (const p of prepared) {
      try {
        await bundle({ entries: { [p.name]: p.entryFile }, outdir: buildDir, workDir, framework: adapter });
        p.bundled = true;
      } catch (error) {
        p.bundled = firstLine(error);
      }
    }
  }

  const server = await getServer();
  const attempts = [];
  for (const p of prepared) {
    const base = { recipe: p.candidate.id, summary: p.candidate.summary };
    if (p.bundled !== true) {
      attempts.push({ ...base, ok: false, reason: `it didn't bundle: ${p.bundled}` });
      continue;
    }
    const probe = await probeFixture(browser, `${server.origin}/${p.name}.html`, archetype);
    attempts.push({ ...base, ok: probe.ok, reason: probe.reason });
    if (probe.ok) {
      return { ok: true, reason: null, attempts, winner: { ...base, used: p.candidate.used, source: p.candidate.source, file: p.file, extension } };
    }
  }
  return { ok: false, reason: `${attempts.length === 1 ? "The one generated fixture didn't work" : `None of the ${attempts.length} generated fixtures worked`}. ${attempts.slice(0, 2).map((a) => `${a.summary}: ${a.reason}`).join("; ")}${attempts.length > 2 ? `; and ${attempts.length - 2} more` : ""}.`, attempts };
}
