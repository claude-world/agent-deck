import { useState, useEffect } from "react";

interface AddProjectModalProps {
  onAdd: (path: string, name?: string) => Promise<any>;
  onClose: () => void;
}

export function AddProjectModal({ onAdd, onClose }: AddProjectModalProps) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onAdd(path.trim(), name.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-deck-surface border border-deck-border rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4 border-b border-deck-border">
          <h2 className="text-sm font-semibold text-deck-text-bright">Add Project</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-deck-text-dim mb-1.5">Project Path</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/me/my-project"
              className="w-full bg-deck-bg border border-deck-border rounded-lg px-3 py-2 text-sm text-deck-text placeholder:text-deck-muted focus:outline-none focus:border-deck-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-deck-text-dim mb-1.5">
              Display Name <span className="text-deck-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-detected from directory"
              className="w-full bg-deck-bg border border-deck-border rounded-lg px-3 py-2 text-sm text-deck-text placeholder:text-deck-muted focus:outline-none focus:border-deck-accent"
            />
          </div>

          {error && (
            <p className="text-xs text-deck-error bg-deck-error/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-deck-text-dim hover:text-deck-text border border-deck-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!path.trim() || loading}
              className="px-4 py-2 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
