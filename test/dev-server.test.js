import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { startDevServer } from "../src/harness/dev-server.js";
import { main } from "../src/cli.js";
import { makeIo, makeTree } from "./helpers/fixtures.js";

async function unusedPort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(null)));
  const address = server.address();
  const port = typeof address === "object" ? address.port : 0;
  await new Promise((done) => server.close(done));
  return port;
}

test("managed server becomes ready and is cleaned up", async () => {
  const port = await unusedPort();
  const cwd = makeTree({ "server.cjs": `require('node:http').createServer((req,res)=>res.end('ready')).listen(${port},'127.0.0.1')` });
  const { io } = makeIo({ cwd, env: process.env });
  const url = `http://127.0.0.1:${port}`;
  const server = await startDevServer({ command: `"${process.execPath}" server.cjs`, url, timeoutSeconds: 5 }, io);
  assert.equal((await fetch(url)).status, 200);
  await server.close();
  await assert.rejects(fetch(url));
});

test("occupied readiness URL, early exit and timeout fail clearly", async () => {
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const occupied = createServer((request, response) => response.end("existing"));
  await new Promise((done) => occupied.listen(port, "127.0.0.1", () => done(null)));
  const { io } = makeIo({ env: process.env });
  try { await assert.rejects(startDevServer({ command: "exit 0", url }, io), /already responds/); }
  finally { await new Promise((done) => occupied.close(done)); }
  await assert.rejects(startDevServer({ command: `"${process.execPath}" -e "process.exit(7)"`, url }, io), /exited/);
  await assert.rejects(startDevServer({ command: `"${process.execPath}" -e "setInterval(()=>{},1000)"`, url, timeoutSeconds: 1 }, io), /timed out/);
});

test("ci plan mode validates server settings without launching it", async () => {
  const cwd = makeTree({ "page.html": "<h1>Test</h1>" });
  const { io, out } = makeIo({ cwd });
  assert.equal(await main(["ci", join(cwd, "page.html"), "--plan", "--server-command", "exit 7", "--server-url", "http://127.0.0.1:12345"], io), 0, out.stderr);
});

test("CI cleans up its managed server when browser setup fails", async () => {
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const cwd = makeTree({ "server.cjs": `require('node:http').createServer((req,res)=>res.end('<h1>Test</h1>')).listen(${port},'127.0.0.1')` });
  const { io, out } = makeIo({ cwd, env: { ...process.env, AUTOMATICA11Y_CHROME: join(cwd, "missing-browser") } });
  const code = await main(["ci", url, "--server-command", `"${process.execPath}" server.cjs`, "--server-url", url], io);
  assert.equal(code, 3, out.stderr);
  await assert.rejects(fetch(url));
});