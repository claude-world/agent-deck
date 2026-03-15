/**
 * CompletedSummary - Summary after workflow completes.
 * Shows total cost, time, agent statuses, and action buttons.
 */

import { useMemo } from "react";
import { useDeckStore } from "../../stores/deck-store";
import { StatusDot } from "../shared/StatusDot";

interface CompletedSummaryProps {
  onNewMission: () => void;
}

export function CompletedSummary({ onNewMission }: CompletedSummaryProps) {
  const { activeWorkflow } = useDeckStore();

  const elapsed = useMemo(() => {
    if (!activeWorkflow?.startedAt) return "N/A";
    const end = activeWorkflow.completedAt || Date.now();
    const seconds = Math.floor((end - activeWorkflow.startedAt) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, [activeWorkflow]);

  const nodeStatuses = useMemo(() => {
    if (!activeWorkflow) return [];
    return Object.entries(activeWorkflow.nodes).map(([name, node]) => ({
      name,
      status: node.status,
      cost: node.cost,
      error: node.error,
    }));
  }, [activeWorkflow]);

  const isSuccess = activeWorkflow?.status === "completed";
  const isFailed = activeWorkflow?.status === "failed";

  const handleExport = () => {
    if (!activeWorkflow) return;
    const blob = new Blob([JSON.stringify(activeWorkflow, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${activeWorkflow.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      {/* Status icon */}
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
          isSuccess
            ? "bg-deck-success/10 text-deck-success"
            : isFailed
              ? "bg-deck-error/10 text-deck-error"
              : "bg-deck-muted/10 text-deck-muted"
        }`}
      >
        {isSuccess ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : isFailed ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )}
      </div>

      <h2
        className={`text-lg font-semibold mb-1 ${
          isSuccess ? "text-deck-success" : isFailed ? "text-deck-error" : "text-deck-muted"
        }`}
      >
        {isSuccess ? "Mission Complete" : isFailed ? "Mission Failed" : "Mission Cancelled"}
      </h2>
      <p className="text-xs text-deck-text-dim mb-6">
        {activeWorkflow?.name || "Workflow"}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6 w-full max-w-md">
        <div className="bg-deck-surface rounded-lg border border-deck-border p-3 text-center">
          <div className="text-[10px] uppercase text-deck-muted mb-1">Cost</div>
          <div className="text-sm font-mono text-deck-success">
            ${(activeWorkflow?.totalCost || 0).toFixed(3)}
          </div>
        </div>
        <div className="bg-deck-surface rounded-lg border border-deck-border p-3 text-center">
          <div className="text-[10px] uppercase text-deck-muted mb-1">Time</div>
          <div className="text-sm font-mono text-deck-text-bright">{elapsed}</div>
        </div>
        <div className="bg-deck-surface rounded-lg border border-deck-border p-3 text-center">
          <div className="text-[10px] uppercase text-deck-muted mb-1">Agents</div>
          <div className="text-sm font-mono text-deck-text-bright">
            {nodeStatuses.length}
          </div>
        </div>
      </div>

      {/* Agent statuses */}
      <div className="w-full max-w-md space-y-1.5 mb-6">
        {nodeStatuses.map((node) => (
          <div
            key={node.name}
            className="flex items-center gap-2 px-3 py-1.5 bg-deck-surface rounded border border-deck-border text-xs"
          >
            <StatusDot status={node.status} />
            <span className="text-deck-text flex-1 truncate">{node.name}</span>
            <span className="font-mono text-deck-text-dim">
              ${node.cost.toFixed(4)}
            </span>
            <span
              className={`text-[10px] ${
                node.status === "success" || node.status === "completed"
                  ? "text-deck-success"
                  : node.status === "failed"
                    ? "text-deck-error"
                    : "text-deck-muted"
              }`}
            >
              {node.status}
            </span>
          </div>
        ))}
      </div>

      {/* Commit info */}
      {(activeWorkflow as any)?.commit_hash && (
        <div className="w-full max-w-md mb-6 px-3 py-2 bg-deck-surface rounded border border-deck-border">
          <div className="flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5 text-deck-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-mono text-deck-text-dim">{(activeWorkflow as any).commit_hash}</span>
            <span className="text-deck-text truncate">{(activeWorkflow as any).commit_message}</span>
            {(activeWorkflow as any).pushed && (
              <span className="text-[10px] text-deck-success shrink-0">pushed</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onNewMission}
          className="px-5 py-2.5 bg-deck-accent text-white text-sm rounded-lg hover:bg-deck-accent-hover transition-colors font-medium"
        >
          New Mission
        </button>
        <button
          onClick={handleExport}
          className="px-4 py-2.5 text-sm border border-deck-border rounded-lg text-deck-text-dim hover:text-deck-text hover:bg-deck-surface-2 transition-colors"
        >
          Export
        </button>
      </div>
    </div>
  );
}
