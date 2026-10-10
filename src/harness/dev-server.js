import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { validateServer } from "../commands/config.js";

export async function startDevServer(server, io) {
  validateServer(server);
  const probe = async (timeout) => {
    try {
      return await fetch(server.url, { signal: AbortSignal.timeout(timeout), redirect: "manual" });
    } catch {
      return null;
    }
  };
  const existing = await probe(500);
  if (existing) {
    await existing.body?.cancel();
    throw new Error("The readiness URL already responds. Refusing to audit an unrelated server.");
  }
  const child = spawn(server.command, { shell: true, detached: process.platform !== "win32", cwd: resolve(io.cwd, server.cwd ?? "."), env: io.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (data) => io.stdout.write(data.toString()));
  child.stderr.on("data", (data) => io.stderr.write(data.toString()));
  let failure = null;
  let exited = false;
  child.on("error", (error) => { failure = error; });
  child.on("exit", (code, signal) => { exited = true; failure ??= new Error(`Server exited before the audit finished (${signal ?? code}).`); });
  let stopping;
  const stop = () => stopping ??= (async () => {
    const kill = (signal) => {
      try {
        if (process.platform === "win32") {
          if (child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on("error", () => {});
        } else if (child.pid) process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    kill("SIGTERM");
    const deadline = Date.now() + 2000;
    if (process.platform !== "win32" && child.pid) {
      while (Date.now() < deadline) {
        try { process.kill(-child.pid, 0); } catch { break; }
        await delay(50);
      }
      kill("SIGKILL");
    }
  })();
  const onInterrupt = () => { void stop().finally(() => process.exit(130)); };
  const onTerminate = () => { void stop().finally(() => process.exit(143)); };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  const close = async () => {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    await stop();
  };
  try {
    const deadline = Date.now() + (server.timeoutSeconds ?? 60) * 1000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      const response = await probe(Math.max(1, Math.min(1000, deadline - Date.now())));
      const ready = response && response.status >= 200 && response.status < 400;
      await response?.body?.cancel();
      if (ready && !exited && !failure) return { close, failure: () => failure };
      await delay(100);
    }
    throw new Error(`Server readiness timed out after ${server.timeoutSeconds ?? 60}s: ${server.url}`);
  } catch (error) {
    await close();
    throw error;
  }
}