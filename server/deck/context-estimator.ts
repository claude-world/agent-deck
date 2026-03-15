/**
 * Context Window Estimator
 *
 * Estimates context window usage based on accumulated input/output tokens.
 * Uses chars/4 heuristic until actual token counts are available.
 */

/** Model context limits (tokens) */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  haiku: 200_000,
  sonnet: 200_000,
  opus: 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-6": 200_000,
};

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

export class ContextEstimator {
  private trackers: Map<string, AgentContextTracker> = new Map();

  /** Start tracking context for an agent */
  startTracking(agentId: string, model: string, prompt: string): void {
    this.trackers.set(agentId, new AgentContextTracker(model, prompt));
  }

  /** Add output character count (text events) */
  addOutputChars(agentId: string, charCount: number): void {
    this.trackers.get(agentId)?.addOutputChars(charCount);
  }

  /** Add tool call input character count */
  addToolCallChars(agentId: string, charCount: number): void {
    this.trackers.get(agentId)?.addToolCallChars(charCount);
  }

  /** Set actual token counts from complete event */
  setActualTokens(agentId: string, inputTokens: number, outputTokens: number): void {
    this.trackers.get(agentId)?.setActual(inputTokens, outputTokens);
  }

  /** Get current usage for an agent */
  getUsage(agentId: string): ContextUsage | null {
    return this.trackers.get(agentId)?.getUsage() || null;
  }

  /** Get all active usages */
  getAllUsages(): Array<{ agentId: string } & ContextUsage> {
    const results: Array<{ agentId: string } & ContextUsage> = [];
    for (const [agentId, tracker] of this.trackers) {
      results.push({ agentId, ...tracker.getUsage() });
    }
    return results;
  }

  /** Remove tracker */
  remove(agentId: string): void {
    this.trackers.delete(agentId);
  }
}

class AgentContextTracker {
  private model: string;
  private promptTokens: number;
  private outputCharCount = 0;
  private toolCallCharCount = 0;
  private actualInputTokens: number | null = null;
  private actualOutputTokens: number | null = null;

  constructor(model: string, prompt: string) {
    this.model = model;
    // Estimate initial prompt tokens (~4 chars per token)
    this.promptTokens = Math.ceil(prompt.length / 4);
  }

  addOutputChars(charCount: number): void {
    this.outputCharCount += charCount;
  }

  addToolCallChars(charCount: number): void {
    this.toolCallCharCount += charCount;
  }

  setActual(inputTokens: number, outputTokens: number): void {
    this.actualInputTokens = inputTokens;
    this.actualOutputTokens = outputTokens;
  }

  getUsage(): ContextUsage {
    const maxTokens = MODEL_CONTEXT_LIMITS[this.model] || 200_000;

    let usedTokens: number;
    if (this.actualInputTokens !== null && this.actualOutputTokens !== null) {
      usedTokens = this.actualInputTokens + this.actualOutputTokens;
    } else {
      // Estimate: prompt tokens + output tokens + tool call tokens
      const estimatedOutputTokens = Math.ceil(this.outputCharCount / 4);
      const estimatedToolTokens = Math.ceil(this.toolCallCharCount / 4);
      usedTokens = this.promptTokens + estimatedOutputTokens + estimatedToolTokens;
    }

    const percentage = Math.min((usedTokens / maxTokens) * 100, 100);

    return { usedTokens, maxTokens, percentage };
  }
}
