/**
 * Agent Adapter Interface
 *
 * Defines the contract for all agent runtime adapters (Claude Code, Codex, Gemini CLI, LiteLLM).
 * Uses EventEmitter pattern to match existing wiring.
 */

import type { EventEmitter } from "events";
import type { SpawnAgentConfig, StreamEvent, CompleteEvent } from "./types.js";

export type RuntimeType = "claude-code" | "codex" | "gemini-cli" | "litellm";

export interface AdapterEvents {
  stream: [StreamEvent];
  complete: [CompleteEvent["data"]];
  error: [Error];
}

export interface AgentAdapter extends EventEmitter {
  spawn(config: SpawnAgentConfig): number;
  write(text: string): void;
  kill(): void;
  interrupt(): void;
  dispose(): void;
  isRunning(): boolean;
  getPid(): number | null;
  getSessionId(): string | null;

  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
