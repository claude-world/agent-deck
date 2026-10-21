/**
 * Server integration test: boots server/index.ts in a child process against a
 * throwaway database and checks the REST API, the WebSocket and local-only access.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

let server: ChildProcess;
let tmpDir: string;
let base: string;
let output = "";

async function startServer(): Promise<string> {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-deck-test-"));
  server = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), path.join(ROOT, "server/index.ts")], {
    cwd: tmpDir,
    env: { ...process.env, PORT: "0", DECK_DB_PATH: path.join(tmpDir, "deck.db"), LITELLM_PROXY_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 30_000);
    const onData = (data: Buffer) => {
      output += data.toString();
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    };
    server.stdout?.on("data", onData);
    server.stderr?.on("data", onData);
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}:\n${output}`));
    });
  });
}

function connectWs(headers: Record<string, string> = {}): Promise<{ status: "open"; message: any } | { status: "rejected"; code: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws", { headers });
    ws.once("message", (data) => {
      resolve({ status: "open", message: JSON.parse(String(data)) });
      ws.close();
    });
    ws.once("unexpected-response", (_req, res) => resolve({ status: "rejected", code: res.statusCode ?? 0 }));
    ws.once("error", reject);
  });
}

before(async () => {
  base = await startServer();
});

after(async () => {
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("server", () => {
  it("serves the REST API", async () => {
    const res = await fetch(`${base}/api/deck/settings`);
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.defaultModel, "sonnet");
  });

  it("registers the working directory as a workspace and loads YAML teams", async () => {
    const workspaces = await (await fetch(`${base}/api/deck/workspaces`)).json();
    assert.ok(workspaces.some((w: { path: string }) => fs.realpathSync(w.path) === fs.realpathSync(tmpDir)));

    const teams = await (await fetch(`${base}/api/deck/teams`)).json();
    assert.ok(teams.length >= 3);
  });

  it("returns 400 (not 500) when a JSON body is missing", async () => {
    const res = await fetch(`${base}/api/deck/workspaces`, { method: "POST" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "path is required" });
  });

  it("allows CORS only for local origins", async () => {
    const local = await fetch(`${base}/api/deck/settings`, { headers: { Origin: "http://localhost:5200" } });
    assert.equal(local.status, 200);
    assert.equal(local.headers.get("access-control-allow-origin"), "http://localhost:5200");

    const foreign = await fetch(`${base}/api/deck/agents`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", prompt: "y" }),
    });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  });

  it("rejects requests for a non-local Host (DNS rebinding)", async () => {
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/api/deck/settings`, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });

  it("accepts local WebSocket clients and rejects foreign origins", async () => {
    const local = await connectWs();
    assert.equal(local.status, "open");
    assert.equal(local.status === "open" && local.message.type, "connected");

    const foreign = await connectWs({ Origin: "https://evil.example" });
    assert.deepEqual(foreign, { status: "rejected", code: 401 });
  });

  it("prints the package version and bound port in the startup banner", () => {
    assert.ok(output.includes(`Agent Deck v${PKG.version}`), output);
    assert.ok(output.includes(base.replace("127.0.0.1", "localhost")), output);
  });
});
