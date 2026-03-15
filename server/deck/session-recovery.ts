/**
 * Session Recovery - Handle graceful shutdown and session resumption
 *
 * On startup: scan for crashed sessions.
 * On shutdown: SIGINT all agents, record session IDs.
 * Provides resume capability via --resume SESSION_ID.
 */

import type { DeckStore } from "./deck-db.js";
import type { DeckManager } from "./deck-manager.js";

export interface CrashedSession {
  id: string;
  agent_id: string;
  session_id: string | null;
  config_json: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  total_cost_usd: number;
}

export class SessionRecovery {
  private store: DeckStore;
  private deckManager: DeckManager | null = null;
  private isShuttingDown = false;

  constructor(store: DeckStore) {
    this.store = store;
  }

  /** Set deck manager reference (called after construction to avoid circular dep) */
  setDeckManager(manager: DeckManager): void {
    this.deckManager = manager;
  }

  /** Scan for crashed sessions on startup */
  getCrashedSessions(): CrashedSession[] {
    return this.store.getCrashedSessions();
  }

  /** Resume a crashed session by spawning with --resume */
  async resumeSession(sessionId: string): Promise<string | null> {
    if (!this.deckManager) return null;

    const session = this.store.getSession(sessionId);
    if (!session || !session.session_id) return null;

    try {
      const config = JSON.parse(session.config_json);
      const agent = this.deckManager.spawnAgent({
        ...config,
        resumeSessionId: session.session_id,
      });

      // Update session status
      this.store.updateSessionStatus(sessionId, "resumed");

      return agent.id;
    } catch {
      return null;
    }
  }

  /** Register shutdown handlers */
  registerShutdownHandlers(): void {
    const shutdown = () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.log("\n[SessionRecovery] Graceful shutdown initiated...");
      this.handleGracefulShutdown();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  /** Gracefully shut down all agents and persist session state */
  private handleGracefulShutdown(): void {
    if (!this.deckManager) {
      process.exit(0);
      return;
    }

    // Save active agent sessions
    const activeAgents = this.deckManager.getActiveAgents();
    for (const agent of activeAgents) {
      const sessionId = this.deckManager.getAgentSessionId(agent.id);
      this.store.saveSession({
        agent_id: agent.id,
        session_id: sessionId || null,
        status: "shutdown",
        config_json: JSON.stringify({
          name: agent.name,
          prompt: agent.prompt,
          model: agent.model,
          workspace: agent.workspace_path,
          agent_type: agent.agent_type,
        }),
        total_cost_usd: agent.total_cost_usd,
        total_input_tokens: agent.total_input_tokens,
        total_output_tokens: agent.total_output_tokens,
      });
    }

    // Dispose deck manager (sends SIGKILL to all agents)
    this.deckManager.dispose();

    console.log(`[SessionRecovery] Saved ${activeAgents.length} agent sessions`);
    process.exit(0);
  }
}
