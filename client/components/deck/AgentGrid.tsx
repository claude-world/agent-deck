import React from "react";
import { AgentCard } from "./AgentCard";

interface Agent {
  id: string;
  name: string;
  agent_type: string;
  status: "running" | "idle" | "dead" | "completed";
  model: string;
  prompt: string;
  started_at: string;
  last_event_at: string | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  visible: boolean;
  interactive?: boolean;
}

interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

interface AgentGridProps {
  agents: Agent[];
  hiddenIds: Set<string>;
  idleThresholdMs: number;
  selectedAgentId: string | null;
  onToggleVisibility: (id: string) => void;
  onKill: (id: string) => void;
  onSelect: (id: string) => void;
  newOutputAgentId?: string | null;
  contextUsage?: Map<string, ContextUsage>;
}

export function AgentGrid({
  agents,
  hiddenIds,
  idleThresholdMs,
  selectedAgentId,
  onToggleVisibility,
  onKill,
  onSelect,
  newOutputAgentId,
  contextUsage,
}: AgentGridProps) {
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">No agents running</p>
          <p className="text-xs mt-1">Click "+ Launch Agent" or press Cmd+N to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 p-4">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isVisible={!hiddenIds.has(agent.id)}
          idleThresholdMs={idleThresholdMs}
          onToggleVisibility={onToggleVisibility}
          onKill={onKill}
          onSelect={onSelect}
          isSelected={selectedAgentId === agent.id}
          hasNewOutput={newOutputAgentId === agent.id}
          contextUsage={contextUsage?.get(agent.id)}
        />
      ))}
    </div>
  );
}
