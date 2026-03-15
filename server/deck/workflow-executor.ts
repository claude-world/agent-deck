/**
 * Workflow Executor - DAG-based multi-agent orchestration.
 *
 * Implements Kahn's algorithm for topological execution of agent tasks.
 * Agents run in parallel where dependencies allow, with configurable
 * failure strategies.
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import type { DeckManager } from "./deck-manager.js";
import type { DeckStore } from "./deck-db.js";
import type {
  MissionPlan,
  PlannedAgent,
  WorkflowState,
  WorkflowStatus,
  NodeState,
  NodeStatus,
  SpawnAgentConfig,
  DeckAgent,
} from "./types.js";

const MAX_CONCURRENT_AGENTS = parseInt(process.env.DECK_MAX_AGENTS || "10", 10);

export interface WorkflowExecutorEvents {
  "workflow:status": [WorkflowState];
  "workflow:node": [string, NodeState]; // workflowId, node
}

export class WorkflowExecutor extends EventEmitter {
  private deckManager: DeckManager;
  private store: DeckStore;
  private workflows: Map<string, WorkflowState> = new Map();
  private agentToWorkflow: Map<string, { workflowId: string; agentName: string }> = new Map();
  private statusHandler: (agent: DeckAgent) => void;

  constructor(deckManager: DeckManager) {
    super();
    this.deckManager = deckManager;
    this.store = deckManager.getStore();

    // Listen for agent completion events from DeckManager
    this.statusHandler = (agent: DeckAgent) => {
      this.handleAgentStatusChange(agent);
    };
    this.deckManager.on("agent:status", this.statusHandler);
  }

  /** Create and launch a workflow from a MissionPlan */
  launchWorkflow(plan: MissionPlan, name: string, projectRoot: string, workspaceId?: string): WorkflowState {
    const workflowId = uuidv4();

    // Build nodes
    const nodes: Record<string, NodeState> = {};
    for (const agent of plan.agents) {
      nodes[agent.name] = {
        agentName: agent.name,
        config: {
          name: agent.name,
          prompt: agent.task,
          model: agent.model || "sonnet",
          workspace: agent.workdir === "."
            ? projectRoot
            : `${projectRoot}/${agent.workdir}`,
          agent_type: agent.role || "general",
        },
        status: "pending",
        cost: 0,
        retryCount: 0,
        agentId: null,
        error: null,
      };
    }

    // Build edges
    const edges: WorkflowState["edges"] = [];
    for (const agent of plan.agents) {
      for (const dep of agent.dependsOn) {
        edges.push({ source: dep, target: agent.name, condition: "success" });
      }
    }

    const workflow: WorkflowState = {
      id: workflowId,
      name,
      status: "running",
      nodes,
      edges,
      totalCost: 0,
      maxBudgetUsd: 50,
      startedAt: Date.now(),
      completedAt: null,
    };

    // Validate DAG (cycle detection)
    const cycleCheck = this.detectCycle(workflow);
    if (cycleCheck) {
      throw new Error(`Dependency cycle detected: ${cycleCheck.join(" -> ")}`);
    }

    // Persist to DB
    this.store.saveWorkflow({
      id: workflowId,
      name,
      config_json: JSON.stringify(plan),
      status: "running",
      total_cost: 0,
      started_at: workflow.startedAt,
    });
    for (const [agentName, node] of Object.entries(nodes)) {
      this.store.saveWorkflowNode(workflowId, agentName, JSON.stringify(node.config), node.status);
    }
    for (const edge of edges) {
      this.store.saveWorkflowEdge(workflowId, edge.source, edge.target, edge.condition);
    }

    // Link to workspace if provided
    if (workspaceId) {
      try { this.store.updateWorkflowWorkspace(workflowId, workspaceId); } catch {}
    }

    this.workflows.set(workflowId, workflow);
    this.emitWorkflowStatus(workflow);

    // Start execution
    this.scheduleReady(workflowId);

    return workflow;
  }

  /** Get a workflow by ID */
  getWorkflow(id: string): WorkflowState | undefined {
    return this.workflows.get(id);
  }

  /** Get all workflows */
  getAllWorkflows(): WorkflowState[] {
    return Array.from(this.workflows.values());
  }

  /** Complete a finalizing workflow (after commit or skip) */
  completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (!workflow || workflow.status !== "finalizing") return;

    workflow.status = "completed";
    workflow.completedAt = Date.now();
    this.persistWorkflowStatus(workflow);
    this.emitWorkflowStatus(workflow);

    console.log(`[Workflow] ${workflow.name} completed (cost: $${workflow.totalCost.toFixed(4)})`);
  }

  /** Abort a running workflow */
  abortWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (!workflow || workflow.status !== "running") return;

    // Kill all running agents
    for (const [, node] of Object.entries(workflow.nodes)) {
      if (node.agentId && (node.status === "running" || node.status === "queued")) {
        try {
          this.deckManager.killAgent(node.agentId);
        } catch {}
        node.status = "cancelled";
      } else if (node.status === "pending" || node.status === "queued") {
        node.status = "cancelled";
      }
    }

    workflow.status = "cancelled";
    workflow.completedAt = Date.now();
    this.persistWorkflowStatus(workflow);
    this.emitWorkflowStatus(workflow);
  }

  /** Detect cycles using DFS */
  private detectCycle(workflow: WorkflowState): string[] | null {
    const adj = new Map<string, string[]>();
    for (const name of Object.keys(workflow.nodes)) {
      adj.set(name, []);
    }
    for (const edge of workflow.edges) {
      adj.get(edge.source)?.push(edge.target);
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();

    for (const name of Object.keys(workflow.nodes)) {
      color.set(name, WHITE);
    }

    for (const name of Object.keys(workflow.nodes)) {
      if (color.get(name) === WHITE) {
        const cycle = this.dfs(name, adj, color);
        if (cycle) return cycle;
      }
    }
    return null;
  }

  private dfs(
    node: string,
    adj: Map<string, string[]>,
    color: Map<string, number>
  ): string[] | null {
    const GRAY = 1, BLACK = 2;
    color.set(node, GRAY);

    for (const neighbor of adj.get(node) || []) {
      if (color.get(neighbor) === GRAY) {
        return [neighbor, node, neighbor]; // cycle indicator
      }
      if (color.get(neighbor) === 0) {
        const cycle = this.dfs(neighbor, adj, color);
        if (cycle) return cycle;
      }
    }

    color.set(node, BLACK);
    return null;
  }

  /** Schedule all ready (in-degree 0 with no pending deps) nodes */
  private scheduleReady(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.status !== "running") return;

    // Find nodes that are ready (pending + all deps satisfied)
    for (const [name, node] of Object.entries(workflow.nodes)) {
      if (node.status !== "pending") continue;

      const deps = workflow.edges
        .filter((e) => e.target === name)
        .map((e) => e.source);

      const allDepsDone = deps.every((dep) => {
        const depNode = workflow.nodes[dep];
        return depNode && depNode.status === "success";
      });

      const anyDepFailed = deps.some((dep) => {
        const depNode = workflow.nodes[dep];
        return depNode && (depNode.status === "failed" || depNode.status === "cancelled" || depNode.status === "skipped");
      });

      if (anyDepFailed) {
        // Skip this node (abort-downstream strategy)
        node.status = "skipped";
        node.error = "Upstream dependency failed";
        this.persistNodeStatus(workflowId, node);
        this.emitNodeStatus(workflowId, node);
        continue;
      }

      if (allDepsDone) {
        node.status = "queued";
        this.emitNodeStatus(workflowId, node);
      }
    }

    // Launch queued nodes (up to max concurrent) — recompute running count fresh
    const runningCount = Object.values(workflow.nodes)
      .filter((n) => n.status === "running").length;
    const availableSlots = MAX_CONCURRENT_AGENTS - runningCount;
    const queued = Object.values(workflow.nodes).filter((n) => n.status === "queued");

    for (let i = 0; i < Math.min(queued.length, availableSlots); i++) {
      this.launchNode(workflowId, queued[i]);
    }

    // Check if workflow is complete
    this.checkWorkflowCompletion(workflowId);
  }

  /** Launch a single node (spawn agent) */
  private launchNode(workflowId: string, node: NodeState): void {
    try {
      const agent = this.deckManager.spawnAgent(node.config);
      node.agentId = agent.id;
      node.status = "running";

      // Map agent ID back to workflow
      this.agentToWorkflow.set(agent.id, {
        workflowId,
        agentName: node.agentName,
      });

      this.persistNodeStatus(workflowId, node);
      this.emitNodeStatus(workflowId, node);

      console.log(`[Workflow] Launched node "${node.agentName}" → agent ${agent.id}`);
    } catch (err: any) {
      node.status = "failed";
      node.error = err.message;
      this.persistNodeStatus(workflowId, node);
      this.emitNodeStatus(workflowId, node);

      // Schedule downstream (they'll be skipped)
      this.scheduleReady(workflowId);
    }
  }

  /** Handle agent status changes from DeckManager */
  private handleAgentStatusChange(agent: DeckAgent): void {
    const mapping = this.agentToWorkflow.get(agent.id);
    if (!mapping) return;

    const workflow = this.workflows.get(mapping.workflowId);
    if (!workflow) return;

    const node = workflow.nodes[mapping.agentName];
    if (!node) return;

    if (agent.status === "completed") {
      node.status = "success";
      node.cost = agent.total_cost_usd || 0;
      workflow.totalCost = Object.values(workflow.nodes)
        .reduce((sum, n) => sum + n.cost, 0);

      this.agentToWorkflow.delete(agent.id);
      this.persistNodeStatus(mapping.workflowId, node);
      this.emitNodeStatus(mapping.workflowId, node);

      // Schedule next nodes
      this.scheduleReady(mapping.workflowId);
    } else if (agent.status === "dead") {
      node.status = "failed";
      node.cost = agent.total_cost_usd || 0;
      workflow.totalCost = Object.values(workflow.nodes)
        .reduce((sum, n) => sum + n.cost, 0);

      this.agentToWorkflow.delete(agent.id);
      this.persistNodeStatus(mapping.workflowId, node);
      this.emitNodeStatus(mapping.workflowId, node);

      // Schedule downstream (they'll be skipped due to abort-downstream)
      this.scheduleReady(mapping.workflowId);
    }
  }

  /** Check if all nodes are terminal → mark workflow complete/failed */
  private checkWorkflowCompletion(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.status !== "running") return;

    const allTerminal = Object.values(workflow.nodes).every(
      (n) =>
        n.status === "success" ||
        n.status === "failed" ||
        n.status === "cancelled" ||
        n.status === "skipped"
    );

    if (!allTerminal) return;

    const anyFailed = Object.values(workflow.nodes).some(
      (n) => n.status === "failed"
    );

    // Success → go to finalizing for commit/push; failure → failed directly
    workflow.status = anyFailed ? "failed" : "finalizing";
    if (anyFailed) {
      workflow.completedAt = Date.now();
    }
    this.persistWorkflowStatus(workflow);
    this.emitWorkflowStatus(workflow);

    console.log(
      `[Workflow] ${workflow.name} ${workflow.status} (cost: $${workflow.totalCost.toFixed(4)})`
    );
  }

  // ─── Persistence ─────────────────────────────────

  private persistNodeStatus(workflowId: string, node: NodeState): void {
    try {
      this.store.updateWorkflowNode(
        workflowId,
        node.agentName,
        node.status,
        node.cost,
        node.agentId,
        node.error
      );
    } catch {}
  }

  private persistWorkflowStatus(workflow: WorkflowState): void {
    try {
      this.store.updateWorkflowStatus(
        workflow.id,
        workflow.status,
        workflow.totalCost,
        workflow.completedAt
      );
    } catch {}
  }

  // ─── Events ──────────────────────────────────────

  private emitWorkflowStatus(workflow: WorkflowState): void {
    this.emit("workflow:status", workflow);
  }

  private emitNodeStatus(workflowId: string, node: NodeState): void {
    this.emit("workflow:node", workflowId, node);
  }

  /** Clean up resources */
  dispose(): void {
    this.deckManager.removeListener("agent:status", this.statusHandler);
    this.removeAllListeners();
  }
}

// Type-safe emitter
export interface WorkflowExecutor {
  on<K extends keyof WorkflowExecutorEvents>(
    event: K,
    listener: (...args: WorkflowExecutorEvents[K]) => void
  ): this;
  emit<K extends keyof WorkflowExecutorEvents>(
    event: K,
    ...args: WorkflowExecutorEvents[K]
  ): boolean;
}
