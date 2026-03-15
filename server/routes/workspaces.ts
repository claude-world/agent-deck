/**
 * Workspace Routes - CRUD + rescan + stats for project workspaces.
 */

import { Router } from "express";
import type { WorkspaceManager } from "../core/workspace-manager.js";

export function createWorkspaceRouter(workspaceManager: WorkspaceManager): Router {
  const router = Router();

  /** List all workspaces */
  router.get("/", (_req, res) => {
    try {
      const workspaces = workspaceManager.getAll();
      res.json(workspaces);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Add a workspace */
  router.post("/", (req, res) => {
    try {
      const { path: wsPath, name } = req.body;
      if (!wsPath) {
        return res.status(400).json({ error: "path is required" });
      }
      const workspace = workspaceManager.add(wsPath, name);
      res.status(201).json(workspace);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /** Get a workspace */
  router.get("/:id", (req, res) => {
    try {
      const workspace = workspaceManager.get(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Rename a workspace */
  router.patch("/:id", (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      const workspace = workspaceManager.rename(req.params.id, name);
      res.json(workspace);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /** Delete a workspace */
  router.delete("/:id", (req, res) => {
    try {
      workspaceManager.remove(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /** Rescan workspace metadata */
  router.post("/:id/rescan", (req, res) => {
    try {
      const workspace = workspaceManager.rescan(req.params.id);
      res.json(workspace);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /** Get workspace stats */
  router.get("/:id/stats", (req, res) => {
    try {
      const stats = workspaceManager.getStats(req.params.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
