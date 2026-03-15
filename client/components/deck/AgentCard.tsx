import React from "react";

type RuntimeType = "claude-code" | "codex" | "gemini-cli" | "litellm";

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
  runtime?: RuntimeType;
}

interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

interface AgentCardProps {
  agent: Agent;
  isVisible: boolean;
  idleThresholdMs: number;
  onToggleVisibility: (id: string) => void;
  onKill: (id: string) => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
  hasNewOutput?: boolean;
  contextUsage?: ContextUsage;
}

function StatusDot({ status, isIdle }: { status: string; isIdle: boolean }) {
  if (status === "running" && !isIdle) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  if (status === "idle" || isIdle) {
    return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />;
  }
  if (status === "completed") {
    return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />;
  }
  // dead
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />;
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt + "Z").getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function getIdleDuration(lastEventAt: string | null): number {
  if (!lastEventAt) return 0;
  return Date.now() - new Date(lastEventAt + "Z").getTime();
}

function ContextBar({ usage }: { usage: ContextUsage }) {
  const pct = Math.min(usage.percentage, 100);
  let barColor = "bg-green-500";
  if (pct >= 90) barColor = "bg-red-500";
  else if (pct >= 70) barColor = "bg-amber-500";

  const usedK = (usage.usedTokens / 1000).toFixed(0);
  const maxK = (usage.maxTokens / 1000).toFixed(0);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
        <span>Context</span>
        <span>{usedK}K / {maxK}K</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AgentCard({
  agent,
  isVisible,
  idleThresholdMs,
  onToggleVisibility,
  onKill,
  onSelect,
  isSelected,
  hasNewOutput,
  contextUsage,
}: AgentCardProps) {
  const isIdle =
    agent.status === "running" &&
    agent.last_event_at &&
    getIdleDuration(agent.last_event_at) > idleThresholdMs;

  const isActive = agent.status === "running" || agent.status === "idle";

  return (
    <div
      onClick={() => onSelect(agent.id)}
      className={`
        rounded-lg border p-4 cursor-pointer transition-all
        ${isSelected ? "ring-2 ring-blue-500 border-blue-300" : "border-gray-200 hover:border-gray-300"}
        ${isIdle ? "bg-amber-50/50" : "bg-white"}
        ${!isVisible ? "opacity-40" : ""}
        ${hasNewOutput ? "ring-1 ring-blue-400/50 animate-pulse-once" : ""}
      `}
    >
      {/* Header: status dot + name + actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={agent.status} isIdle={!!isIdle} />
          <span className="font-medium text-sm text-gray-900 truncate">
            {agent.name}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
            {agent.agent_type}
          </span>
          {agent.runtime && agent.runtime !== "claude-code" && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
              agent.runtime === "litellm" ? "bg-emerald-100 text-emerald-600" :
              agent.runtime === "codex" ? "bg-orange-100 text-orange-600" :
              "bg-cyan-100 text-cyan-600"
            }`}>
              {agent.runtime === "litellm" ? "LiteLLM" :
               agent.runtime === "codex" ? "Codex" :
               agent.runtime === "gemini-cli" ? "Gemini" : agent.runtime}
            </span>
          )}
          {agent.interactive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 shrink-0">
              interactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Visibility toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(agent.id);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title={isVisible ? "Hide" : "Show"}
          >
            {isVisible ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </button>
          {/* Kill */}
          {isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKill(agent.id);
              }}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
              title="Kill agent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-gray-400">Tokens</div>
          <div className="text-gray-700 font-mono">
            {formatTokens(agent.total_input_tokens + agent.total_output_tokens)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Cost</div>
          <div className="text-gray-700 font-mono">
            {formatCost(agent.total_cost_usd)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Uptime</div>
          <div className="text-gray-700 font-mono">
            {formatDuration(agent.started_at)}
          </div>
        </div>
      </div>

      {/* Context window progress bar */}
      {contextUsage && isActive && (
        <ContextBar usage={contextUsage} />
      )}

      {/* Prompt preview */}
      <div className="mt-2 text-[10px] text-gray-400 truncate">
        {agent.prompt.slice(0, 80)}{agent.prompt.length > 80 ? "..." : ""}
      </div>

      {/* Model + idle indicator */}
      <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
        <span className="font-mono">{agent.model}</span>
        {isIdle && (
          <span className="text-amber-600 font-medium">
            idle {formatDuration(agent.last_event_at!)}
          </span>
        )}
      </div>
    </div>
  );
}
