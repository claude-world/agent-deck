/**
 * Agent Deck v1.0 - WebSocket Module
 *
 * Extracted WS logic: subscribers, message routing, heartbeat.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { DeckManager } from "./deck/deck-manager.js";
import type { WorkflowExecutor } from "./deck/workflow-executor.js";
import type { Agent, StreamEvent, WorkflowState, NodeState } from "./core/types.js";

interface WSClient extends WebSocket {
  isAlive?: boolean;
  focusedAgentIds?: Set<string>;
}

export function createWebSocketServer(
  server: Server,
  deckManager: DeckManager,
  workflowExecutor: WorkflowExecutor
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const subscribers = new Set<WSClient>();

  // ─── Forward deck events ─────────────────────────

  deckManager.on("agent:status", (agent: Agent) => {
    broadcast(subscribers, { type: "deck:agent:status", agent });
  });

  deckManager.on("agent:event", (agentId: string, event: any) => {
    broadcast(subscribers, { type: "deck:agent:event", agentId, event });
  });

  deckManager.on("agent:stream", (agentId: string, streamEvent: StreamEvent) => {
    const msg = JSON.stringify({ type: "deck:agent:output", agentId, event: streamEvent });
    for (const ws of subscribers) {
      if (ws.readyState === 1 && ws.focusedAgentIds?.has(agentId)) {
        ws.send(msg);
      }
    }
  });

  deckManager.on("agent:cost", (agentId: string, estimate: any) => {
    broadcast(subscribers, { type: "deck:agent:cost", agentId, estimate });
  });

  deckManager.on("agent:context", (agentId: string, context: any) => {
    broadcast(subscribers, { type: "deck:agent:context", agentId, context });
  });

  workflowExecutor.on("workflow:status", (workflow: WorkflowState) => {
    broadcast(subscribers, { type: "deck:workflow:status", workflow });
  });

  workflowExecutor.on("workflow:node", (workflowId: string, node: NodeState) => {
    broadcast(subscribers, { type: "deck:workflow:node", workflowId, node });
  });

  // ─── Connection handling ─────────────────────────

  wss.on("connection", (ws: WSClient) => {
    ws.isAlive = true;
    ws.focusedAgentIds = new Set();

    ws.send(JSON.stringify({ type: "connected", message: "Agent Deck v1.0" }));

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message, subscribers, deckManager);
      } catch (error) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      subscribers.delete(ws);
    });
  });

  // ─── Heartbeat ───────────────────────────────────

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WSClient;
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

function handleMessage(
  ws: WSClient,
  message: any,
  subscribers: Set<WSClient>,
  deckManager: DeckManager
): void {
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
    case "deck:agent:kill":
      deckManager.killAgent(message.agentId);
      break;
    case "deck:agent:input":
      try {
        deckManager.sendInput(message.agentId, message.text);
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", error: err.message }));
      }
      break;
    case "deck:agent:focus":
      ws.focusedAgentIds?.add(message.agentId);
      break;
    case "deck:agent:unfocus":
      ws.focusedAgentIds?.delete(message.agentId);
      break;
    default:
      break;
  }
}

function broadcast(subscribers: Set<WSClient>, data: any): void {
  const msg = JSON.stringify(data);
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
}
