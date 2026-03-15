export function CostBadge({ cost }: { cost: number }) {
  if (cost === 0) return null;
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-success">
      ${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}
    </span>
  );
}
