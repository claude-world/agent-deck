/**
 * Agent Deck v1.0 - Server Entry Point
 *
 * Express + WebSocket server with graceful shutdown and auto port.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import db from "./core/db.js";
import { DeckStore } from "./core/db.js";
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
app.use(cors());
app.use(express.json());

// ─── Core Services ─────────────────────────────────

const deckManager = new DeckManager(db);

const sessionRecovery = new SessionRecovery(deckManager.getStore());
sessionRecovery.setDeckManager(deckManager);
sessionRecovery.registerShutdownHandlers();

const workflowExecutor = new WorkflowExecutor(deckManager);

// Workspace manager
const coreStore = new DeckStore(db);
const workspaceManager = new WorkspaceManager(coreStore);

// Auto-add cwd as workspace on startup
try { workspaceManager.add(process.cwd()); } catch {}

// ─── REST Routes ───────────────────────────────────

app.use("/api/deck", createDeckRouter(deckManager, workflowExecutor, workspaceManager));
app.use("/api/deck/workspaces", createWorkspaceRouter(workspaceManager));

// Serve static files (production)
app.use(express.static(path.join(__dirname, "../dist")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
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
const teamConfigDir = path.join(__dirname, "../team-configs");
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

// Start server with auto port fallback
function tryListen(port: number, maxRetries = 5): void {
  server.listen(port, () => {
    console.log(`
  ┌─────────────────────────────────┐
  │  Agent Deck v1.0                │
  │  http://localhost:${port}          │
  │  WebSocket: ws://localhost:${port}/ws│
  │  Dev: http://localhost:5200     │
  └─────────────────────────────────┘
    `.trim());
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
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
