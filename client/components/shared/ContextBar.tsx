export function ContextBar({
  usedTokens,
  maxTokens,
  percentage,
}: {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}) {
  const pct = Math.min(percentage, 100);
  const barColor =
    pct >= 90
      ? "bg-deck-error"
      : pct >= 70
        ? "bg-deck-warning"
        : "bg-deck-success";

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-deck-text-dim mb-0.5">
        <span>Context</span>
        <span className="font-mono">
          {(usedTokens / 1000).toFixed(0)}K / {(maxTokens / 1000).toFixed(0)}K
        </span>
      </div>
      <div className="h-1 bg-deck-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
