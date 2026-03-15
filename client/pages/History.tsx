/**
 * History - Dual-pane layout: project list (left) + mission timeline (right).
 * Missions grouped by date with commit info and expandable agent breakdown.
 */

import { useState, useEffect, useCallback } from "react";
import { StatusDot } from "../components/shared/StatusDot";
import { CostBadge } from "../components/shared/CostBadge";
import { useDeckStore } from "../stores/deck-store";

const API_BASE = "/api/deck";

interface WorkflowRecord {
  id: string;
  name: string;
  status: string;
  total_cost: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: string;
  workspace_id: string | null;
  commit_hash: string | null;
  commit_message: string | null;
  pushed: number;
}

interface WorkflowDetail extends WorkflowRecord {
  nodes: Array<{
    agent_name: string;
    status: string;
    cost: number;
    error: string | null;
  }>;
}

interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
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
        <div className="max-w-2xl mx-auto">
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

                <div className="space-y-2">
                  {group.items.map((wf) => (
                    <div key={wf.id}>
                      <div
                        className="bg-deck-surface rounded-lg border border-deck-border hover:border-deck-border-light transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === wf.id ? null : wf.id)}
                      >
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <StatusDot status={wf.status} />
                              <span className="text-xs font-medium text-deck-text-bright truncate">
                                {wf.name || "Untitled"}
                              </span>
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
                            </div>
                            <CostBadge cost={wf.total_cost} />
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-deck-text-dim">
                            <span>{formatTime(wf.started_at || wf.created_at)}</span>
                            {wf.started_at && (
                              <span>{formatDuration(wf.started_at, wf.completed_at)}</span>
                            )}
                            {wf.commit_hash && (
                              <span className="font-mono text-deck-success">
                                {wf.commit_hash}
                              </span>
                            )}
                            {wf.pushed ? (
                              <span className="text-deck-success">pushed</span>
                            ) : null}
                          </div>

                          {wf.commit_message && (
                            <p className="text-[10px] text-deck-text-dim mt-1 truncate font-mono">
                              {wf.commit_message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expandedId === wf.id && detail && (
                        <div className="ml-4 mt-1 space-y-1 mb-2">
                          {detail.nodes?.map((node) => (
                            <div
                              key={node.agent_name}
                              className="flex items-center gap-2 px-3 py-1.5 bg-deck-bg rounded border border-deck-border text-xs"
                            >
                              <StatusDot status={node.status} />
                              <span className="text-deck-text flex-1 truncate font-mono">
                                {node.agent_name}
                              </span>
                              <span className="font-mono text-deck-text-dim text-[10px]">
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
                          ))}

                          {/* Quick actions */}
                          <div className="flex gap-2 pt-1">
                            {selectedWorkspace && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveWorkspaceId(selectedWorkspace);
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
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
