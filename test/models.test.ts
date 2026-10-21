import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CostEstimator, getModelPricing } from "../server/deck/cost-estimator.js";
import { ContextEstimator } from "../server/deck/context-estimator.js";
import { mapLiteLLMModel } from "../server/deck/adapters/litellm-adapter.js";

describe("model pricing", () => {
  it("prices Claude Code aliases as the current model in each family", () => {
    assert.deepEqual(getModelPricing("haiku"), { input: 0.1, output: 0.5 });
    assert.deepEqual(getModelPricing("sonnet"), { input: 2, output: 10 });
    assert.deepEqual(getModelPricing("opus"), { input: 4, output: 20 });
    assert.deepEqual(getModelPricing("fable"), { input: 10, output: 50 });
  });

  it("prices full model IDs the same as their aliases", () => {
    assert.deepEqual(getModelPricing("claude-haiku-5-5"), getModelPricing("haiku"));
    assert.deepEqual(getModelPricing("claude-sonnet-5-5"), getModelPricing("sonnet"));
    assert.deepEqual(getModelPricing("claude-opus-5-5"), getModelPricing("opus"));
    assert.deepEqual(getModelPricing("claude-fable-5-1"), getModelPricing("fable"));
  });

  it("falls back to Sonnet pricing for unknown models", () => {
    assert.deepEqual(getModelPricing("gpt-4o"), getModelPricing("sonnet"));
  });

  it("estimates streaming cost from output characters (~4 chars per token)", () => {
    const estimator = new CostEstimator();
    estimator.startTracking("a1", "opus");
    estimator.addOutputChars("a1", 4_000_000); // 1M output tokens
    const estimate = estimator.getEstimate("a1");
    assert.ok(estimate);
    assert.equal(estimate.isEstimate, true);
    assert.equal(estimate.estimatedOutputTokens, 1_000_000);
    assert.equal(estimate.estimatedCostUsd, 20);
  });

  it("replaces the estimate with the actual cost from the CLI", () => {
    const estimator = new CostEstimator();
    estimator.startTracking("a1", "sonnet");
    estimator.addOutputChars("a1", 400);
    estimator.setActualCost("a1", 0.0123, 1000, 100);
    const estimate = estimator.getEstimate("a1");
    assert.equal(estimate?.isEstimate, false);
    assert.equal(estimate?.estimatedCostUsd, 0.0123);
  });
});

describe("context limits", () => {
  it("uses the 1M-token window for current Claude models", () => {
    const estimator = new ContextEstimator();
    for (const model of ["haiku", "sonnet", "opus", "fable", "claude-sonnet-5-5", "claude-fable-5-1"]) {
      estimator.startTracking(model, model, "x".repeat(400));
      assert.equal(estimator.getUsage(model)?.maxTokens, 1_000_000, model);
    }
  });

  it("keeps a 200K default for unknown models", () => {
    const estimator = new ContextEstimator();
    estimator.startTracking("a1", "gpt-4o", "x".repeat(400));
    const usage = estimator.getUsage("a1");
    assert.equal(usage?.maxTokens, 200_000);
    assert.equal(usage?.usedTokens, 100);
  });
});

describe("LiteLLM model mapping", () => {
  it("maps short names to current Claude model IDs", () => {
    assert.equal(mapLiteLLMModel("haiku"), "claude-haiku-5-5");
    assert.equal(mapLiteLLMModel("sonnet"), "claude-sonnet-5-5");
    assert.equal(mapLiteLLMModel("opus"), "claude-opus-5-5");
    assert.equal(mapLiteLLMModel("fable"), "claude-fable-5-1");
  });

  it("passes other model names through unchanged", () => {
    assert.equal(mapLiteLLMModel("gpt-4o"), "gpt-4o");
    assert.equal(mapLiteLLMModel("claude-opus-5-5"), "claude-opus-5-5");
  });
});
