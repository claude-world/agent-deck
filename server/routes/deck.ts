/**
 * Agent Deck - REST API Routes
 *
 * Main router that mounts sub-routers and preserves legacy routes.
 */

import { Router } from "express";
import type { DeckManager } from "../deck/deck-manager.js";
import type { WorkflowExecutor } from "../deck/workflow-executor.js";
import type { WorkspaceManager } from "../core/workspace-manager.js";
import { DeckStore } from "../core/db.js";
import { scanProject } from "../deck/project-scanner.js";
import { planMission } from "../deck/architect.js";

// Sub-routers
import { createProjectRouter } from "./project.js";
import { createMissionRouter } from "./mission.js";
import { createHistoryRouter } from "./history.js";
import { createSettingsRouter } from "./settings.js";
import { createAgentsRouter } from "./agents.js";
import { createFinalizeRouter } from "./finalize.js";

export function createDeckRouter(
  deckManager: DeckManager,
  workflowExecutor?: WorkflowExecutor,
  workspaceManager?: WorkspaceManager
): Router {
  const router = Router();

  // === Mount v1.0 sub-routers ===

  const store = deckManager.getStore() as unknown as DeckStore;
  const getWfExec = () => workflowExecutor;

  router.use("/project", createProjectRouter());
  router.use("/mission", createMissionRouter(deckManager, getWfExec, workspaceManager));
  router.use("/finalize", createFinalizeRouter(store, getWfExec, workspaceManager));
  router.use("/history", createHistoryRouter(store, getWfExec));
  router.use("/settings", createSettingsRouter(store));
  router.use("/agents", createAgentsRouter(deckManager));

  // === Legacy Routes (preserved for backwards compatibility) ===

  // === Agents ===

  /** List all agents with status + cost */
  router.get("/agents", (_req, res) => {
    try {
      const agents = deckManager.getAgents();
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Spawn new agent */
  router.post("/agents", (req, res) => {
    try {
      const { name, prompt, model, workspace, agent_type, interactive, runtime } = req.body;
      if (!name || !prompt) {
        return res.status(400).json({ error: "name and prompt are required" });
      }
      const agent = deckManager.spawnAgent({
        name,
        prompt,
        model,
        workspace,
        agent_type,
        interactive,
        runtime,
      });
      res.status(201).json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Kill agent */
  router.delete("/agents/:id", (req, res) => {
    try {
      deckManager.killAgent(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get agent events (paginated) */
  router.get("/agents/:id/events", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = deckManager.getAgentEvents(req.params.id, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get agent output buffer (for detail panel history catch-up) */
  router.get("/agents/:id/output", (req, res) => {
    try {
      const since = parseInt(req.query.since as string) || 0;
      const output = deckManager.getAgentOutput(req.params.id, since || undefined);
      res.json(output);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Cost ===

  /** Cost summary (total, by agent, by hour) */
  router.get("/cost", (_req, res) => {
    try {
      const summary = deckManager.getCostSummary();
      const timeSeries = deckManager.getCostTimeSeries();
      const estimates = deckManager.getAllCostEstimates();
      res.json({ ...summary, time_series: timeSeries, estimates });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Team Configs ===

  /** List team configs (merged: DB + YAML file-based) */
  router.get("/teams", (_req, res) => {
    try {
      const dbTeams = deckManager.getTeamConfigs();
      const fileConfigs = deckManager.getFileTeamConfigs();

      // Convert file configs to API format
      const fileTeams = Array.from(fileConfigs.entries()).map(([id, config]) => ({
        id,
        name: config.name,
        description: config.description || "",
        config_json: JSON.stringify(config),
        source: "file" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // DB teams have source: "db"
      const allTeams = [
        ...fileTeams,
        ...dbTeams.map((t: any) => ({ ...t, source: "db" })),
      ];
      res.json(allTeams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Reload YAML team configs */
  router.post("/teams/reload", async (_req, res) => {
    try {
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const { loadTeamConfigs, fileConfigsToMap } = await import("../deck/team-file-loader.js");

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const configDir = path.join(__dirname, "../../team-configs");
      const configs = await loadTeamConfigs(configDir);
      deckManager.setFileTeamConfigs(fileConfigsToMap(configs));
      res.json({ ok: true, count: configs.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Create team config */
  router.post("/teams", (req, res) => {
    try {
      const { name, description, config_json } = req.body;
      if (!name || !config_json) {
        return res
          .status(400)
          .json({ error: "name and config_json are required" });
      }
      const team = deckManager.createTeamConfig(
        name,
        description || "",
        typeof config_json === "string"
          ? config_json
          : JSON.stringify(config_json)
      );
      res.status(201).json(team);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Update team config */
  router.put("/teams/:id", (req, res) => {
    try {
      const { name, description, config_json } = req.body;
      deckManager.updateTeamConfig(
        req.params.id,
        name,
        description || "",
        typeof config_json === "string"
          ? config_json
          : JSON.stringify(config_json)
      );
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Delete team config */
  router.delete("/teams/:id", (req, res) => {
    try {
      deckManager.deleteTeamConfig(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Launch all agents in a team */
  router.post("/teams/:id/launch", (req, res) => {
    try {
      const agents = deckManager.launchTeam(req.params.id);
      res.status(201).json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Sessions ===

  /** List past sessions */
  router.get("/sessions", (_req, res) => {
    try {
      const sessions = deckManager.getSessions();
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get a specific session */
  router.get("/sessions/:id", (req, res) => {
    try {
      const session = deckManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Resume a session */
  router.post("/sessions/:id/resume", (req, res) => {
    try {
      const session = deckManager.getSession(req.params.id);
      if (!session || !session.session_id) {
        return res.status(400).json({ error: "Session not resumable (no session ID)" });
      }

      const config = JSON.parse(session.config_json);
      const agent = deckManager.spawnAgent({
        ...config,
        resumeSessionId: session.session_id,
      });

      res.status(201).json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Agent-State Bridge ===

  /** Get data from agent-state.db (read-only) */
  router.get("/agent-state", (_req, res) => {
    try {
      const data = deckManager.getAgentStateData();
      if (!data) {
        return res.status(404).json({ error: "Agent-state bridge not available" });
      }
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Get recent events across all agents */
  router.get("/events", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = deckManager.getRecentEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Project Scanner (legacy path) ===

  /** Scan project structure */
  router.get("/project/scan", async (req, res) => {
    try {
      const scanPath = (req.query.path as string) || process.cwd();
      const structure = await scanProject(scanPath);
      res.json(structure);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Mission Planner (legacy path) ===

  /** Plan a mission (AI task decomposition) */
  router.post("/mission/plan", async (req, res) => {
    try {
      const { task, path: projectPath } = req.body;
      if (!task) {
        return res.status(400).json({ error: "task is required" });
      }

      const scanPath = projectPath || process.cwd();
      const structure = await scanProject(scanPath);
      const plan = await planMission(task, structure);
      res.json({ plan, project: structure });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === Workflows (legacy paths) ===

  /** Launch a workflow from a MissionPlan */
  router.post("/workflow/launch", (req, res) => {
    try {
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const { plan, name, projectRoot, workspaceId } = req.body;
      if (!plan || !plan.agents) {
        return res.status(400).json({ error: "plan with agents is required" });
      }

      let root = projectRoot || process.cwd();
      if (workspaceId && workspaceManager) {
        const ws = workspaceManager.get(workspaceId);
        if (ws) root = ws.path;
      }

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

  /** Get workflow status */
  router.get("/workflow/:id", (req, res) => {
    try {
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const workflow = workflowExecutor.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Abort workflow */
  router.post("/workflow/:id/abort", (req, res) => {
    try {
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      workflowExecutor.abortWorkflow(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** List all workflows */
  router.get("/workflows", (_req, res) => {
    try {
      if (!workflowExecutor) {
        return res.status(500).json({ error: "Workflow executor not initialized" });
      }
      const workflows = workflowExecutor.getAllWorkflows();
      res.json(workflows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
