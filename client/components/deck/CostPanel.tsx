import React from "react";

interface CostEstimate {
  agentId: string;
  model: string;
  estimatedCostUsd: number;
  estimatedOutputTokens: number;
  isEstimate: boolean;
  costPerMinute: number;
}

interface CostSummary {
  total_cost_usd: number;
  today_cost_usd: number;
  active_agents: number;
  by_agent: Array<{
    agent_id: string;
    agent_name: string;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  time_series?: Array<{ hour: string; cost: number }>;
  estimates?: CostEstimate[];
}

interface CostPanelProps {
  cost: CostSummary | null;
  budgetAlert: number;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 0.001);
  const w = 120;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

function BudgetProgressBar({ current, budget }: { current: number; budget: number }) {
  const pct = Math.min((current / budget) * 100, 100);
  let barColor = "bg-green-500";
  if (pct >= 80) barColor = "bg-red-500";
  else if (pct >= 50) barColor = "bg-amber-500";

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>Budget: {formatCost(budget)}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CostPanel({ cost, budgetAlert }: CostPanelProps) {
  if (!cost) {
    return (
      <div className="p-4 text-xs text-gray-400">Loading cost data...</div>
    );
  }

  const overBudget = cost.total_cost_usd >= budgetAlert;
  const maxAgentCost = Math.max(...cost.by_agent.map((a) => a.cost_usd), 0.001);

  // Merge estimates with by_agent data for active agent cost rates
  const estimateMap = new Map<string, CostEstimate>();
  if (cost.estimates) {
    for (const est of cost.estimates) {
      estimateMap.set(est.agentId, est);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Budget alert */}
      {overBudget && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          Budget alert: Total cost ({formatCost(cost.total_cost_usd)}) exceeds
          threshold ({formatCost(budgetAlert)})
        </div>
      )}

      {/* Budget progress bar */}
      <BudgetProgressBar current={cost.total_cost_usd} budget={budgetAlert} />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <div className="text-[10px] uppercase text-gray-400 mb-1">
            Total Cost
          </div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {formatCost(cost.total_cost_usd)}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <div className="text-[10px] uppercase text-gray-400 mb-1">Today</div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {formatCost(cost.today_cost_usd)}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <div className="text-[10px] uppercase text-gray-400 mb-1">
            Active Agents
          </div>
          <div className="text-lg font-mono font-semibold text-gray-900">
            {cost.active_agents}
          </div>
        </div>
      </div>

      {/* Sparkline */}
      {cost.time_series && cost.time_series.length > 1 && (
        <div>
          <div className="text-[10px] uppercase text-gray-400 mb-2">
            Cost (24h)
          </div>
          <Sparkline data={cost.time_series.map((t) => t.cost)} />
        </div>
      )}

      {/* Active agent cost rates */}
      {cost.estimates && cost.estimates.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-gray-400 mb-2">
            Active Cost Rates
          </div>
          <div className="space-y-1.5">
            {cost.estimates.map((est) => (
              <div key={est.agentId} className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-mono truncate max-w-[140px]">
                  {est.model}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[9px] px-1 py-0.5 rounded ${
                    est.isEstimate
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    {est.isEstimate ? "Est." : "Actual"}
                  </span>
                  <span className={`font-mono ${est.isEstimate ? "text-amber-600" : "text-gray-700"}`}>
                    {formatCost(est.estimatedCostUsd)}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatCost(est.costPerMinute)}/min
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-agent cost bars */}
      {cost.by_agent.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-gray-400 mb-2">
            By Agent
          </div>
          <div className="space-y-2">
            {cost.by_agent.map((a) => {
              const estimate = estimateMap.get(a.agent_id);
              return (
                <div key={a.agent_id}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-600 truncate max-w-[140px]">
                      {a.agent_name}
                    </span>
                    <span className="font-mono text-gray-700 shrink-0 ml-2">
                      {formatCost(a.cost_usd)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${(a.cost_usd / maxAgentCost) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>
                      {formatTokens(a.input_tokens)} in / {formatTokens(a.output_tokens)} out
                    </span>
                    {estimate && (
                      <span className="text-amber-600">
                        {formatCost(estimate.costPerMinute)}/min
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
