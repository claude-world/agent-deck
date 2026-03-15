import { useEffect, useState } from "react";
import { useDeckStore } from "../stores/deck-store";

export interface ProjectStructure {
  name: string;
  root: string;
  type: string;
  framework?: string;
  packages: any[];
  hasClaudeMd: boolean;
  hasMcpJson: boolean;
  hasDeckYaml: boolean;
  agentCount: number;
  skillCount: number;
  mcpServerCount: number;
  gitBranch: string | null;
  gitStatus: string | null;
  language: string | null;
}

export function useProject(workspacePath?: string) {
  const [project, setProject] = useState<ProjectStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const { setMode, setActiveWorkflow } = useDeckStore();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const scanUrl = workspacePath
          ? `/api/deck/project/scan?path=${encodeURIComponent(workspacePath)}`
          : "/api/deck/project/scan";
        const [projRes, workflowsRes] = await Promise.all([
          fetch(scanUrl),
          fetch("/api/deck/workflows"),
        ]);
        if (cancelled) return;
        if (projRes.ok) setProject(await projRes.json());
        if (workflowsRes.ok) {
          const workflows = await workflowsRes.json();
          const active = workflows.find((w: any) => w.status === "running" || w.status === "finalizing");
          if (active && !cancelled) {
            setActiveWorkflow(active);
            setMode(active.status === "finalizing" ? "finalizing" : "running");
          }
        }
      } catch {
        // Silent fail - server might not be ready yet
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();

    return () => { cancelled = true; };
  }, [workspacePath]);

  const rescan = async (path?: string) => {
    try {
      const scanPath = path || workspacePath;
      const res = await fetch(
        `/api/deck/project/scan${scanPath ? `?path=${encodeURIComponent(scanPath)}` : ""}`
      );
      if (res.ok) setProject(await res.json());
    } catch {
      // ignore
    }
  };

  return { project, loading, rescan };
}
