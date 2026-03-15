/**
 * Finalize Routes - Git commit/push after workflow completion.
 */

import { Router } from "express";
import {
  getChangedFiles,
  getDiff,
  generateCommitMessage,
  executeFinalize,
} from "../core/finalize.js";
import type { WorkflowExecutor } from "../deck/workflow-executor.js";
import type { WorkspaceManager } from "../core/workspace-manager.js";
import type { DeckStore } from "../core/db.js";

export function createFinalizeRouter(
  store: DeckStore,
  getWorkflowExecutor: () => WorkflowExecutor | undefined,
  workspaceManager?: WorkspaceManager
): Router {
  const router = Router();

  /** Resolve workspace path */
  function resolveWorkspacePath(workspaceId?: string): string {
    if (workspaceId && workspaceManager) {
      const ws = workspaceManager.get(workspaceId);
      if (ws) return ws.path;
    }
    return process.cwd();
  }

  /** Get changed files for a workspace */
  router.get("/changes", (req, res) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      const wsPath = resolveWorkspacePath(workspaceId);
      const files = getChangedFiles(wsPath);
      res.json({ files, workspacePath: wsPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get diff for a specific file */
  router.get("/diff", (req, res) => {
    try {
      const filePath = req.query.file as string;
      const workspaceId = req.query.workspaceId as string | undefined;
      if (!filePath) {
        return res.status(400).json({ error: "file query param is required" });
      }
      const wsPath = resolveWorkspacePath(workspaceId);
      const diff = getDiff(wsPath, filePath);
      res.json({ diff, file: filePath });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Generate a commit message using AI */
  router.post("/message", async (req, res) => {
    try {
      const { workspaceId, task } = req.body;
      const wsPath = resolveWorkspacePath(workspaceId);
      const message = await generateCommitMessage(wsPath, task);
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Execute finalize: commit + optional push */
  router.post("/execute", (req, res) => {
    try {
      const { workflowId, workspaceId, selectedFiles, commitMessage, push } = req.body;

      if (!selectedFiles?.length || !commitMessage) {
        return res.status(400).json({ error: "selectedFiles and commitMessage are required" });
      }

      if (!Array.isArray(selectedFiles) || selectedFiles.some((f: any) => typeof f !== "string")) {
        return res.status(400).json({ error: "selectedFiles must be an array of strings" });
      }

      const wsPath = resolveWorkspacePath(workspaceId);
      const result = executeFinalize({
        workflowId: workflowId || "",
        workspacePath: wsPath,
        selectedFiles,
        commitMessage,
        push: !!push,
      });

      // Update workflow record with commit info
      if (workflowId) {
        try {
          store.updateWorkflowCommit(workflowId, result.commitHash, result.commitMessage, result.pushed);
        } catch {}

        // Mark workflow as completed
        const executor = getWorkflowExecutor();
        if (executor) {
          executor.completeWorkflow(workflowId);
        }
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Skip finalize and mark workflow completed */
  router.post("/skip", (req, res) => {
    try {
      const { workflowId } = req.body;
      const executor = getWorkflowExecutor();
      if (executor && workflowId) {
        executor.completeWorkflow(workflowId);
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
