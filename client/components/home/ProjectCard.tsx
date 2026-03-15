import { useState, useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../stores/deck-store";

interface ProjectCardProps {
  workspace: WorkspaceInfo;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ProjectCard({ workspace, onSelect, onRemove, onRename }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTo, setRenameTo] = useState(workspace.name);
  const [stats, setStats] = useState<{ totalWorkflows: number; totalCost: number } | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deck/workspaces/${workspace.id}/stats`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) setStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspace.id]);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  const shortPath = workspace.path.replace(/^\/Users\/[^/]+/, "~");

  const handleRenameSubmit = () => {
    const trimmed = renameTo.trim();
    if (trimmed && trimmed !== workspace.name) {
      onRename(workspace.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      className="bg-deck-surface rounded-lg border border-deck-border hover:border-deck-accent/40 transition-all cursor-pointer group relative"
      onClick={() => { if (!renaming) onSelect(workspace.id); }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                ref={renameRef}
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") { setRenaming(false); setRenameTo(workspace.name); }
                }}
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-deck-text-bright bg-deck-bg border border-deck-accent rounded px-1.5 py-0.5 w-full focus:outline-none"
              />
            ) : (
              <h3 className="text-sm font-semibold text-deck-text-bright truncate">
                {workspace.name}
              </h3>
            )}
            <p className="text-[10px] text-deck-text-dim font-mono truncate mt-0.5">
              {shortPath}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="p-1 rounded hover:bg-deck-surface-2 text-deck-text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {workspace.framework && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-deck-accent/10 text-deck-accent">
              {workspace.framework}
            </span>
          )}
          {workspace.language && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-text-dim">
              {workspace.language}
            </span>
          )}
          {workspace.git_branch && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-text-dim font-mono">
              {workspace.git_branch}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-deck-text-dim">
          <span>{stats?.totalWorkflows || 0} {(stats?.totalWorkflows || 0) === 1 ? "mission" : "missions"}</span>
          {stats?.totalCost ? (
            <span className="font-mono text-deck-success">${stats.totalCost.toFixed(2)}</span>
          ) : null}
        </div>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
          />
          <div className="absolute right-2 top-10 z-20 bg-deck-surface-2 border border-deck-border rounded-lg shadow-lg py-1 min-w-[120px]">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-deck-text hover:bg-deck-surface-3 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setRenameTo(workspace.name);
                setRenaming(true);
                setMenuOpen(false);
              }}
            >
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-deck-error hover:bg-deck-surface-3 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(workspace.id);
                setMenuOpen(false);
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}
