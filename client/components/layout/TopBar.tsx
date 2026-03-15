import { useMemo } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { WorkspaceInfo } from "../../stores/deck-store";
import { StatusDot } from "../shared/StatusDot";
import type { ProjectStructure } from "../../hooks/use-project";

interface TopBarProps {
  project: ProjectStructure | null;
  activeWorkspace?: WorkspaceInfo | null;
}

export function TopBar({ project, activeWorkspace }: TopBarProps) {
  const { mode, agents, activeWorkflow, page, goHome } = useDeckStore();

  const activeCount = agents.filter(
    (a) => a.status === "running" || a.status === "idle"
  ).length;

  const totalCost = agents.reduce((sum, a) => sum + a.total_cost_usd, 0);

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "empty":
        return null;
      case "planning":
        return (
          <div className="flex items-center gap-2 text-deck-warning">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs font-medium">Planning...</span>
          </div>
        );
      case "running":
        return (
          <div className="flex items-center gap-2">
            <StatusDot status="running" />
            <span className="text-xs font-medium text-deck-success">Running</span>
            {activeWorkflow && activeWorkflow.totalCost > 0 && (
              <span className="text-[10px] font-mono text-deck-text-dim">
                ${activeWorkflow.totalCost.toFixed(3)}
              </span>
            )}
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2">
            <StatusDot status={activeWorkflow?.status === "failed" ? "failed" : "completed"} />
            <span className={`text-xs font-medium ${
              activeWorkflow?.status === "failed" ? "text-deck-error" : "text-deck-accent"
            }`}>
              {activeWorkflow?.status === "failed" ? "Failed" : "Completed"}
            </span>
          </div>
        );
      case "finalizing":
        return (
          <div className="flex items-center gap-2 text-deck-warning">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Finalizing...</span>
          </div>
        );
      default:
        return null;
    }
  }, [mode, activeWorkflow]);

  const isElectron = !!(window as any).agentDeck?.isElectron;

  return (
    <div className={`shrink-0 h-10 border-b border-deck-border bg-deck-surface flex items-center justify-between ${isElectron ? "pl-20 pr-4" : "px-4"}`} style={isElectron ? { WebkitAppRegion: "drag" } as any : undefined}>
      {/* Left: project info */}
      <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: "no-drag" } as any}>
        {page !== "home" && activeWorkspace && (
          <button
            onClick={goHome}
            className="text-deck-text-dim hover:text-deck-text transition-colors shrink-0"
            title="Back to Home"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <span className="text-xs font-semibold text-deck-text-bright truncate">
          {activeWorkspace ? activeWorkspace.name : page === "home" ? "Agent Deck" : project?.name || "Agent Deck"}
        </span>
        {activeWorkspace?.git_branch ? (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-text-dim truncate">
            {activeWorkspace.git_branch}
          </span>
        ) : page !== "home" && project?.gitBranch ? (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-text-dim truncate">
            {project.gitBranch}
          </span>
        ) : null}
      </div>

      {/* Center: mode status */}
      <div className="absolute left-1/2 -translate-x-1/2">{modeLabel}</div>

      {/* Right: cost + agent count (only when workspace is active) */}
      {activeWorkspace && (
        <div className="flex items-center gap-3 text-xs text-deck-text-dim shrink-0" style={{ WebkitAppRegion: "no-drag" } as any}>
          <span className="font-mono text-deck-success">
            ${totalCost.toFixed(2)}
          </span>
          <span>
            {activeCount}/{agents.length} agents
          </span>
        </div>
      )}
    </div>
  );
}
