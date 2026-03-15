/**
 * LiteLLM Proxy Adapter
 *
 * Makes streaming HTTP POST to LiteLLM proxy (/chat/completions, stream: true).
 * Parses SSE chunks (OpenAI format) and emits normalized StreamEvent objects.
 * No child process - pure HTTP client.
 */

import { EventEmitter } from "events";
import type { AgentAdapter, AdapterEvents } from "../adapter-interface.js";
import type { SpawnAgentConfig, StreamEvent, CompleteEvent } from "../types.js";

export class LiteLLMAdapter extends EventEmitter implements AgentAdapter {
  private agentId: string;
  private proxyUrl: string;
  private running = false;
  private abortController: AbortController | null = null;
  private sessionId: string | null = null;
  private fakePid: number;

  constructor(agentId: string, proxyUrl: string) {
    super();
    this.agentId = agentId;
    this.proxyUrl = proxyUrl.replace(/\/$/, "");
    // Generate a fake PID since there's no child process
    this.fakePid = Math.floor(Math.random() * 100000) + 50000;
  }

  spawn(config: SpawnAgentConfig): number {
    if (this.running) {
      throw new Error("Already running");
    }
    this.running = true;
    this.sessionId = `litellm-${Date.now()}`;

    // Emit init event
    const initEvent: StreamEvent = {
      type: "init",
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      data: { sessionId: this.sessionId },
    };
    this.emit("stream", initEvent);

    // Start streaming in background
    this.streamCompletion(config).catch((err) => {
      this.emit("error", err);
      this.running = false;
    });

    return this.fakePid;
  }

  write(_text: string): void {
    throw new Error("LiteLLM adapter does not support interactive input");
  }

  kill(): void {
    this.abortController?.abort();
    this.running = false;
  }

  interrupt(): void {
    this.kill();
  }

  dispose(): void {
    this.kill();
    this.removeAllListeners();
  }

  isRunning(): boolean {
    return this.running;
  }

  getPid(): number | null {
    return this.running ? this.fakePid : null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private async streamCompletion(config: SpawnAgentConfig): Promise<void> {
    this.abortController = new AbortController();
    const startTime = Date.now();
    let totalContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const model = this.mapModel(config.model || "sonnet");
      const response = await fetch(`${this.proxyUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: config.prompt }],
          stream: true,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LiteLLM error ${response.status}: ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) {
              totalContent += delta.content;
              const textEvent: StreamEvent = {
                type: "text",
                agentId: this.agentId,
                timestamp: new Date().toISOString(),
                data: { content: delta.content, isPartial: true },
              };
              this.emit("stream", textEvent);
            }

            // Capture usage from the final chunk
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens || 0;
              outputTokens = chunk.usage.completion_tokens || 0;
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }

      // Emit final text event
      if (totalContent) {
        const finalText: StreamEvent = {
          type: "text",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          data: { content: totalContent, isPartial: false },
        };
        this.emit("stream", finalText);
      }

      // Estimate cost if usage available
      const durationMs = Date.now() - startTime;
      const costUsd = this.estimateCost(inputTokens, outputTokens, config.model || "sonnet");

      const completeData: CompleteEvent["data"] = {
        status: "success",
        durationMs,
        sessionId: this.sessionId || undefined,
        costUsd,
        inputTokens,
        outputTokens,
      };

      const completeEvent: StreamEvent = {
        type: "complete",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: completeData,
      };
      this.emit("stream", completeEvent);
      this.emit("complete", completeData);
    } catch (err: any) {
      if (err.name === "AbortError") {
        this.emit("complete", { status: "cancelled" });
      } else {
        const errorEvent: StreamEvent = {
          type: "error",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          data: { code: "LITELLM_ERROR", message: err.message },
        };
        this.emit("stream", errorEvent);
        this.emit("complete", {
          status: "error",
          error: err.message,
          durationMs: Date.now() - startTime,
        });
      }
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  private mapModel(model: string): string {
    // Map short names to model IDs that LiteLLM recognizes
    const mapping: Record<string, string> = {
      sonnet: "claude-sonnet-4-6-20250514",
      opus: "claude-opus-4-6-20250514",
      haiku: "claude-haiku-4-5-20251001",
    };
    return mapping[model] || model;
  }

  private estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      sonnet: { input: 3, output: 15 },
      opus: { input: 15, output: 75 },
      haiku: { input: 0.25, output: 1.25 },
    };
    const p = pricing[model] || pricing.sonnet;
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }
}

// Type-safe emitter
export interface LiteLLMAdapter {
  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
