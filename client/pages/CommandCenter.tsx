/**
 * CommandCenter - The main page with four modes:
 *   empty     -> Project info + task input
 *   planning  -> Spinner while AI architect plans
 *   running   -> React Flow DAG + right panel + output drawer
 *   completed -> Summary with cost/time + new mission option
 */

import { useState, useRef } from "react";
import { useDeckStore } from "../stores/deck-store";
import type { ProjectStructure } from "../hooks/use-project";
import { EmptyState } from "../components/command-center/EmptyState";
import {
  PlanningCanvas,
  type MissionPlan,
} from "../components/command-center/PlanningCanvas";
import { RunningCanvas } from "../components/command-center/RunningCanvas";
import { RightPanel } from "../components/command-center/RightPanel";
import { OutputDrawer } from "../components/command-center/OutputDrawer";
import { CompletedSummary } from "../components/command-center/CompletedSummary";
import { FinalizePanel } from "../components/command-center/FinalizePanel";

const API_BASE = "/api/deck";

interface CommandCenterProps {
  sendJsonMessage: (msg: any) => void;
  project: ProjectStructure | null;
  projectLoading: boolean;
  rescanProject: (path?: string) => void;
}

export function CommandCenter({
  sendJsonMessage,
  project,
  projectLoading,
  rescanProject,
}: CommandCenterProps) {
  const {
    mode,
    setMode,
    selectedAgentId,
    setSelectedAgentId,
    setActiveWorkflow,
    clearOutputEvents,
    addToast,
    activeWorkspaceId,
  } = useDeckStore();

  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Actions ──────────────────────────────────────

  async function handlePlan() {
    if (!task.trim()) return;
    setError(null);
    setPlan(null);
    setActiveWorkflow(null);
    clearOutputEvents();
    setMode("planning");

    try {
      const res = await fetch(`${API_BASE}/mission/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          path: project?.root || ".",
          workspaceId: activeWorkspaceId || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPlan(data.plan);
      // Stay in planning mode (shows PlanningCanvas for review)
    } catch (err: any) {
      setError(`Planning failed: ${err.message}`);
      addToast(`Planning failed: ${err.message}`);
      setMode("empty");
    }
  }

  async function handleLaunch() {
    if (!plan) return;
    setError(null);

    try {
      sendJsonMessage({ type: "deck:subscribe" });

      const res = await fetch(`${API_BASE}/workflow/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          name: task.slice(0, 50),
          projectRoot: project?.root || ".",
          workspaceId: activeWorkspaceId || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const wf = await res.json();
      setActiveWorkflow(wf);
      setMode("running");

      // Focus all agents for output streaming
      for (const node of Object.values(wf.nodes) as any[]) {
        if (node.agentId) {
          sendJsonMessage({ type: "deck:agent:focus", agentId: node.agentId });
        }
      }
    } catch (err: any) {
      setError(`Launch failed: ${err.message}`);
      addToast(`Launch failed: ${err.message}`);
    }
  }

  async function handleAbort() {
    const wf = useDeckStore.getState().activeWorkflow;
    if (!wf) return;
    try {
      await fetch(`${API_BASE}/workflow/${wf.id}/abort`, { method: "POST" });
    } catch {
      // ignore
    }
  }

  function handleReset() {
    setPlan(null);
    setActiveWorkflow(null);
    clearOutputEvents();
    setMode("empty");
    setTask("");
    setError(null);
    setSelectedAgentId(null);
    inputRef.current?.focus();
  }

  function handleSelectNode(name: string) {
    setSelectedAgentId(name);
  }

  // ─── Render ───────────────────────────────────────

  // Planning mode: show spinner if no plan yet, or PlanningCanvas if plan ready
  if (mode === "planning") {
    if (plan) {
      return (
        <div className="flex h-full">
          <div className="flex-1 flex flex-col overflow-hidden">
            <PlanningCanvas
              plan={plan}
              onLaunch={handleLaunch}
              onReplan={handlePlan}
              onSelectNode={handleSelectNode}
            />
          </div>
          {selectedAgentId && <RightPanel sendJsonMessage={sendJsonMessage} />}
        </div>
      );
    }

    // Spinner while waiting for plan
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin h-8 w-8 text-deck-accent"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-deck-text-dim">
            Architect is planning your mission...
          </p>
          {error && (
            <p className="text-xs text-deck-error bg-deck-error/10 px-3 py-1.5 rounded">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Running mode
  if (mode === "running") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <RunningCanvas
              onSelectNode={handleSelectNode}
              onAbort={handleAbort}
            />
          </div>
          {selectedAgentId && <RightPanel sendJsonMessage={sendJsonMessage} />}
        </div>
        <OutputDrawer />
      </div>
    );
  }

  // Finalizing mode
  if (mode === "finalizing") {
    return (
      <div className="flex h-full">
        <div className="flex-1">
          <CompletedSummary onNewMission={handleReset} />
        </div>
        <FinalizePanel />
      </div>
    );
  }

  // Completed mode
  if (mode === "completed") {
    return <CompletedSummary onNewMission={handleReset} />;
  }

  // Empty mode — if no workspace selected, nudge user to pick one
  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <svg className="w-10 h-10 text-deck-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm text-deck-text-dim">Select a project to get started</p>
        <button
          onClick={() => useDeckStore.getState().goHome()}
          className="px-4 py-2 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors"
        >
          Go to Projects
        </button>
      </div>
    );
  }

  // Empty mode (default)
  return (
    <EmptyState
      project={project}
      projectLoading={projectLoading}
      task={task}
      setTask={setTask}
      onPlan={handlePlan}
    />
  );
}
