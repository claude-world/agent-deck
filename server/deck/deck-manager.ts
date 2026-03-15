/**
 * Agent Deck - Manager (Core Orchestrator)
 *
 * Manages agent lifecycle: spawn, monitor, kill, event forwarding.
 */

import { EventEmitter } from "events";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import { DeckStore } from "./deck-db.js";
import { createAdapter } from "./adapters/index.js";
import { OutputBufferManager } from "./output-buffer.js";
import { CostEstimator } from "./cost-estimator.js";
import { ContextEstimator } from "./context-estimator.js";
import type { AgentAdapter } from "./adapter-interface.js";
import type {
  DeckAgent,
  SpawnAgentConfig,
  StreamEvent,
  CompleteEvent,
  TeamConfigSchema,
  RuntimeType,
} from "./types.js";

const IDLE_THRESHOLD_MS = parseInt(
  process.env.DECK_IDLE_THRESHOLD_SECONDS || "300",
  10
) * 1000;

const MAX_AGENTS = parseInt(process.env.DECK_MAX_AGENTS || "10", 10);

export interface DeckManagerEvents {
  "agent:status": [DeckAgent];
  "agent:event": [string, any]; // agentId, event record
  "agent:stream": [string, StreamEvent]; // agentId, stream event
  "agent:cost": [string, any]; // agentId, cost estimate
  "agent:context": [string, { usedTokens: number; maxTokens: number; percentage: number }];
}

export class DeckManager extends EventEmitter {
  private store: DeckStore;
  private adapters: Map<string, AgentAdapter> = new Map();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private costEmitTimer: ReturnType<typeof setInterval> | null = null;
  private agentStateDb: Database.Database | null = null;
  private outputBuffers: OutputBufferManager;
  private costEstimator: CostEstimator;
  private contextEstimator: ContextEstimator;
  private fileTeamConfigs: Map<string, any> = new Map();

  constructor(db: Database.Database) {
    super();
    this.store = new DeckStore(db);
    this.outputBuffers = new OutputBufferManager(500);
    this.costEstimator = new CostEstimator();
    this.contextEstimator = new ContextEstimator();

    // Cleanup orphaned agents on startup
    const cleaned = this.store.cleanupOrphans();
    if (cleaned > 0) {
      console.log(`[Deck] Cleaned up ${cleaned} orphaned agents`);
    }

    // Start idle detection + cost emission
    this.startIdleDetection();
    this.startCostEmission();

    // Open agent-state.db (read-only) if available
    this.initAgentStateBridge();
  }

  /** Spawn a new agent */
  spawnAgent(config: SpawnAgentConfig): DeckAgent {
    const activeCount = this.store.getActiveAgents().length;
    if (activeCount >= MAX_AGENTS) {
      throw new Error(`Maximum agent limit reached (${MAX_AGENTS})`);
    }

    // Create DB record
    const agent = this.store.createAgent(config);

    // Create adapter and spawn process
    const runtime = config.runtime || "claude-code";
    const adapter = createAdapter(agent.id, runtime);

    // Start cost + context tracking
    this.costEstimator.startTracking(agent.id, config.model || "sonnet");
    this.contextEstimator.startTracking(agent.id, config.model || "sonnet", config.prompt);

    adapter.on("stream", (event: StreamEvent) => {
      this.handleStreamEvent(agent.id, event);

      // Track session ID from init events
      if (event.type === "init") {
        const sessionId = (event as any).data?.sessionId;
        if (sessionId) {
          this.store.updateAgentSessionId(agent.id, sessionId);
        }
      }
    });

    adapter.on("complete", (data: CompleteEvent["data"]) => {
      this.handleComplete(agent.id, data);
    });

    adapter.on("error", (error: Error) => {
      console.error(`[Deck] Agent ${agent.name} error:`, error.message);
      this.store.addEvent(agent.id, "error", undefined, error.message);
    });

    try {
      const pid = adapter.spawn(config);
      this.store.updateAgentPid(agent.id, pid);
      this.adapters.set(agent.id, adapter);

      const updatedAgent = this.store.getAgent(agent.id)!;
      this.emit("agent:status", updatedAgent);

      console.log(`[Deck] Spawned agent "${config.name}" (${agent.id}, pid=${pid})`);
      return updatedAgent;
    } catch (error: any) {
      this.store.updateAgentStatus(agent.id, "dead");
      this.store.addEvent(agent.id, "error", undefined, error.message);
      throw error;
    }
  }

  /** Kill an agent */
  killAgent(id: string): void {
    const adapter = this.adapters.get(id);
    if (adapter) {
      adapter.kill();
      adapter.dispose();
      this.adapters.delete(id);
    }

    this.store.updateAgentStatus(id, "dead");
    this.store.addEvent(id, "killed");

    const agent = this.store.getAgent(id);
    if (agent) {
      this.emit("agent:status", agent);
      console.log(`[Deck] Killed agent "${agent.name}" (${id})`);
    }
  }

  /** Send input to an agent */
  sendInput(id: string, text: string): void {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Agent ${id} not found or not running`);
    adapter.write(text);
  }

  /** Get all agents */
  getAgents(): DeckAgent[] {
    return this.store.getAllAgents();
  }

  /** Get active agents */
  getActiveAgents(): DeckAgent[] {
    return this.store.getActiveAgents();
  }

  /** Get agent events */
  getAgentEvents(id: string, limit = 100) {
    return this.store.getAgentEvents(id, limit);
  }

  /** Get recent events across all agents */
  getRecentEvents(limit = 50) {
    return this.store.getRecentEvents(limit);
  }

  /** Get agent output buffer (for detail panel history) */
  getAgentOutput(id: string, sinceSeq?: number) {
    return this.outputBuffers.getAgentOutput(id, sinceSeq);
  }

  /** Get session ID for an agent */
  getAgentSessionId(id: string): string | null {
    const adapter = this.adapters.get(id);
    return adapter?.getSessionId() || null;
  }

  /** Get all sessions */
  getSessions() {
    return this.store.getAllSessions();
  }

  /** Get a specific session */
  getSession(id: string) {
    return this.store.getSession(id);
  }

  /** Get cost estimate for an agent */
  getCostEstimate(agentId: string) {
    return this.costEstimator.getEstimate(agentId);
  }

  /** Get all cost estimates */
  getAllCostEstimates() {
    return this.costEstimator.getAllEstimates();
  }

  /** Get cost summary */
  getCostSummary() {
    return this.store.getCostSummary();
  }

  /** Get cost time series */
  getCostTimeSeries() {
    return this.store.getCostTimeSeries();
  }

  /** Get context window usage for an agent */
  getContextUsage(agentId: string) {
    return this.contextEstimator.getUsage(agentId);
  }

  // === Team Configs ===

  getTeamConfigs() {
    return this.store.getAllTeamConfigs();
  }

  /** Get file-based (YAML) team configs */
  getFileTeamConfigs(): Map<string, any> {
    return this.fileTeamConfigs;
  }

  /** Set file-based team configs (called from team-file-loader) */
  setFileTeamConfigs(configs: Map<string, any>): void {
    this.fileTeamConfigs = configs;
  }

  createTeamConfig(name: string, description: string, configJson: string) {
    return this.store.createTeamConfig(name, description, configJson);
  }

  updateTeamConfig(id: string, name: string, description: string, configJson: string) {
    return this.store.updateTeamConfig(id, name, description, configJson);
  }

  deleteTeamConfig(id: string) {
    return this.store.deleteTeamConfig(id);
  }

  /** Launch all agents from a team config (DB or file-based) */
  launchTeam(teamConfigId: string): DeckAgent[] {
    let parsed: TeamConfigSchema;

    // Check file-based configs first
    const fileConfig = this.fileTeamConfigs.get(teamConfigId);
    if (fileConfig) {
      parsed = fileConfig;
    } else {
      const config = this.store.getTeamConfig(teamConfigId);
      if (!config) throw new Error(`Team config ${teamConfigId} not found`);
      try {
        parsed = JSON.parse(config.config_json);
      } catch {
        throw new Error("Invalid team config JSON");
      }
    }

    // Check budget if set
    if (parsed.settings?.max_budget_usd) {
      const budgetCheck = this.costEstimator.checkBudget(parsed.settings.max_budget_usd);
      if (budgetCheck.exceeded) {
        throw new Error(
          `Team budget exceeded: $${budgetCheck.totalEstimated.toFixed(2)} >= $${parsed.settings.max_budget_usd}`
        );
      }
    }

    const agents: DeckAgent[] = [];
    for (const agentDef of parsed.agents) {
      const agent = this.spawnAgent({
        name: agentDef.name,
        prompt: agentDef.prompt,
        model: agentDef.model,
        workspace: agentDef.workspace,
        agent_type: agentDef.agent_type || "general",
        team_config_id: teamConfigId,
      });
      agents.push(agent);
    }

    return agents;
  }

  // === Agent-State Bridge (read-only) ===

  getAgentStateData(): {
    agents: any[];
    tasks: any[];
    decisions: any[];
  } | null {
    if (!this.agentStateDb) return null;

    try {
      const agents = this.agentStateDb
        .prepare("SELECT * FROM agents")
        .all();
      const tasks = this.agentStateDb
        .prepare("SELECT * FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY created_at DESC LIMIT 50")
        .all();
      const decisions = this.agentStateDb
        .prepare("SELECT * FROM decisions ORDER BY created_at DESC LIMIT 20")
        .all();

      return { agents, tasks, decisions };
    } catch {
      return null;
    }
  }

  // === Internal ===

  private handleStreamEvent(agentId: string, event: StreamEvent): void {
    this.store.touchAgent(agentId);

    // Push to output ring buffer
    this.outputBuffers.push(agentId, event);

    // Track output chars for cost estimation + context estimation
    if (event.type === "text") {
      const data = event.data as { content: string; isPartial?: boolean };
      if (data.content) {
        this.costEstimator.addOutputChars(agentId, data.content.length);
        this.contextEstimator.addOutputChars(agentId, data.content.length);
      }
    }

    // Track tool calls for context estimation
    if (event.type === "tool_call") {
      const data = event.data as { toolInput: unknown };
      const inputSize = JSON.stringify(data.toolInput || "").length;
      this.contextEstimator.addToolCallChars(agentId, inputSize);
    }

    // Emit context update
    const contextUsage = this.contextEstimator.getUsage(agentId);
    if (contextUsage) {
      this.emit("agent:context", agentId, contextUsage);
    }

    // Store event in DB
    let toolName: string | undefined;
    let content: string | undefined;

    if (event.type === "tool_call") {
      const data = event.data as { toolName: string; toolInput: unknown };
      toolName = data.toolName;
      content = JSON.stringify(data.toolInput);
    } else if (event.type === "text") {
      const data = event.data as { content: string; isPartial?: boolean };
      if (!data.isPartial) {
        content = data.content;
      }
    } else if (event.type === "error") {
      const data = event.data as { message: string };
      content = data.message;
    }

    // Only persist non-partial events
    if (event.type !== "text" || !(event.data as any).isPartial) {
      const eventId = this.store.addEvent(
        agentId,
        event.type,
        toolName,
        content?.slice(0, 10000) // Limit content size
      );

      const eventRecord = {
        id: eventId,
        agent_id: agentId,
        event_type: event.type,
        tool_name: toolName || null,
        content: content?.slice(0, 10000) || null,
        cost_usd: null,
        input_tokens: null,
        output_tokens: null,
        created_at: event.timestamp,
      };

      this.emit("agent:event", agentId, eventRecord);
    }

    // Forward raw stream event for real-time updates
    this.emit("agent:stream", agentId, event);
  }

  private handleComplete(agentId: string, data: CompleteEvent["data"]): void {
    // Skip if already completed (can be called twice: from parser + exit handler)
    const agent = this.store.getAgent(agentId);
    if (!agent || agent.status === "completed" || agent.status === "dead") return;

    this.store.updateAgentStatus(
      agentId,
      data.status === "error" ? "dead" : "completed"
    );

    // Update cost estimator with actual values
    if (data.costUsd) {
      this.costEstimator.setActualCost(
        agentId,
        data.costUsd,
        data.inputTokens || 0,
        data.outputTokens || 0
      );
    }

    // Record cost
    if (data.costUsd) {
      const updatedAgent = this.store.getAgent(agentId);
      if (updatedAgent) {
        this.store.updateAgentCost(
          agentId,
          data.costUsd,
          data.inputTokens || 0,
          data.outputTokens || 0
        );
        this.store.addCostSnapshot(
          agentId,
          updatedAgent.model,
          data.costUsd,
          data.inputTokens || 0,
          data.outputTokens || 0
        );

        this.store.addEvent(
          agentId,
          "complete",
          undefined,
          JSON.stringify({
            status: data.status,
            costUsd: data.costUsd,
            durationMs: data.durationMs,
          }),
          data.costUsd,
          data.inputTokens,
          data.outputTokens
        );
      }
    }

    // Save session snapshot
    const outputSnapshot = this.outputBuffers.serialize(agentId);
    this.store.saveSession({
      agent_id: agentId,
      session_id: data.sessionId || this.getAgentSessionId(agentId) || null,
      status: data.status === "error" ? "crashed" : "completed",
      config_json: JSON.stringify({
        name: agent.name,
        prompt: agent.prompt,
        model: agent.model,
        workspace: agent.workspace_path,
        agent_type: agent.agent_type,
        interactive: agent.interactive,
      }),
      output_snapshot: outputSnapshot || undefined,
      total_cost_usd: (agent.total_cost_usd || 0) + (data.costUsd || 0),
      total_input_tokens: (agent.total_input_tokens || 0) + (data.inputTokens || 0),
      total_output_tokens: (agent.total_output_tokens || 0) + (data.outputTokens || 0),
    });

    // Clean up adapter and buffers
    const adapter = this.adapters.get(agentId);
    if (adapter) {
      adapter.dispose();
      this.adapters.delete(agentId);
    }
    this.costEstimator.remove(agentId);
    this.contextEstimator.remove(agentId);
    // Keep output buffer for a while (detail panel may still be open)

    const finalAgent = this.store.getAgent(agentId);
    if (finalAgent) {
      this.emit("agent:status", finalAgent);
      console.log(
        `[Deck] Agent "${finalAgent.name}" completed (cost: $${finalAgent.total_cost_usd.toFixed(4)})`
      );
    }
  }

  private startIdleDetection(): void {
    this.idleTimer = setInterval(() => {
      const activeAgents = this.store.getActiveAgents();
      const now = Date.now();

      for (const agent of activeAgents) {
        if (agent.status !== "running") continue;
        if (!agent.last_event_at) continue;

        const lastEvent = new Date(agent.last_event_at + "Z").getTime();
        if (now - lastEvent > IDLE_THRESHOLD_MS) {
          if (agent.status !== ("idle" as any)) {
            this.store.updateAgentStatus(agent.id, "idle");
            const updated = this.store.getAgent(agent.id)!;
            this.emit("agent:status", updated);
          }
        }
      }
    }, 5000);
  }

  /** Periodically emit cost estimates for active agents */
  private startCostEmission(): void {
    this.costEmitTimer = setInterval(() => {
      const estimates = this.costEstimator.getAllEstimates();
      for (const estimate of estimates) {
        this.emit("agent:cost", estimate.agentId, estimate);
      }
    }, 5000);
  }

  private initAgentStateBridge(): void {
    const dbPath =
      process.env.AGENT_STATE_DB ||
      path.join(os.homedir(), ".claude", "agent-state.db");

    try {
      this.agentStateDb = new Database(dbPath, { readonly: true });
      this.agentStateDb.pragma("journal_mode = WAL");
      console.log(`[Deck] Agent-state bridge connected: ${dbPath}`);
    } catch {
      console.log("[Deck] Agent-state bridge not available (no agent-state.db)");
    }
  }

  /** Expose store for session recovery */
  getStore(): DeckStore {
    return this.store;
  }

  /** Dispose all resources */
  dispose(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.costEmitTimer) clearInterval(this.costEmitTimer);

    for (const [id, adapter] of this.adapters) {
      adapter.dispose();
    }
    this.adapters.clear();

    if (this.agentStateDb) {
      this.agentStateDb.close();
    }

    this.removeAllListeners();
  }
}

// Type-safe emitter
export interface DeckManager {
  on<K extends keyof DeckManagerEvents>(
    event: K,
    listener: (...args: DeckManagerEvents[K]) => void
  ): this;
  emit<K extends keyof DeckManagerEvents>(
    event: K,
    ...args: DeckManagerEvents[K]
  ): boolean;
}
