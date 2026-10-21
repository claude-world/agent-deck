/**
 * Agent Deck - Server Entry Point
 *
 * Express + WebSocket server with graceful shutdown and auto port.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import type { AddressInfo } from "net";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "../package.json" with { type: "json" };
import db from "./core/db.js";
import { DeckStore } from "./core/db.js";
import { LOCAL_HOST, isAllowedOrigin, localOnly } from "./core/local-access.js";
import { DeckManager } from "./deck/deck-manager.js";
import { SessionRecovery } from "./deck/session-recovery.js";
import { LiteLLMBridge } from "./deck/litellm-bridge.js";
import { loadTeamConfigs, fileConfigsToMap } from "./deck/team-file-loader.js";
import { WorkflowExecutor } from "./deck/workflow-executor.js";
import { WorkspaceManager } from "./core/workspace-manager.js";
import { createDeckRouter } from "./routes/deck.js";
import { createWorkspaceRouter } from "./routes/workspaces.js";
import { createWebSocketServer } from "./ws.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "3002", 10);

// ─── Express App ───────────────────────────────────

const app = express();
app.use(localOnly());
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
app.use(express.json());
// Express 5 leaves req.body undefined when no JSON body was sent; routes destructure it
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});

// ─── Core Services ─────────────────────────────────

const deckManager = new DeckManager(db);

const sessionRecovery = new SessionRecovery(deckManager.getStore());
sessionRecovery.setDeckManager(deckManager);
sessionRecovery.registerShutdownHandlers();

const workflowExecutor = new WorkflowExecutor(deckManager);

// Workspace manager
const coreStore = new DeckStore(db);
const workspaceManager = new WorkspaceManager(coreStore);

// Auto-add cwd as workspace on startup (skip root dir in Electron)
const cwd = process.cwd();
if (cwd !== "/" && cwd !== "C:\\") {
  try { workspaceManager.add(cwd); } catch {}
}

// ─── REST Routes ───────────────────────────────────

app.use("/api/deck", createDeckRouter(deckManager, workflowExecutor, workspaceManager));
app.use("/api/deck/workspaces", createWorkspaceRouter(workspaceManager));

// Serve static files (production)
const staticDir = process.env.DECK_STATIC_DIR || path.join(__dirname, "../dist");
app.use(express.static(staticDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ─── HTTP + WebSocket Server ───────────────────────

const server = createServer(app);
createWebSocketServer(server, deckManager, workflowExecutor);

// ─── Startup ───────────────────────────────────────

// Log crashed sessions
const crashed = sessionRecovery.getCrashedSessions();
if (crashed.length > 0) {
  console.log(`[Deck] Found ${crashed.length} crashed/shutdown sessions (resumable)`);
}

// Load YAML team configs
const teamConfigDir = process.env.DECK_TEAM_CONFIGS || path.join(__dirname, "../team-configs");
loadTeamConfigs(teamConfigDir)
  .then((configs) => {
    if (configs.length > 0) {
      deckManager.setFileTeamConfigs(fileConfigsToMap(configs));
      console.log(`[Deck] Loaded ${configs.length} YAML team configs`);
    }
  })
  .catch((err) => {
    console.warn(`[Deck] Failed to load YAML team configs:`, err.message);
  });

// Check LiteLLM
const litellmBridge = new LiteLLMBridge();
if (litellmBridge.isEnabled()) {
  litellmBridge.checkAvailability().then((available) => {
    if (available) {
      console.log(`[Deck] LiteLLM proxy available at ${litellmBridge.getProxyUrl()}`);
    }
  });
}

// Start server with auto port fallback (loopback only, see core/local-access.ts)
function tryListen(port: number, maxRetries = 5): void {
  server.listen(port, LOCAL_HOST, () => {
    const { port: boundPort } = server.address() as AddressInfo;
    const lines = [
      `Agent Deck v${pkg.version}`,
      `http://localhost:${boundPort}`,
      `WebSocket: ws://localhost:${boundPort}/ws`,
      `Dev: http://localhost:5200`,
    ];
    const width = Math.max(...lines.map((l) => l.length)) + 4;
    console.log(
      [
        `┌${"─".repeat(width)}┐`,
        ...lines.map((l) => `│  ${l.padEnd(width - 2)}│`),
        `└${"─".repeat(width)}┘`,
      ].join("\n")
    );
  });

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && maxRetries > 0) {
      console.log(`[Deck] Port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1, maxRetries - 1);
    } else {
      console.error(`[Deck] Failed to start server:`, err.message);
      process.exit(1);
    }
  });
}

tryListen(PORT);

// ─── Graceful Shutdown ─────────────────────────────

function gracefulShutdown(signal: string): void {
  console.log(`\n[Deck] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    deckManager.dispose();
    workflowExecutor.dispose();
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
