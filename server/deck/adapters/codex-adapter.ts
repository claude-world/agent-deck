/**
 * Codex CLI Adapter (stub)
 *
 * Placeholder for OpenAI Codex CLI integration.
 * All methods throw "Not yet implemented" until Codex CLI support is added.
 */

import { EventEmitter } from "events";
import type { AgentAdapter, AdapterEvents } from "../adapter-interface.js";
import type { SpawnAgentConfig } from "../types.js";

export class CodexAdapter extends EventEmitter implements AgentAdapter {
  private agentId: string;

  constructor(agentId: string) {
    super();
    this.agentId = agentId;
  }

  spawn(_config: SpawnAgentConfig): number {
    throw new Error("Codex CLI adapter not yet implemented. Install codex and configure the adapter.");
  }

  write(_text: string): void {
    throw new Error("Codex CLI adapter not yet implemented");
  }

  kill(): void {
    // no-op for stub
  }

  interrupt(): void {
    // no-op for stub
  }

  dispose(): void {
    this.removeAllListeners();
  }

  isRunning(): boolean {
    return false;
  }

  getPid(): number | null {
    return null;
  }

  getSessionId(): string | null {
    return null;
  }
}

// Type-safe emitter
export interface CodexAdapter {
  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
