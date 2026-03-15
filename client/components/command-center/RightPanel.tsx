/**
 * RightPanel - Slides in from right when a node is selected.
 * Three tabs: Config, Live, Output.
 */

import { useState } from "react";
import { useDeckStore } from "../../stores/deck-store";
import { StatusDot } from "../shared/StatusDot";
import { ConfigTab } from "./ConfigTab";
import { LiveTab } from "./LiveTab";
import { OutputTab } from "./OutputTab";

type Tab = "config" | "live" | "output";

interface RightPanelProps {
  sendJsonMessage: (msg: any) => void;
}

export function RightPanel({ sendJsonMessage }: RightPanelProps) {
  const { selectedAgentId, agents, activeWorkflow, contextUsage } =
    useDeckStore();
  const [activeTab, setActiveTab] = useState<Tab>("live");

  if (!selectedAgentId) return null;

  // Find agent info - either from agents list or workflow nodes
  const agent = agents.find((a) => a.id === selectedAgentId);
  const workflowNode = activeWorkflow
    ? Object.values(activeWorkflow.nodes).find(
        (n) => n.agentName === selectedAgentId || n.agentId === selectedAgentId
      )
    : null;

  const displayName =
    agent?.name || workflowNode?.agentName || selectedAgentId;
  const displayStatus =
    agent?.status || workflowNode?.status || "pending";
  const displayModel = agent?.model || workflowNode?.config?.model || "sonnet";
  const ctx = agent ? contextUsage[agent.id] : undefined;

  const tabs: { key: Tab; label: string }[] = [
    { key: "config", label: "Config" },
    { key: "live", label: "Live" },
    { key: "output", label: "Output" },
  ];

  return (
    <div className="w-[380px] shrink-0 border-l border-deck-border bg-deck-surface flex flex-col h-full animate-slide-in">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-deck-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={displayStatus} />
          <span className="font-medium text-sm text-deck-text-bright truncate">
            {displayName}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-muted">
            {displayModel}
          </span>
        </div>
        <button
          onClick={() => useDeckStore.getState().setSelectedAgentId(null)}
          className="p-1 rounded hover:bg-deck-surface-2 text-deck-muted hover:text-deck-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-deck-border px-4 flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-deck-accent text-deck-accent"
                : "border-transparent text-deck-muted hover:text-deck-text-dim"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "config" && (
          <ConfigTab
            agent={agent}
            workflowNode={workflowNode}
          />
        )}
        {activeTab === "live" && (
          <LiveTab
            agentId={agent?.id || workflowNode?.agentId || null}
            sendJsonMessage={sendJsonMessage}
          />
        )}
        {activeTab === "output" && (
          <OutputTab
            agentId={agent?.id || workflowNode?.agentId || null}
          />
        )}
      </div>

      {/* Context bar */}
      {ctx && (
        <div className="shrink-0 px-4 py-2 border-t border-deck-border">
          <div className="flex items-center justify-between text-[10px] text-deck-text-dim mb-0.5">
            <span>Context</span>
            <span className="font-mono">
              {(ctx.usedTokens / 1000).toFixed(0)}K /{" "}
              {(ctx.maxTokens / 1000).toFixed(0)}K
            </span>
          </div>
          <div className="h-1 bg-deck-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                ctx.percentage >= 90
                  ? "bg-deck-error"
                  : ctx.percentage >= 70
                    ? "bg-deck-warning"
                    : "bg-deck-success"
              }`}
              style={{ width: `${Math.min(ctx.percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
