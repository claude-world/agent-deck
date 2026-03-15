/**
 * Agent Control Routes - Pause, resume, and stop individual agents.
 */

import { Router } from "express";
import type { DeckManager } from "../deck/deck-manager.js";

export function createAgentsRouter(deckManager: DeckManager): Router {
  const router = Router();

  /** Pause an agent (send SIGSTOP to its process) */
  router.post("/:id/pause", (req, res) => {
    try {
      const agent = deckManager.getAgents().find((a) => a.id === req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!agent.pid) {
        return res.status(400).json({ error: "Agent has no running process" });
      }
      if (agent.status !== "running" && agent.status !== "idle") {
        return res.status(400).json({ error: `Cannot pause agent in status: ${agent.status}` });
      }

      try {
        process.kill(agent.pid, "SIGSTOP");
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to send SIGSTOP: ${err.message}` });
      }

      // Emit status update through DeckManager
      // The DeckManager will pick up the status change
      res.json({ ok: true, agentId: agent.id, action: "paused" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Resume an agent (send SIGCONT to its process) */
  router.post("/:id/resume", (req, res) => {
    try {
      const agent = deckManager.getAgents().find((a) => a.id === req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!agent.pid) {
        return res.status(400).json({ error: "Agent has no running process" });
      }

      try {
        process.kill(agent.pid, "SIGCONT");
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to send SIGCONT: ${err.message}` });
      }

      res.json({ ok: true, agentId: agent.id, action: "resumed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Graceful stop (SIGTERM, then SIGKILL after timeout) */
  router.post("/:id/stop", (req, res) => {
    try {
      const agent = deckManager.getAgents().find((a) => a.id === req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!agent.pid) {
        return res.status(400).json({ error: "Agent has no running process" });
      }

      // First try SIGTERM for graceful shutdown
      try {
        process.kill(agent.pid, "SIGTERM");
      } catch (err: any) {
        // Process may already be dead
        deckManager.killAgent(agent.id);
        return res.json({ ok: true, agentId: agent.id, action: "stopped" });
      }

      // Schedule SIGKILL as fallback after 5 seconds
      setTimeout(() => {
        try {
          // Check if still alive
          process.kill(agent.pid!, 0);
          // Still alive, force kill via DeckManager
          deckManager.killAgent(agent.id);
        } catch {
          // Already dead, good
        }
      }, 5000);

      res.json({ ok: true, agentId: agent.id, action: "stopping" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
