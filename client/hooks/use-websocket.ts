import { useCallback, useEffect, useRef } from "react";
import { useDeckStore } from "../stores/deck-store";

const WS_URL = `ws://${window.location.hostname}:${window.location.port || "3002"}/ws`;
const RECONNECT_INTERVAL_MS = 3000;

export function useDeckWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);

  // Messages sent while disconnected are queued and flushed on (re)connect
  const sendJsonMessage = useCallback((msg: unknown) => {
    const data = JSON.stringify(msg);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    } else {
      queueRef.current.push(data);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      // Subscribe on connect
      ws.onopen = () => {
        useDeckStore.getState().setConnected(true);
        ws.send(JSON.stringify({ type: "deck:subscribe" }));
        for (const data of queueRef.current.splice(0)) ws.send(data);
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        routeMessage(msg, sendJsonMessage);
      };

      ws.onclose = () => {
        useDeckStore.getState().setConnected(false);
        if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sendJsonMessage]);

  return { sendJsonMessage };
}

// Route messages to store
function routeMessage(msg: any, sendJsonMessage: (msg: unknown) => void): void {
  const store = useDeckStore.getState();

  switch (msg.type) {
    case "deck:agents:list":
      store.setAgents(msg.agents);
      break;

    case "deck:agent:status":
      store.updateAgent(msg.agent);
      break;

    case "deck:agent:output":
      store.pushOutputEvent(msg.agentId, msg.event);
      break;

    case "deck:agent:context":
      store.setContextUsage(msg.agentId, msg.context);
      break;

    case "deck:workflow:status":
      store.setActiveWorkflow(msg.workflow);
      if (msg.workflow.status === "finalizing") {
        store.setMode("finalizing");
      } else if (
        ["completed", "failed", "cancelled"].includes(msg.workflow.status)
      ) {
        store.setMode("completed");
      }
      break;

    case "deck:workflow:node":
      store.updateWorkflowNode(msg.workflowId, msg.node);
      if (msg.node.status === "running" && msg.node.agentId) {
        sendJsonMessage({
          type: "deck:agent:focus",
          agentId: msg.node.agentId,
        });
      }
      break;

    case "error":
      store.addToast(msg.error);
      break;
  }
}
