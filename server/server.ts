import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";
import { DeckManager } from "./deck/deck-manager.js";
import { SessionRecovery } from "./deck/session-recovery.js";
import { LiteLLMBridge } from "./deck/litellm-bridge.js";
import { loadTeamConfigs, fileConfigsToMap } from "./deck/team-file-loader.js";
import { WorkflowExecutor } from "./deck/workflow-executor.js";
import { createDeckRouter } from "./routes/deck.js";
import type { DeckAgent, StreamEvent, WorkflowState, NodeState } from "./deck/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3002;

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Deck Manager
const deckManager = new DeckManager(db);

// Initialize Session Recovery
const sessionRecovery = new SessionRecovery(deckManager.getStore());
sessionRecovery.setDeckManager(deckManager);
sessionRecovery.registerShutdownHandlers();

// Initialize Workflow Executor
const workflowExecutor = new WorkflowExecutor(deckManager);

// REST API
app.use("/api/deck", createDeckRouter(deckManager, workflowExecutor));

// Serve static files (production)
app.use(express.static(path.join(__dirname, "../dist")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

// WebSocket subscribers
interface WSClient extends WebSocket {
  isAlive?: boolean;
  focusedAgentIds?: Set<string>;
}

const subscribers = new Set<WSClient>();

// Forward deck events to subscribers
deckManager.on("agent:status", (agent: DeckAgent) => {
  const msg = JSON.stringify({ type: "deck:agent:status", agent });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

deckManager.on("agent:event", (agentId: string, event: any) => {
  const msg = JSON.stringify({ type: "deck:agent:event", agentId, event });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

// Only send full stream output to clients that have focused this agent
deckManager.on("agent:stream", (agentId: string, streamEvent: StreamEvent) => {
  const msg = JSON.stringify({
    type: "deck:agent:output",
    agentId,
    event: streamEvent,
  });
  for (const ws of subscribers) {
    if (ws.readyState === 1 && ws.focusedAgentIds?.has(agentId)) {
      ws.send(msg);
    }
  }
});

// Broadcast cost estimates to all subscribers
deckManager.on("agent:cost", (agentId: string, estimate: any) => {
  const msg = JSON.stringify({
    type: "deck:agent:cost",
    agentId,
    estimate,
  });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

// Broadcast context usage to all subscribers
deckManager.on("agent:context", (agentId: string, context: any) => {
  const msg = JSON.stringify({
    type: "deck:agent:context",
    agentId,
    context,
  });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

// Forward workflow events to subscribers
workflowExecutor.on("workflow:status", (workflow: WorkflowState) => {
  const msg = JSON.stringify({ type: "deck:workflow:status", workflow });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

workflowExecutor.on("workflow:node", (workflowId: string, node: NodeState) => {
  const msg = JSON.stringify({ type: "deck:workflow:node", workflowId, node });
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

// Create HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WSClient) => {
  console.log("Client connected");
  ws.isAlive = true;
  ws.focusedAgentIds = new Set();

  ws.send(JSON.stringify({ type: "connected", message: "Agent Deck" }));

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "deck:subscribe": {
          subscribers.add(ws);
          const agents = deckManager.getAgents();
          ws.send(JSON.stringify({ type: "deck:agents:list", agents }));
          break;
        }

        case "deck:agent:spawn": {
          try {
            const agent = deckManager.spawnAgent(message.config);
            ws.send(JSON.stringify({ type: "deck:agent:status", agent }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", error: err.message }));
          }
          break;
        }

        case "deck:agent:kill": {
          deckManager.killAgent(message.agentId);
          break;
        }

        case "deck:agent:input": {
          try {
            deckManager.sendInput(message.agentId, message.text);
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", error: err.message }));
          }
          break;
        }

        case "deck:agent:focus": {
          ws.focusedAgentIds?.add(message.agentId);
          break;
        }

        case "deck:agent:unfocus": {
          ws.focusedAgentIds?.delete(message.agentId);
          break;
        }

        default:
          console.warn("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
    }
  });

  ws.on("close", () => {
    subscribers.delete(ws);
    console.log("Client disconnected");
  });
});

// Heartbeat
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    const client = ws as WSClient;
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

// Log crashed sessions on startup
const crashed = sessionRecovery.getCrashedSessions();
if (crashed.length > 0) {
  console.log(`[Deck] Found ${crashed.length} crashed/shutdown sessions (resumable)`);
}

// Load YAML team configs
const teamConfigDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../team-configs");
loadTeamConfigs(teamConfigDir).then((configs) => {
  if (configs.length > 0) {
    deckManager.setFileTeamConfigs(fileConfigsToMap(configs));
    console.log(`[Deck] Loaded ${configs.length} YAML team configs from ${teamConfigDir}`);
  }
}).catch((err) => {
  console.warn(`[Deck] Failed to load YAML team configs:`, err.message);
});

// Check LiteLLM availability
const litellmBridge = new LiteLLMBridge();
if (litellmBridge.isEnabled()) {
  litellmBridge.checkAvailability().then((available) => {
    if (available) {
      console.log(`[Deck] LiteLLM proxy available at ${litellmBridge.getProxyUrl()}`);
    } else {
      console.log(`[Deck] LiteLLM proxy configured but not reachable at ${litellmBridge.getProxyUrl()}`);
    }
  });
}

// Start
server.listen(PORT, () => {
  console.log(`Agent Deck running at http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`Dev frontend at http://localhost:5200`);
});
