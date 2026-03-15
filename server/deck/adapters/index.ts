/**
 * Adapter Factory
 *
 * Creates the appropriate AgentAdapter based on runtime type.
 */

import type { AgentAdapter, RuntimeType } from "../adapter-interface.js";
import { ClaudeAdapter } from "./claude-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import { LiteLLMAdapter } from "./litellm-adapter.js";

export function createAdapter(
  agentId: string,
  runtime: RuntimeType,
  options?: { litellmProxyUrl?: string }
): AgentAdapter {
  switch (runtime) {
    case "claude-code":
      return new ClaudeAdapter(agentId);
    case "codex":
      return new CodexAdapter(agentId);
    case "gemini-cli":
      throw new Error("Gemini CLI adapter not yet implemented");
    case "litellm": {
      const proxyUrl = options?.litellmProxyUrl || process.env.LITELLM_PROXY_URL || "http://localhost:4000";
      return new LiteLLMAdapter(agentId, proxyUrl);
    }
    default:
      throw new Error(`Unknown runtime: ${runtime}`);
  }
}

export { ClaudeAdapter } from "./claude-adapter.js";
export { CodexAdapter } from "./codex-adapter.js";
export { LiteLLMAdapter } from "./litellm-adapter.js";
