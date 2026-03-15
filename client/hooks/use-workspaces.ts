import { useEffect, useCallback, useState } from "react";
import { useDeckStore } from "../stores/deck-store";
import type { WorkspaceInfo } from "../stores/deck-store";

const API_BASE = "/api/deck/workspaces";

let initialFetchDone = false;

export function useWorkspaces() {
  const { workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, setPage, setMode, setActiveWorkflow, clearOutputEvents, setFinalizeState, goHome } =
    useDeckStore();
  const [loading, setLoading] = useState(workspaces.length === 0);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      if (res.ok) {
        const data: WorkspaceInfo[] = await res.json();
        setWorkspaces(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [setWorkspaces]);

  useEffect(() => {
    if (!initialFetchDone) {
      initialFetchDone = true;
      fetchWorkspaces();
    }
  }, [fetchWorkspaces]);

  const addWorkspace = async (path: string, name?: string) => {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to add" }));
      throw new Error(err.error);
    }
    const ws: WorkspaceInfo = await res.json();
    await fetchWorkspaces();
    return ws;
  };

  const removeWorkspace = async (id: string) => {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to remove" }));
      throw new Error(err.error);
    }
    if (activeWorkspaceId === id) {
      goHome();
    }
    await fetchWorkspaces();
  };

  const renameWorkspace = async (id: string, name: string) => {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to rename" }));
      throw new Error(err.error);
    }
    await fetchWorkspaces();
  };

  const selectWorkspace = (id: string) => {
    // Reset Command Center state for clean slate
    setMode("empty");
    setActiveWorkflow(null);
    clearOutputEvents();
    setFinalizeState(null);
    setActiveWorkspaceId(id);
    setPage("command-center");
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  return {
    workspaces,
    loading,
    activeWorkspace,
    activeWorkspaceId,
    addWorkspace,
    removeWorkspace,
    renameWorkspace,
    selectWorkspace,
    refresh: fetchWorkspaces,
  };
}
