import { useEffect } from "react";

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-deck-surface text-deck-text text-xs px-4 py-2.5 rounded-lg shadow-lg border border-deck-border flex items-center gap-3 animate-slide-up">
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="text-deck-muted hover:text-deck-text"
      >
        x
      </button>
    </div>
  );
}
