export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-deck-muted",
    queued: "bg-deck-warning",
    running: "bg-deck-success",
    idle: "bg-deck-warning",
    paused: "bg-blue-400",
    completed: "bg-deck-accent",
    success: "bg-deck-success",
    failed: "bg-deck-error",
    finalizing: "bg-deck-warning",
    cancelled: "bg-deck-muted",
    dead: "bg-deck-error",
    skipped: "bg-deck-muted",
  };

  if (status === "running") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-deck-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-deck-success" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-full h-2 w-2 ${colors[status] || "bg-deck-muted"}`}
    />
  );
}
