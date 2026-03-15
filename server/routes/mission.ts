/**
 * Mission Routes - Plan and launch multi-agent workflows.
 */

import { Router } from "express";
import { scanProject } from "../core/project-scanner.js";
import { planMission } from "../core/architect.js";
import type { DeckManager } from "../deck/deck-manager.js";
import type { WorkflowExecutor } from "../deck/workflow-executor.js";
import type { WorkspaceManager } from "../core/workspace-manager.js";

export function createMissionRouter(
  deckManager: DeckManager,
  getWorkflowExecutor: () => WorkflowExecutor | undefined,
  workspaceManager?: WorkspaceManager
): Router {
  const router = Router();

  /** Resolve workspace path from workspaceId or projectPath */
  function resolveWorkspacePath(workspaceId?: string, projectPath?: string): string {
    if (workspaceId && workspaceManager) {
      const ws = workspaceManager.get(workspaceId);
      if (ws) {
        workspaceManager.touch(workspaceId);
        return ws.path;
      }
    }
    return projectPath || process.cwd();
  }

  /** Plan a mission (AI task decomposition) */
  router.post("/plan", async (req, res) => {
    try {
      const { task, path: projectPath, workspaceId } = req.body;
      if (!task) {
        return res.status(400).json({ error: "task is required" });
      }

      const scanPath = resolveWorkspacePath(workspaceId, projectPath);
      const structure = await scanProject(scanPath);
      const plan = await planMission(task, structure);
      res.json({ plan, project: structure });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Launch a workflow from a MissionPlan */
  router.post("/launch", (req, res) => {
    try {
      const workflowExecutor = getWorkflowExecutor();
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const { plan, name, projectRoot, workspaceId } = req.body;
      if (!plan || !plan.agents) {
        return res.status(400).json({ error: "plan with agents is required" });
      }

      const root = resolveWorkspacePath(workspaceId, projectRoot);
      const workflow = workflowExecutor.launchWorkflow(
        plan,
        name || "Mission",
        root,
        workspaceId
      );
      res.status(201).json(workflow);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get active workflow */
  router.get("/active", (_req, res) => {
    try {
      const workflowExecutor = getWorkflowExecutor();
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const workflows = workflowExecutor.getAllWorkflows();
      const active = workflows.find(
        (w) => w.status === "running" || w.status === "planning"
      );
      if (!active) {
        return res.json(null);
      }
      res.json(active);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Abort a workflow */
  router.post("/:id/abort", (req, res) => {
    try {
      const workflowExecutor = getWorkflowExecutor();
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      workflowExecutor.abortWorkflow(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Export workflow results as JSON */
  router.get("/:id/export", (req, res) => {
    try {
      const workflowExecutor = getWorkflowExecutor();
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const workflow = workflowExecutor.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      // Build export payload with full details
      const exportData = {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        totalCost: workflow.totalCost,
        maxBudgetUsd: workflow.maxBudgetUsd,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        nodes: Object.entries(workflow.nodes).map(([name, node]) => ({
          name,
          status: node.status,
          cost: node.cost,
          retryCount: node.retryCount,
          agentId: node.agentId,
          error: node.error,
          config: node.config,
        })),
        edges: workflow.edges,
        exportedAt: new Date().toISOString(),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="workflow-${workflow.id}.json"`
      );
      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
