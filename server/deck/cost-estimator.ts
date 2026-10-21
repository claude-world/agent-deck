/**
 * Cost Estimator - Real-time cost estimation from stream events
 *
 * Provides rough cost estimates during streaming (before final result event),
 * then replaces with actual cost when available.
 */

/** Pricing per million tokens (USD). Claude Code aliases resolve to the newest model in each family. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  sonnet: { input: 2, output: 10 },
  opus: { input: 4, output: 20 },
  haiku: { input: 0.1, output: 0.5 },
  fable: { input: 10, output: 50 },
  // Full model IDs
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

/** Pricing for a model alias or ID, falling back to Sonnet for unknown models */
export function getModelPricing(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] || MODEL_PRICING.sonnet;
}

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
    const pricing = getModelPricing(this.model);
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
