/**
 * Cost Estimator - Real-time cost estimation from stream events
 *
 * Provides rough cost estimates during streaming (before final result event),
 * then replaces with actual cost when available.
 */

/** Pricing per million tokens (USD) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
  haiku: { input: 0.25, output: 1.25 },
  // Fallback aliases
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
};

export interface CostEstimate {
  agentId: string;
  model: string;
  estimatedCostUsd: number;
  estimatedOutputTokens: number;
  isEstimate: boolean; // false when replaced by actual result
  costPerMinute: number;
}

export class CostEstimator {
  private estimates: Map<string, AgentCostTracker> = new Map();

  /** Start tracking an agent */
  startTracking(agentId: string, model: string): void {
    this.estimates.set(agentId, new AgentCostTracker(agentId, model));
  }

  /** Accumulate output characters (rough token estimation: ~4 chars per token) */
  addOutputChars(agentId: string, charCount: number): void {
    this.estimates.get(agentId)?.addOutputChars(charCount);
  }

  /** Replace estimate with actual cost from result event */
  setActualCost(agentId: string, costUsd: number, inputTokens: number, outputTokens: number): void {
    const tracker = this.estimates.get(agentId);
    if (tracker) {
      tracker.setActual(costUsd, inputTokens, outputTokens);
    }
  }

  /** Get current estimate for an agent */
  getEstimate(agentId: string): CostEstimate | null {
    return this.estimates.get(agentId)?.getEstimate() || null;
  }

  /** Get all active estimates */
  getAllEstimates(): CostEstimate[] {
    const results: CostEstimate[] = [];
    for (const tracker of this.estimates.values()) {
      results.push(tracker.getEstimate());
    }
    return results;
  }

  /** Remove tracker for completed agent */
  remove(agentId: string): void {
    this.estimates.delete(agentId);
  }

  /** Check if any agent exceeds budget */
  checkBudget(budgetUsd: number): { exceeded: boolean; totalEstimated: number } {
    let total = 0;
    for (const tracker of this.estimates.values()) {
      total += tracker.getEstimate().estimatedCostUsd;
    }
    return { exceeded: total >= budgetUsd, totalEstimated: total };
  }
}

class AgentCostTracker {
  private agentId: string;
  private model: string;
  private outputCharCount = 0;
  private startedAt: number;
  private actualCostUsd: number | null = null;
  private actualInputTokens: number | null = null;
  private actualOutputTokens: number | null = null;

  constructor(agentId: string, model: string) {
    this.agentId = agentId;
    this.model = model;
    this.startedAt = Date.now();
  }

  addOutputChars(charCount: number): void {
    this.outputCharCount += charCount;
  }

  setActual(costUsd: number, inputTokens: number, outputTokens: number): void {
    this.actualCostUsd = costUsd;
    this.actualInputTokens = inputTokens;
    this.actualOutputTokens = outputTokens;
  }

  getEstimate(): CostEstimate {
    if (this.actualCostUsd !== null) {
      const elapsedMinutes = (Date.now() - this.startedAt) / 60_000;
      return {
        agentId: this.agentId,
        model: this.model,
        estimatedCostUsd: this.actualCostUsd,
        estimatedOutputTokens: this.actualOutputTokens || 0,
        isEstimate: false,
        costPerMinute: elapsedMinutes > 0 ? this.actualCostUsd / elapsedMinutes : 0,
      };
    }

    // Estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(this.outputCharCount / 4);
    const pricing = MODEL_PRICING[this.model] || MODEL_PRICING.sonnet;
    const estimatedCost = (estimatedTokens / 1_000_000) * pricing.output;
    const elapsedMinutes = (Date.now() - this.startedAt) / 60_000;

    return {
      agentId: this.agentId,
      model: this.model,
      estimatedCostUsd: estimatedCost,
      estimatedOutputTokens: estimatedTokens,
      isEstimate: true,
      costPerMinute: elapsedMinutes > 0 ? estimatedCost / elapsedMinutes : 0,
    };
  }
}
