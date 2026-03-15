import React, { useState, useEffect, useCallback } from "react";
import { AgentGrid } from "./AgentGrid";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { CostPanel } from "./CostPanel";
import { ActivityFeed } from "./ActivityFeed";
import { TeamConfig } from "./TeamConfig";
import { SessionHistory } from "./SessionHistory";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

const API_BASE = "/api/deck";
const IDLE_THRESHOLD_MS = 300_000; // 5 minutes
const BUDGET_ALERT_USD = 5.0;

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
  session_id?: string | null;
  runtime?: RuntimeType;
}

interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

interface DeckEvent {
  id: number;
  agent_id: string;
  agent_name?: string;
  event_type: string;
  tool_name: string | null;
  content: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

interface CostSummary {
  total_cost_usd: number;
  today_cost_usd: number;
  active_agents: number;
  by_agent: Array<{
    agent_id: string;
    agent_name: string;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  time_series?: Array<{ hour: string; cost: number }>;
  estimates?: Array<{
    agentId: string;
    model: string;
    estimatedCostUsd: number;
    estimatedOutputTokens: number;
    isEstimate: boolean;
    costPerMinute: number;
  }>;
}

interface TeamConfigData {
  id: string;
  name: string;
  description: string;
  config_json: string;
  created_at: string;
  updated_at: string;
  source?: "db" | "file";
}

type SidePanel = "cost" | "teams" | "sessions" | null;

interface DeckViewProps {
  sendJsonMessage: (msg: any) => void;
  lastJsonMessage: any;
  isConnected: boolean;
}

export function DeckView({
  sendJsonMessage,
  lastJsonMessage,
  isConnected,
}: DeckViewProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<DeckEvent[]>([]);
  const [costData, setCostData] = useState<CostSummary | null>(null);
  const [teams, setTeams] = useState<TeamConfigData[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [feedCollapsed, setFeedCollapsed] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [spawnName, setSpawnName] = useState("");
  const [spawnPrompt, setSpawnPrompt] = useState("");
  const [spawnModel, setSpawnModel] = useState("sonnet");
  const [spawnWorkspace, setSpawnWorkspace] = useState("");
  const [spawnInteractive, setSpawnInteractive] = useState(false);
  const [spawnRuntime, setSpawnRuntime] = useState<RuntimeType>("claude-code");
  const [newOutputAgentId, setNewOutputAgentId] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<Map<string, ContextUsage>>(new Map());

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCloseDetail: () => setDetailAgentId(null),
    onOpenSpawn: () => setShowSpawnDialog(true),
    onSelectAgent: (index) => {
      if (agents[index]) {
        setDetailAgentId(agents[index].id);
      }
    },
  });

  // Subscribe to deck updates via WebSocket
  useEffect(() => {
    if (isConnected) {
      sendJsonMessage({ type: "deck:subscribe" });
    }
  }, [isConnected, sendJsonMessage]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastJsonMessage) return;

    switch (lastJsonMessage.type) {
      case "deck:agents:list":
        setAgents(lastJsonMessage.agents);
        break;

      case "deck:agent:status":
        setAgents((prev) => {
          const idx = prev.findIndex(
            (a) => a.id === lastJsonMessage.agent.id
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = lastJsonMessage.agent;
            return next;
          }
          return [lastJsonMessage.agent, ...prev];
        });
        break;

      case "deck:agent:event":
        setEvents((prev) => [lastJsonMessage.event, ...prev].slice(0, 500));
        break;

      case "deck:agent:output": {
        // Forward to detail panel handler
        const handler = (window as any).__agentDetailHandler;
        if (handler) {
          handler(lastJsonMessage.event);
        }
        // Pulse animation: mark which agent got new output
        setNewOutputAgentId(lastJsonMessage.agentId);
        setTimeout(() => setNewOutputAgentId(null), 1000);
        break;
      }

      case "deck:agent:cost": {
        // Update cost data from real-time estimates
        if (costData) {
          setCostData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              estimates: (prev.estimates || []).map((e) =>
                e.agentId === lastJsonMessage.agentId
                  ? lastJsonMessage.estimate
                  : e
              ),
            };
          });
        }
        break;
      }

      case "deck:agent:context": {
        setContextUsage((prev) => {
          const next = new Map(prev);
          next.set(lastJsonMessage.agentId, lastJsonMessage.context);
          return next;
        });
        break;
      }
    }
  }, [lastJsonMessage]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, costRes, teamsRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/agents`),
        fetch(`${API_BASE}/cost`),
        fetch(`${API_BASE}/teams`),
        fetch(`${API_BASE}/events?limit=100`),
      ]);
      setAgents(await agentsRes.json());
      setCostData(await costRes.json());
      setTeams(await teamsRes.json());
      setEvents(await eventsRes.json());
    } catch (err) {
      console.error("Failed to fetch deck data:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh cost every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/cost`);
        setCostData(await res.json());
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Actions
  const handleSpawn = async () => {
    if (!spawnName.trim() || !spawnPrompt.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: spawnName,
          prompt: spawnPrompt,
          model: spawnModel,
          workspace: spawnWorkspace || undefined,
          interactive: spawnInteractive,
          runtime: spawnRuntime,
        }),
      });
      if (res.ok) {
        const agent = await res.json();
        setAgents((prev) => [agent, ...prev]);
        setShowSpawnDialog(false);
        setSpawnName("");
        setSpawnPrompt("");
        setSpawnModel("sonnet");
        setSpawnWorkspace("");
        setSpawnInteractive(false);
        setSpawnRuntime("claude-code");
      }
    } catch (err) {
      console.error("Failed to spawn agent:", err);
    }
  };

  const handleKill = async (id: string) => {
    try {
      await fetch(`${API_BASE}/agents/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to kill agent:", err);
    }
  };

  const handleToggleVisibility = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCardClick = (id: string) => {
    setDetailAgentId(id);
  };

  // Team actions
  const handleSaveTeam = async (
    name: string,
    description: string,
    configJson: string
  ) => {
    try {
      const res = await fetch(`${API_BASE}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, config_json: configJson }),
      });
      if (res.ok) {
        const team = await res.json();
        setTeams((prev) => [team, ...prev]);
      }
    } catch (err) {
      console.error("Failed to save team:", err);
    }
  };

  const handleUpdateTeam = async (
    id: string,
    name: string,
    description: string,
    configJson: string
  ) => {
    try {
      await fetch(`${API_BASE}/teams/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, config_json: configJson }),
      });
      setTeams((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                name,
                description,
                config_json: configJson,
                updated_at: new Date().toISOString(),
              }
            : t
        )
      );
    } catch (err) {
      console.error("Failed to update team:", err);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await fetch(`${API_BASE}/teams/${id}`, { method: "DELETE" });
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete team:", err);
    }
  };

  const handleReloadTeamYaml = async () => {
    try {
      const res = await fetch(`${API_BASE}/teams/reload`, { method: "POST" });
      if (res.ok) {
        // Re-fetch teams to get updated list
        const teamsRes = await fetch(`${API_BASE}/teams`);
        setTeams(await teamsRes.json());
      }
    } catch (err) {
      console.error("Failed to reload YAML teams:", err);
    }
  };

  const handleLaunchTeam = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/teams/${id}/launch`, {
        method: "POST",
      });
      if (res.ok) {
        const newAgents = await res.json();
        setAgents((prev) => [...newAgents, ...prev]);
      }
    } catch (err) {
      console.error("Failed to launch team:", err);
    }
  };

  const activeCount = agents.filter(
    (a) => a.status === "running" || a.status === "idle"
  ).length;
  const totalCost = agents.reduce((sum, a) => sum + a.total_cost_usd, 0);
  const detailAgent = detailAgentId
    ? agents.find((a) => a.id === detailAgentId) || null
    : null;

  return (
    <div className="flex-1 flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-800">Agent Deck</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>
              {activeCount}/{agents.length} active
            </span>
            <span className="font-mono">${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setSidePanel(sidePanel === "cost" ? null : "cost")
            }
            className={`text-xs px-2.5 py-1.5 rounded border ${
              sidePanel === "cost"
                ? "bg-blue-50 border-blue-300 text-blue-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Cost
          </button>
          <button
            onClick={() =>
              setSidePanel(sidePanel === "teams" ? null : "teams")
            }
            className={`text-xs px-2.5 py-1.5 rounded border ${
              sidePanel === "teams"
                ? "bg-blue-50 border-blue-300 text-blue-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Teams
          </button>
          <button
            onClick={() =>
              setSidePanel(sidePanel === "sessions" ? null : "sessions")
            }
            className={`text-xs px-2.5 py-1.5 rounded border ${
              sidePanel === "sessions"
                ? "bg-blue-50 border-blue-300 text-blue-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            History
          </button>
          <button
            onClick={() => setShowSpawnDialog(true)}
            className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            + Launch Agent
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Agent grid */}
        <div className="flex-1 overflow-y-auto">
          <AgentGrid
            agents={agents}
            hiddenIds={hiddenIds}
            idleThresholdMs={IDLE_THRESHOLD_MS}
            selectedAgentId={selectedAgentId}
            onToggleVisibility={handleToggleVisibility}
            onKill={handleKill}
            onSelect={handleCardClick}
            newOutputAgentId={newOutputAgentId}
            contextUsage={contextUsage}
          />
        </div>

        {/* Detail panel (slide-over) */}
        {detailAgent && (
          <div className="w-[60%] max-w-[800px] min-w-[400px] shrink-0 animate-slide-in">
            <AgentDetailPanel
              agent={detailAgent}
              sendJsonMessage={sendJsonMessage}
              onClose={() => setDetailAgentId(null)}
              contextUsage={contextUsage.get(detailAgent.id)}
            />
          </div>
        )}

        {/* Side panel (when no detail panel) */}
        {!detailAgent && sidePanel && (
          <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto shrink-0">
            {sidePanel === "cost" && (
              <CostPanel cost={costData} budgetAlert={BUDGET_ALERT_USD} />
            )}
            {sidePanel === "teams" && (
              <TeamConfig
                teams={teams}
                onSave={handleSaveTeam}
                onUpdate={handleUpdateTeam}
                onDelete={handleDeleteTeam}
                onLaunch={handleLaunchTeam}
                onReloadYaml={handleReloadTeamYaml}
              />
            )}
            {sidePanel === "sessions" && (
              <SessionHistory
                onResumeSession={() => {
                  fetchData(); // Refresh after resume
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Activity feed */}
      <ActivityFeed
        events={events}
        selectedAgentId={selectedAgentId}
        isCollapsed={feedCollapsed}
        onToggleCollapse={() => setFeedCollapsed(!feedCollapsed)}
      />

      {/* Spawn dialog */}
      {showSpawnDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[480px] p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">
              Launch Agent
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={spawnName}
                  onChange={(e) => setSpawnName(e.target.value)}
                  placeholder="e.g., builder, reviewer, researcher"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Prompt
                </label>
                <textarea
                  value={spawnPrompt}
                  onChange={(e) => setSpawnPrompt(e.target.value)}
                  placeholder="What should this agent do?"
                  rows={4}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-300 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Runtime
                  </label>
                  <select
                    value={spawnRuntime}
                    onChange={(e) => setSpawnRuntime(e.target.value as RuntimeType)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex</option>
                    <option value="gemini-cli">Gemini CLI</option>
                    <option value="litellm">LiteLLM Proxy</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Model
                  </label>
                  <select
                    value={spawnModel}
                    onChange={(e) => setSpawnModel(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
                  >
                    <option value="haiku">Haiku 4.5</option>
                    <option value="sonnet">Sonnet 4.6</option>
                    <option value="opus">Opus 4.6</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Workspace (optional)
                  </label>
                  <input
                    type="text"
                    value={spawnWorkspace}
                    onChange={(e) => setSpawnWorkspace(e.target.value)}
                    placeholder="/path/to/project"
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="interactive-mode"
                  checked={spawnInteractive}
                  onChange={(e) => setSpawnInteractive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="interactive-mode" className="text-xs text-gray-600">
                  Interactive mode (keep stdin open for follow-up messages)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowSpawnDialog(false)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSpawn}
                disabled={!spawnName.trim() || !spawnPrompt.trim()}
                className="text-xs px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
              >
                Launch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
