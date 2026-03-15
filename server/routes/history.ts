/**
 * History Routes - Workflow history from DB.
 */

import { Router } from "express";
import type { DeckStore } from "../core/db.js";
import type { WorkflowExecutor } from "../deck/workflow-executor.js";

export function createHistoryRouter(
  store: DeckStore,
  getWorkflowExecutor: () => WorkflowExecutor | undefined
): Router {
  const router = Router();

  /** List workflows (most recent first), optionally filtered by workspace */
  router.get("/", (req, res) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      if (workspaceId) {
        const workflows = store.getWorkflowsByWorkspace(workspaceId);
        return res.json(workflows);
      }
      const workflows = store.getAllWorkflows();
      res.json(workflows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get workflow detail with nodes and edges */
  router.get("/:id", (req, res) => {
    try {
      const workflow = store.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const nodes = store.getWorkflowNodes(req.params.id);
      const edges = store.getWorkflowEdges(req.params.id);

      res.json({
        ...workflow,
        nodes,
        edges,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Delete a workflow record */
  router.delete("/:id", (req, res) => {
    try {
      const workflow = store.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      store.deleteWorkflow(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Re-launch a workflow from a previous config */
  router.post("/:id/relaunch", (req, res) => {
    try {
      const workflowExecutor = getWorkflowExecutor();
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }

      const workflow = store.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      let plan;
      try {
        plan = JSON.parse(workflow.config_json);
      } catch {
        return res.status(400).json({ error: "Cannot parse original workflow config" });
      }

      if (!plan.agents || !Array.isArray(plan.agents)) {
        return res.status(400).json({ error: "Invalid workflow config: missing agents" });
      }

      const newName = req.body.name || `${workflow.name} (relaunch)`;
      const projectRoot = req.body.projectRoot || process.cwd();

      const newWorkflow = workflowExecutor.launchWorkflow(plan, newName, projectRoot);
      res.status(201).json(newWorkflow);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
