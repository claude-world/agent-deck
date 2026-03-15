/**
 * Agent Deck v1.0 - Database Schema & Store
 *
 * Unified DB module with enhanced schema for workflows, settings, and agent events.
 */

import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type {
  Agent,
  AgentConfig,
  AgentStatus,
  CostSummary,
  DeckTeamConfig,
  DeckSettings,
  RuntimeType,
  Workspace,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../../data/deck.db");

// =====================================================
// Schema Init
// =====================================================

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_type TEXT NOT NULL DEFAULT 'general',
      team_config_id TEXT,
      pid INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      model TEXT NOT NULL DEFAULT 'sonnet',
      workspace_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      last_event_at TEXT,
      total_cost_usd REAL DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      interactive INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,
      runtime TEXT NOT NULL DEFAULT 'claude-code'
    );

    CREATE TABLE IF NOT EXISTS deck_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES deck_agents(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      content TEXT,
      cost_usd REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_cost_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES deck_agents(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_team_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      config_json TEXT NOT NULL,
      output_snapshot TEXT,
      started_at TEXT,
      ended_at TEXT,
      total_cost_usd REAL DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deck_workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'planning',
      total_cost REAL DEFAULT 0,
      max_budget_usd REAL DEFAULT 50,
      started_at INTEGER,
      completed_at INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_workflow_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id TEXT NOT NULL REFERENCES deck_workflows(id) ON DELETE CASCADE,
      agent_name TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      cost REAL DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      agent_id TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deck_workflow_edges (
      workflow_id TEXT NOT NULL REFERENCES deck_workflows(id) ON DELETE CASCADE,
      source_agent TEXT NOT NULL,
      target_agent TEXT NOT NULL,
      condition TEXT NOT NULL DEFAULT 'success'
    );

    CREATE TABLE IF NOT EXISTS deck_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      framework TEXT,
      language TEXT,
      git_branch TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deck_events_agent ON deck_events(agent_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_deck_cost_agent ON deck_cost_snapshots(agent_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_deck_sessions_status ON deck_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_deck_workflow_nodes ON deck_workflow_nodes(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_deck_workflow_edges ON deck_workflow_edges(workflow_id);
  `);

  // Migrations for upgrading from older versions
  const migrations = [
    `ALTER TABLE deck_agents ADD COLUMN interactive INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE deck_agents ADD COLUMN session_id TEXT`,
    `ALTER TABLE deck_agents ADD COLUMN runtime TEXT NOT NULL DEFAULT 'claude-code'`,
    `ALTER TABLE deck_workflows ADD COLUMN max_budget_usd REAL DEFAULT 50`,
    `ALTER TABLE deck_workflows ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE deck_workflows ADD COLUMN commit_hash TEXT`,
    `ALTER TABLE deck_workflows ADD COLUMN commit_message TEXT`,
    `ALTER TABLE deck_workflows ADD COLUMN pushed INTEGER DEFAULT 0`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch {}
  }
}

// =====================================================
// DeckStore - Data Access Layer
// =====================================================

export class DeckStore {
  private db: Database.Database;
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(db: Database.Database) {
    this.db = db;
    initSchema(db);
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      // Agents
      insertAgent: this.db.prepare(`
        INSERT INTO deck_agents (id, name, agent_type, team_config_id, pid, status, model, workspace_path, prompt, interactive, runtime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getAgent: this.db.prepare(`SELECT * FROM deck_agents WHERE id = ?`),
      getAllAgents: this.db.prepare(`SELECT * FROM deck_agents ORDER BY started_at DESC`),
      getActiveAgents: this.db.prepare(
        `SELECT * FROM deck_agents WHERE status IN ('running', 'idle', 'paused') ORDER BY started_at DESC`
      ),
      updateAgentStatus: this.db.prepare(
        `UPDATE deck_agents SET status = ?, last_event_at = datetime('now') WHERE id = ?`
      ),
      updateAgentPid: this.db.prepare(
        `UPDATE deck_agents SET pid = ? WHERE id = ?`
      ),
      updateAgentCost: this.db.prepare(`
        UPDATE deck_agents SET
          total_cost_usd = total_cost_usd + ?,
          total_input_tokens = total_input_tokens + ?,
          total_output_tokens = total_output_tokens + ?,
          last_event_at = datetime('now')
        WHERE id = ?
      `),
      touchAgent: this.db.prepare(
        `UPDATE deck_agents SET last_event_at = datetime('now') WHERE id = ?`
      ),
      updateAgentSessionId: this.db.prepare(
        `UPDATE deck_agents SET session_id = ? WHERE id = ?`
      ),
      deleteAgent: this.db.prepare(`DELETE FROM deck_agents WHERE id = ?`),

      // Sessions
      insertSession: this.db.prepare(`
        INSERT INTO deck_sessions (id, agent_id, session_id, status, config_json, output_snapshot, started_at, ended_at, total_cost_usd, total_input_tokens, total_output_tokens)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getSession: this.db.prepare(`SELECT * FROM deck_sessions WHERE id = ?`),
      getAllSessions: this.db.prepare(`SELECT * FROM deck_sessions ORDER BY ended_at DESC LIMIT 50`),
      getCrashedSessions: this.db.prepare(
        `SELECT * FROM deck_sessions WHERE status IN ('crashed', 'shutdown') ORDER BY ended_at DESC`
      ),
      updateSessionStatus: this.db.prepare(
        `UPDATE deck_sessions SET status = ? WHERE id = ?`
      ),

      // Events
      insertEvent: this.db.prepare(`
        INSERT INTO deck_events (agent_id, event_type, tool_name, content, cost_usd, input_tokens, output_tokens)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getAgentEvents: this.db.prepare(`
        SELECT * FROM deck_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
      `),
      getRecentEvents: this.db.prepare(`
        SELECT e.*, a.name as agent_name FROM deck_events e
        JOIN deck_agents a ON e.agent_id = a.id
        ORDER BY e.created_at DESC LIMIT ?
      `),

      // Cost snapshots
      insertCostSnapshot: this.db.prepare(`
        INSERT INTO deck_cost_snapshots (agent_id, model, cost_usd, input_tokens, output_tokens, cache_read_tokens)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getTodayCost: this.db.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total
        FROM deck_cost_snapshots WHERE recorded_at >= date('now')
      `),
      getCostTimeSeries: this.db.prepare(`
        SELECT strftime('%H', recorded_at) as hour, SUM(cost_usd) as cost
        FROM deck_cost_snapshots
        WHERE recorded_at >= datetime('now', '-24 hours')
        GROUP BY hour ORDER BY hour
      `),

      // Team configs
      insertTeamConfig: this.db.prepare(`
        INSERT INTO deck_team_configs (id, name, description, config_json) VALUES (?, ?, ?, ?)
      `),
      getTeamConfig: this.db.prepare(`SELECT * FROM deck_team_configs WHERE id = ?`),
      getAllTeamConfigs: this.db.prepare(
        `SELECT * FROM deck_team_configs ORDER BY updated_at DESC`
      ),
      updateTeamConfig: this.db.prepare(`
        UPDATE deck_team_configs SET name = ?, description = ?, config_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `),
      deleteTeamConfig: this.db.prepare(`DELETE FROM deck_team_configs WHERE id = ?`),

      // Workflows
      insertWorkflow: this.db.prepare(`
        INSERT INTO deck_workflows (id, name, config_json, status, total_cost, max_budget_usd, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getWorkflow: this.db.prepare(`SELECT * FROM deck_workflows WHERE id = ?`),
      getAllWorkflows: this.db.prepare(
        `SELECT * FROM deck_workflows ORDER BY created_at DESC LIMIT 50`
      ),
      updateWorkflowStatus: this.db.prepare(
        `UPDATE deck_workflows SET status = ?, total_cost = ?, completed_at = ? WHERE id = ?`
      ),
      deleteWorkflow: this.db.prepare(`DELETE FROM deck_workflows WHERE id = ?`),

      // Workflow nodes
      insertWorkflowNode: this.db.prepare(`
        INSERT INTO deck_workflow_nodes (workflow_id, agent_name, config_json, status)
        VALUES (?, ?, ?, ?)
      `),
      getWorkflowNodes: this.db.prepare(
        `SELECT * FROM deck_workflow_nodes WHERE workflow_id = ?`
      ),
      updateWorkflowNode: this.db.prepare(`
        UPDATE deck_workflow_nodes SET status = ?, cost = ?, agent_id = ?, error = ?
        WHERE workflow_id = ? AND agent_name = ?
      `),

      // Workflow edges
      insertWorkflowEdge: this.db.prepare(`
        INSERT INTO deck_workflow_edges (workflow_id, source_agent, target_agent, condition)
        VALUES (?, ?, ?, ?)
      `),
      getWorkflowEdges: this.db.prepare(
        `SELECT * FROM deck_workflow_edges WHERE workflow_id = ?`
      ),

      // Settings
      getSetting: this.db.prepare(`SELECT value FROM deck_settings WHERE key = ?`),
      upsertSetting: this.db.prepare(`
        INSERT INTO deck_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `),
      getAllSettings: this.db.prepare(`SELECT * FROM deck_settings`),

      // Workspaces
      insertWorkspace: this.db.prepare(`
        INSERT INTO deck_workspaces (id, name, path, framework, language, git_branch)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getWorkspace: this.db.prepare(`SELECT * FROM deck_workspaces WHERE id = ?`),
      getWorkspaceByPath: this.db.prepare(`SELECT * FROM deck_workspaces WHERE path = ?`),
      getAllWorkspaces: this.db.prepare(`SELECT * FROM deck_workspaces ORDER BY last_used_at DESC`),
      updateWorkspace: this.db.prepare(`
        UPDATE deck_workspaces SET name = ?, framework = ?, language = ?, git_branch = ?
        WHERE id = ?
      `),
      touchWorkspace: this.db.prepare(
        `UPDATE deck_workspaces SET last_used_at = datetime('now') WHERE id = ?`
      ),
      deleteWorkspace: this.db.prepare(`DELETE FROM deck_workspaces WHERE id = ?`),

      // Workflow workspace link
      updateWorkflowWorkspace: this.db.prepare(
        `UPDATE deck_workflows SET workspace_id = ? WHERE id = ?`
      ),
      updateWorkflowCommit: this.db.prepare(
        `UPDATE deck_workflows SET commit_hash = ?, commit_message = ?, pushed = ? WHERE id = ?`
      ),
      getWorkflowsByWorkspace: this.db.prepare(
        `SELECT * FROM deck_workflows WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50`
      ),
    };
  }

  // === Agents ===

  createAgent(config: AgentConfig): Agent {
    const id = uuidv4();
    this.stmts.insertAgent.run(
      id,
      config.name,
      config.agent_type || "general",
      config.team_config_id || null,
      null,
      "running",
      config.model || "sonnet",
      config.workspace || process.cwd(),
      config.prompt,
      config.interactive ? 1 : 0,
      config.runtime || "claude-code"
    );
    return this.getAgent(id)!;
  }

  getAgent(id: string): Agent | undefined {
    const row = this.stmts.getAgent.get(id) as any;
    return row ? this.normalizeAgentRow(row) : undefined;
  }

  private normalizeAgentRow(r: any): Agent {
    return {
      ...r,
      visible: true,
      interactive: !!r.interactive,
      session_id: r.session_id || null,
      runtime: r.runtime || "claude-code",
    };
  }

  getAllAgents(): Agent[] {
    return (this.stmts.getAllAgents.all() as any[]).map((r) => this.normalizeAgentRow(r));
  }

  getActiveAgents(): Agent[] {
    return (this.stmts.getActiveAgents.all() as any[]).map((r) => this.normalizeAgentRow(r));
  }

  updateAgentStatus(id: string, status: AgentStatus): void {
    this.stmts.updateAgentStatus.run(status, id);
  }

  updateAgentPid(id: string, pid: number): void {
    this.stmts.updateAgentPid.run(pid, id);
  }

  updateAgentCost(id: string, costUsd: number, inputTokens: number, outputTokens: number): void {
    this.stmts.updateAgentCost.run(costUsd, inputTokens, outputTokens, id);
  }

  touchAgent(id: string): void {
    this.stmts.touchAgent.run(id);
  }

  deleteAgent(id: string): void {
    this.stmts.deleteAgent.run(id);
  }

  updateAgentSessionId(id: string, sessionId: string): void {
    this.stmts.updateAgentSessionId.run(sessionId, id);
  }

  // === Events ===

  addEvent(
    agentId: string,
    eventType: string,
    toolName?: string,
    content?: string,
    costUsd?: number,
    inputTokens?: number,
    outputTokens?: number
  ): number {
    const result = this.stmts.insertEvent.run(
      agentId, eventType, toolName || null, content || null,
      costUsd || null, inputTokens || null, outputTokens || null
    );
    return Number(result.lastInsertRowid);
  }

  getAgentEvents(agentId: string, limit = 100): any[] {
    return this.stmts.getAgentEvents.all(agentId, limit) as any[];
  }

  getRecentEvents(limit = 50): any[] {
    return this.stmts.getRecentEvents.all(limit) as any[];
  }

  // === Cost ===

  addCostSnapshot(agentId: string, model: string, costUsd: number, inputTokens: number, outputTokens: number, cacheReadTokens = 0): void {
    this.stmts.insertCostSnapshot.run(agentId, model, costUsd, inputTokens, outputTokens, cacheReadTokens);
  }

  getCostSummary(): CostSummary {
    const agents = this.getAllAgents();
    const activeAgents = agents.filter((a) => a.status === "running" || a.status === "idle");
    const todayRow = this.stmts.getTodayCost.get() as { total: number };
    const totalCost = agents.reduce((sum, a) => sum + (a.total_cost_usd || 0), 0);

    return {
      total_cost_usd: totalCost,
      today_cost_usd: todayRow.total,
      active_agents: activeAgents.length,
      by_agent: agents
        .filter((a) => a.total_cost_usd > 0)
        .map((a) => ({
          agent_id: a.id,
          agent_name: a.name,
          cost_usd: a.total_cost_usd,
          input_tokens: a.total_input_tokens,
          output_tokens: a.total_output_tokens,
        })),
    };
  }

  getCostTimeSeries(): Array<{ hour: string; cost: number }> {
    return this.stmts.getCostTimeSeries.all() as any[];
  }

  // === Team Configs ===

  createTeamConfig(name: string, description: string, configJson: string): DeckTeamConfig {
    const id = uuidv4();
    this.stmts.insertTeamConfig.run(id, name, description, configJson);
    return this.stmts.getTeamConfig.get(id) as DeckTeamConfig;
  }

  getTeamConfig(id: string): DeckTeamConfig | undefined {
    return this.stmts.getTeamConfig.get(id) as DeckTeamConfig | undefined;
  }

  getAllTeamConfigs(): DeckTeamConfig[] {
    return this.stmts.getAllTeamConfigs.all() as DeckTeamConfig[];
  }

  updateTeamConfig(id: string, name: string, description: string, configJson: string): void {
    this.stmts.updateTeamConfig.run(name, description, configJson, id);
  }

  deleteTeamConfig(id: string): void {
    this.stmts.deleteTeamConfig.run(id);
  }

  // === Sessions ===

  saveSession(data: {
    agent_id: string;
    session_id: string | null;
    status: string;
    config_json: string;
    output_snapshot?: string;
    total_cost_usd?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
  }): string {
    const id = uuidv4();
    this.stmts.insertSession.run(
      id, data.agent_id, data.session_id || null, data.status, data.config_json,
      data.output_snapshot || null, null,
      new Date().toISOString().replace("T", " ").slice(0, 19),
      data.total_cost_usd || 0, data.total_input_tokens || 0, data.total_output_tokens || 0
    );
    return id;
  }

  getSession(id: string): any {
    return this.stmts.getSession.get(id);
  }

  getAllSessions(): any[] {
    return this.stmts.getAllSessions.all();
  }

  getCrashedSessions(): any[] {
    return this.stmts.getCrashedSessions.all();
  }

  updateSessionStatus(id: string, status: string): void {
    this.stmts.updateSessionStatus.run(status, id);
  }

  // === Workflows ===

  saveWorkflow(workflow: {
    id: string;
    name: string;
    config_json: string;
    status: string;
    total_cost: number;
    max_budget_usd?: number;
    started_at: number | null;
  }): void {
    this.stmts.insertWorkflow.run(
      workflow.id, workflow.name, workflow.config_json, workflow.status,
      workflow.total_cost, workflow.max_budget_usd ?? 50, workflow.started_at
    );
  }

  getWorkflow(id: string): any {
    return this.stmts.getWorkflow.get(id);
  }

  getAllWorkflows(): any[] {
    return this.stmts.getAllWorkflows.all();
  }

  updateWorkflowStatus(id: string, status: string, totalCost: number, completedAt: number | null): void {
    this.stmts.updateWorkflowStatus.run(status, totalCost, completedAt, id);
  }

  deleteWorkflow(id: string): void {
    this.stmts.deleteWorkflow.run(id);
  }

  saveWorkflowNode(workflowId: string, agentName: string, configJson: string, status: string): void {
    this.stmts.insertWorkflowNode.run(workflowId, agentName, configJson, status);
  }

  getWorkflowNodes(workflowId: string): any[] {
    return this.stmts.getWorkflowNodes.all(workflowId);
  }

  updateWorkflowNode(workflowId: string, agentName: string, status: string, cost: number, agentId: string | null, error: string | null): void {
    this.stmts.updateWorkflowNode.run(status, cost, agentId, error, workflowId, agentName);
  }

  saveWorkflowEdge(workflowId: string, source: string, target: string, condition: string): void {
    this.stmts.insertWorkflowEdge.run(workflowId, source, target, condition);
  }

  getWorkflowEdges(workflowId: string): any[] {
    return this.stmts.getWorkflowEdges.all(workflowId);
  }

  // === Settings ===

  getSetting(key: string): string | undefined {
    const row = this.stmts.getSetting.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.stmts.upsertSetting.run(key, value);
  }

  getAllSettings(): Record<string, string> {
    const rows = this.stmts.getAllSettings.all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  // === Workspaces ===

  createWorkspace(id: string, name: string, wsPath: string, framework?: string, language?: string, gitBranch?: string): Workspace {
    this.stmts.insertWorkspace.run(id, name, wsPath, framework || null, language || null, gitBranch || null);
    return this.stmts.getWorkspace.get(id) as Workspace;
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.stmts.getWorkspace.get(id) as Workspace | undefined;
  }

  getWorkspaceByPath(wsPath: string): Workspace | undefined {
    return this.stmts.getWorkspaceByPath.get(wsPath) as Workspace | undefined;
  }

  getAllWorkspaces(): Workspace[] {
    return this.stmts.getAllWorkspaces.all() as Workspace[];
  }

  updateWorkspaceInfo(id: string, name: string, framework?: string, language?: string, gitBranch?: string): void {
    this.stmts.updateWorkspace.run(name, framework || null, language || null, gitBranch || null, id);
  }

  touchWorkspace(id: string): void {
    this.stmts.touchWorkspace.run(id);
  }

  deleteWorkspace(id: string): void {
    this.stmts.deleteWorkspace.run(id);
  }

  updateWorkflowWorkspace(workflowId: string, workspaceId: string): void {
    this.stmts.updateWorkflowWorkspace.run(workspaceId, workflowId);
  }

  updateWorkflowCommit(workflowId: string, commitHash: string, commitMessage: string, pushed: boolean): void {
    this.stmts.updateWorkflowCommit.run(commitHash, commitMessage, pushed ? 1 : 0, workflowId);
  }

  getWorkflowsByWorkspace(workspaceId: string): any[] {
    return this.stmts.getWorkflowsByWorkspace.all(workspaceId);
  }

  // === Cleanup ===

  cleanupOrphans(): number {
    const staleAgents = this.getActiveAgents().filter((a) => {
      if (!a.pid) return true;
      try {
        process.kill(a.pid, 0);
        return false;
      } catch {
        return true;
      }
    });
    for (const agent of staleAgents) {
      this.updateAgentStatus(agent.id, "dead");
    }
    return staleAgents.length;
  }
}

// =====================================================
// Default DB instance
// =====================================================

const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export default db;
