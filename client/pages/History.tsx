/**
 * History - Dual-pane layout: project list (left) + mission timeline (right).
 * Missions grouped by date with task goal, outcome, commit info, and expandable agent breakdown.
 */

import { useState, useEffect, useCallback } from "react";
import { StatusDot } from "../components/shared/StatusDot";
import { CostBadge } from "../components/shared/CostBadge";
import { useDeckStore } from "../stores/deck-store";

const API_BASE = "/api/deck";

interface WorkflowRecord {
  id: string;
  name: string;
  config_json: string;
  status: string;
  total_cost: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: string;
  workspace_id: string | null;
  commit_hash: string | null;
  commit_message: string | null;
  pushed: number;
  max_budget_usd: number;
  changes_json: string | null;
  pr_url: string | null;
}

interface ChangedFileEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

function parseChanges(changesJson: string | null): ChangedFileEntry[] {
  if (!changesJson) return [];
  try {
    const parsed = JSON.parse(changesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface WorkflowNode {
  agent_name: string;
  config_json: string;
  status: string;
  cost: number;
  error: string | null;
}

interface WorkflowDetail extends WorkflowRecord {
  nodes: WorkflowNode[];
}

interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
}

interface PlannedAgent {
  name: string;
  task: string;
  role?: string;
  model: string;
  dependsOn: string[];
}

function parsePlan(configJson: string): { agents: PlannedAgent[] } | null {
  try {
    const plan = JSON.parse(configJson);
    if (plan?.agents && Array.isArray(plan.agents)) return plan;
  } catch {}
  return null;
}

export function History() {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { setPage, setActiveWorkspaceId } = useDeckStore();

  // Fetch workspaces
  useEffect(() => {
    fetch(`${API_BASE}/workspaces`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  // Fetch workflows for selected workspace (or all)
  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = selectedWorkspace ? `?workspaceId=${selectedWorkspace}` : "";
      const res = await fetch(`${API_BASE}/history${qs}`);
      if (res.ok) setWorkflows(await res.json());
    } catch {}
    setLoading(false);
  }, [selectedWorkspace]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Load detail when expanded (with race protection)
  useEffect(() => {
    if (!expandedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/history/${expandedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
  }, [expandedId]);

  function groupByDate(items: WorkflowRecord[]): Array<{ label: string; items: WorkflowRecord[] }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, WorkflowRecord[]> = {};

    for (const wf of items) {
      const ts = wf.started_at || new Date(wf.created_at + "Z").getTime();
      const d = new Date(ts);
      let label: string;

      if (d >= today) label = "Today";
      else if (d >= yesterday) label = "Yesterday";
      else if (d >= weekAgo) label = "This Week";
      else label = d.toLocaleDateString();

      if (!groups[label]) groups[label] = [];
      groups[label].push(wf);
    }

    const order = ["Today", "Yesterday", "This Week"];
    return Object.entries(groups)
      .sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return b.localeCompare(a);
      })
      .map(([label, items]) => ({ label, items }));
  }

  function formatTime(ts: number | string | null) {
    if (!ts) return "";
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts + "Z");
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDuration(start: number | null, end: number | null) {
    if (!start) return "";
    const ms = (end || Date.now()) - start;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function getOutcomeSummary(plan: { agents: PlannedAgent[] } | null, nodes?: WorkflowNode[]): string {
    if (!nodes || nodes.length === 0) {
      return plan ? `${plan.agents.length} agents planned` : "";
    }
    const success = nodes.filter((n) => n.status === "success").length;
    const failed = nodes.filter((n) => n.status === "failed").length;
    const total = nodes.length;
    if (failed > 0) return `${success}/${total} agents succeeded, ${failed} failed`;
    if (success === total) return `${total} agents completed successfully`;
    return `${success}/${total} agents completed`;
  }

  function getAgentTask(agentName: string, plan: { agents: PlannedAgent[] } | null, node?: WorkflowNode): string {
    // Try from node's own config_json first
    if (node?.config_json) {
      try {
        const cfg = JSON.parse(node.config_json);
        if (cfg.prompt) return cfg.prompt;
      } catch {}
    }
    // Fall back to plan
    if (plan) {
      const agent = plan.agents.find((a) => a.name === agentName);
      if (agent) return agent.task;
    }
    return "";
  }

  function getAgentRole(agentName: string, plan: { agents: PlannedAgent[] } | null): string {
    if (!plan) return "";
    const agent = plan.agents.find((a) => a.name === agentName);
    return agent?.role || "";
  }

  const grouped = groupByDate(workflows);

  return (
    <div className="flex h-full">
      {/* Left: Workspace list */}
      <div className="w-[200px] shrink-0 border-r border-deck-border bg-deck-surface overflow-y-auto">
        <div className="px-3 py-3">
          <span className="text-[10px] uppercase text-deck-muted font-medium">Projects</span>
        </div>

        {/* All */}
        <button
          onClick={() => setSelectedWorkspace(null)}
          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
            selectedWorkspace === null
              ? "bg-deck-surface-2 text-deck-text-bright"
              : "text-deck-text-dim hover:bg-deck-surface-2/50"
          }`}
        >
          All Projects
        </button>

        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setSelectedWorkspace(ws.id)}
            className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${
              selectedWorkspace === ws.id
                ? "bg-deck-surface-2 text-deck-text-bright"
                : "text-deck-text-dim hover:bg-deck-surface-2/50"
            }`}
            title={ws.path}
          >
            {ws.name}
          </button>
        ))}
      </div>

      {/* Right: Mission timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-12 text-deck-muted text-xs">
              Loading...
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <svg className="w-10 h-10 text-deck-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-deck-text-dim mb-1">No missions yet</p>
              <p className="text-xs text-deck-muted">
                Complete a mission to see history here
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="mb-6">
                <h3 className="text-[10px] uppercase text-deck-muted font-medium mb-2 px-1">
                  {group.label}
                </h3>

                <div className="space-y-3">
                  {group.items.map((wf) => {
                    const plan = parsePlan(wf.config_json);
                    const isExpanded = expandedId === wf.id;
                    const changes = parseChanges(wf.changes_json);
                    const totalAdds = changes.reduce((s, f) => s + (f.additions || 0), 0);
                    const totalDels = changes.reduce((s, f) => s + (f.deletions || 0), 0);

                    return (
                      <div key={wf.id}>
                        <div
                          className="bg-deck-surface rounded-lg border border-deck-border hover:border-deck-border-light transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                        >
                          <div className="p-4">
                            {/* Header: status + cost */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <StatusDot status={wf.status} />
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    wf.status === "completed"
                                      ? "bg-deck-success/10 text-deck-success"
                                      : wf.status === "failed"
                                        ? "bg-deck-error/10 text-deck-error"
                                        : wf.status === "finalizing"
                                          ? "bg-deck-warning/10 text-deck-warning"
                                          : "bg-deck-muted/10 text-deck-muted"
                                  }`}
                                >
                                  {wf.status}
                                </span>
                                <span className="text-[10px] text-deck-text-dim">
                                  {formatTime(wf.started_at || wf.created_at)}
                                </span>
                                {wf.started_at && (
                                  <span className="text-[10px] text-deck-muted">
                                    {formatDuration(wf.started_at, wf.completed_at)}
                                  </span>
                                )}
                              </div>
                              <CostBadge cost={wf.total_cost} />
                            </div>

                            {/* Task / Goal */}
                            <p className="text-sm text-deck-text-bright mb-2 leading-relaxed">
                              {wf.name || "Untitled mission"}
                            </p>

                            {/* Outcome summary */}
                            {plan && (
                              <p className="text-[11px] text-deck-text-dim mb-2">
                                {getOutcomeSummary(plan, isExpanded && detail ? detail.nodes : undefined)}
                                {!isExpanded && plan.agents.length > 0 && (
                                  <span className="text-deck-muted">
                                    {" · "}
                                    {plan.agents.map((a) => a.name).join(", ")}
                                  </span>
                                )}
                              </p>
                            )}

                            {/* Changes summary */}
                            {changes.length > 0 && (
                              <div className="flex items-center gap-2 text-[10px] text-deck-text-dim mb-2">
                                <svg className="w-3 h-3 text-deck-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>{changes.length} files changed,</span>
                                <span className="text-deck-success">+{totalAdds}</span>
                                <span className="text-deck-error">-{totalDels}</span>
                              </div>
                            )}

                            {/* Commit / PR info */}
                            {wf.commit_hash ? (
                              <div className="flex items-center gap-2 text-[10px] bg-deck-success/5 rounded px-2 py-1.5 border border-deck-success/20">
                                <svg className="w-3 h-3 text-deck-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="font-mono text-deck-success">{wf.commit_hash.slice(0, 7)}</span>
                                {wf.commit_message && (
                                  <span className="text-deck-text-dim truncate">{wf.commit_message}</span>
                                )}
                                {wf.pushed ? (
                                  <span className="text-deck-success font-medium ml-auto shrink-0">pushed</span>
                                ) : (
                                  <span className="text-deck-muted ml-auto shrink-0">local only</span>
                                )}
                                {wf.pr_url && (
                                  <a
                                    href={wf.pr_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-deck-accent hover:underline shrink-0"
                                  >
                                    View PR &rarr;
                                  </a>
                                )}
                              </div>
                            ) : wf.status === "completed" || wf.status === "finalizing" ? (
                              <div className="flex items-center gap-2 text-[10px] bg-deck-warning/5 rounded px-2 py-1.5 border border-deck-warning/20">
                                <svg className="w-3 h-3 text-deck-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-deck-warning">Not committed</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (wf.workspace_id) setActiveWorkspaceId(wf.workspace_id);
                                    setPage("command-center");
                                  }}
                                  className="ml-auto text-deck-accent hover:underline shrink-0"
                                >
                                  Finalize →
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Expanded detail — agent breakdown */}
                        {isExpanded && detail && (
                          <div className="mt-2 space-y-1.5 mb-3">
                            {detail.nodes?.map((node) => {
                              const task = getAgentTask(node.agent_name, plan, node);
                              const role = getAgentRole(node.agent_name, plan);

                              return (
                                <div
                                  key={node.agent_name}
                                  className="px-4 py-2.5 bg-deck-bg rounded-lg border border-deck-border"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <StatusDot status={node.status} />
                                    <span className="text-xs font-medium text-deck-text-bright font-mono">
                                      {node.agent_name}
                                    </span>
                                    {role && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-muted">
                                        {role}
                                      </span>
                                    )}
                                    <span className="ml-auto font-mono text-deck-text-dim text-[10px]">
                                      ${(node.cost || 0).toFixed(4)}
                                    </span>
                                    <span
                                      className={`text-[10px] ${
                                        node.status === "success" ? "text-deck-success" : node.status === "failed" ? "text-deck-error" : "text-deck-muted"
                                      }`}
                                    >
                                      {node.status}
                                    </span>
                                  </div>
                                  {task && (
                                    <p className="text-[11px] text-deck-text-dim leading-relaxed pl-5">
                                      {task}
                                    </p>
                                  )}
                                  {node.error && (
                                    <p className="text-[11px] text-deck-error mt-1 pl-5 font-mono">
                                      {node.error}
                                    </p>
                                  )}
                                </div>
                              );
                            })}

                            {/* Changed files list */}
                            {changes.length > 0 && (
                              <div className="px-4 py-2.5 bg-deck-bg rounded-lg border border-deck-border">
                                <div className="text-[10px] uppercase text-deck-muted font-medium mb-2">
                                  Changed Files
                                </div>
                                <div className="space-y-1">
                                  {changes.map((f) => (
                                    <div key={f.path} className="flex items-center gap-2 text-[11px] font-mono">
                                      <span className={
                                        f.status === "added" ? "text-deck-success" :
                                        f.status === "deleted" ? "text-deck-error" :
                                        "text-deck-warning"
                                      }>
                                        {f.status === "added" ? "+" : f.status === "deleted" ? "-" : "M"}
                                      </span>
                                      <span className="text-deck-text-dim flex-1 truncate">{f.path}</span>
                                      <span className="text-deck-success shrink-0">+{f.additions}</span>
                                      <span className="text-deck-error shrink-0">-{f.deletions}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Quick actions */}
                            <div className="flex gap-3 pt-1 px-1">
                              {wf.workspace_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveWorkspaceId(wf.workspace_id!);
                                    setPage("command-center");
                                  }}
                                  className="text-[10px] text-deck-accent hover:underline"
                                >
                                  Open Project
                                </button>
                              )}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(`${API_BASE}/history/${wf.id}`, { method: "DELETE" });
                                    if (res.ok) {
                                      setExpandedId(null);
                                      fetchWorkflows();
                                    }
                                  } catch {}
                                }}
                                className="text-[10px] text-deck-error hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
