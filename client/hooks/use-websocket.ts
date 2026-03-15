import { useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { useDeckStore } from "../stores/deck-store";

const WS_URL = `ws://${window.location.hostname}:${window.location.port || "3002"}/ws`;

export function useDeckWebSocket() {
  const store = useDeckStore();
  const { sendJsonMessage, readyState, lastJsonMessage } = useWebSocket(
    WS_URL,
    {
      shouldReconnect: () => true,
      reconnectAttempts: Infinity,
      reconnectInterval: 3000,
    }
  );

  // Subscribe on connect
  useEffect(() => {
    store.setConnected(readyState === ReadyState.OPEN);
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage({ type: "deck:subscribe" });
    }
  }, [readyState]);

  // Route messages to store
  useEffect(() => {
    if (!lastJsonMessage) return;
    const msg = lastJsonMessage as any;

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
  }, [lastJsonMessage]);

  return { sendJsonMessage, readyState };
}
