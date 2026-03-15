/**
 * FinalizePanel - Right panel for reviewing changes, editing commit message,
 * and executing git commit + push after workflow completion.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { ChangedFile } from "../../stores/deck-store";
import { DiffViewer } from "./DiffViewer";

const API_BASE = "/api/deck/finalize";

export function FinalizePanel() {
  const { activeWorkflow, finalizeState, setFinalizeState, updateFinalizeState, setMode, addToast, activeWorkspaceId } =
    useDeckStore();

  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Load changed files on mount
  const loadChanges = useCallback(async () => {
    try {
      const qs = activeWorkspaceId ? `?workspaceId=${activeWorkspaceId}` : "";
      const res = await fetch(`${API_BASE}/changes${qs}`);
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      const files: ChangedFile[] = data.files;

      if (!mountedRef.current) return;
      setFinalizeState({
        files,
        selectedFiles: new Set(files.map((f) => f.path)),
        commitMessage: "",
        generating: true,
        executing: false,
        diff: null,
        diffFile: null,
      });

      // Generate commit message
      const msgRes = await fetch(`${API_BASE}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          task: activeWorkflow?.name,
        }),
      });
      if (!mountedRef.current) return;
      if (msgRes.ok) {
        const { message } = await msgRes.json();
        updateFinalizeState({ commitMessage: message, generating: false });
      } else {
        updateFinalizeState({ generating: false });
      }
    } catch {
      if (mountedRef.current) updateFinalizeState({ generating: false });
    }
  }, [activeWorkspaceId, activeWorkflow?.name, setFinalizeState, updateFinalizeState]);

  useEffect(() => {
    mountedRef.current = true;
    loadChanges();
    return () => { mountedRef.current = false; };
  }, [loadChanges]);

  const toggleFile = (filePath: string) => {
    if (!finalizeState) return;
    const next = new Set(finalizeState.selectedFiles);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    updateFinalizeState({ selectedFiles: next });
  };

  const viewDiff = async (filePath: string) => {
    try {
      const qs = activeWorkspaceId
        ? `?file=${encodeURIComponent(filePath)}&workspaceId=${activeWorkspaceId}`
        : `?file=${encodeURIComponent(filePath)}`;
      const res = await fetch(`${API_BASE}/diff${qs}`);
      if (res.ok) {
        const data = await res.json();
        setDiffContent(data.diff);
        setDiffFile(filePath);
      }
    } catch {}
  };

  const handleExecute = async (push: boolean) => {
    if (!finalizeState || !activeWorkflow) return;
    updateFinalizeState({ executing: true });

    try {
      const res = await fetch(`${API_BASE}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: activeWorkflow.id,
          workspaceId: activeWorkspaceId,
          selectedFiles: Array.from(finalizeState.selectedFiles),
          commitMessage: finalizeState.commitMessage,
          push,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error);
      }

      const result = await res.json();
      addToast(
        `Committed ${result.filesCommitted} files (${result.commitHash})${result.pushed ? " + pushed" : ""}`
      );
      setFinalizeState(null);
      setMode("completed");
    } catch (err: any) {
      addToast(`Finalize failed: ${err.message}`);
      updateFinalizeState({ executing: false });
    }
  };

  const handleSkip = async () => {
    if (!activeWorkflow) return;
    try {
      await fetch(`${API_BASE}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: activeWorkflow.id }),
      });
    } catch {}
    setFinalizeState(null);
    setMode("completed");
  };

  if (!finalizeState) {
    return (
      <div className="flex items-center justify-center h-full text-deck-muted text-xs">
        Loading changes...
      </div>
    );
  }

  const statusIcon = (status: ChangedFile["status"]) => {
    switch (status) {
      case "added": return <span className="text-green-400 text-[10px] font-mono w-3">A</span>;
      case "modified": return <span className="text-yellow-400 text-[10px] font-mono w-3">M</span>;
      case "deleted": return <span className="text-red-400 text-[10px] font-mono w-3">D</span>;
      case "renamed": return <span className="text-blue-400 text-[10px] font-mono w-3">R</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-deck-surface border-l border-deck-border w-[400px] shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-deck-border">
        <h3 className="text-xs font-semibold text-deck-text-bright">Finalize</h3>
        <p className="text-[10px] text-deck-text-dim mt-0.5">
          Review changes and commit
        </p>
      </div>

      {/* Changed files */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-deck-text-dim uppercase">
              Changed Files ({finalizeState.files.length})
            </span>
            <button
              onClick={() => {
                const allSelected = finalizeState.files.every((f) =>
                  finalizeState.selectedFiles.has(f.path)
                );
                updateFinalizeState({
                  selectedFiles: allSelected
                    ? new Set()
                    : new Set(finalizeState.files.map((f) => f.path)),
                });
              }}
              className="text-[10px] text-deck-accent hover:underline"
            >
              {finalizeState.files.every((f) => finalizeState.selectedFiles.has(f.path))
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>

          <div className="space-y-0.5">
            {finalizeState.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-deck-surface-2 group"
              >
                <input
                  type="checkbox"
                  checked={finalizeState.selectedFiles.has(file.path)}
                  onChange={() => toggleFile(file.path)}
                  className="w-3 h-3 accent-deck-accent"
                />
                {statusIcon(file.status)}
                <span className="text-xs font-mono text-deck-text truncate flex-1">{file.path}</span>
                <span className="text-[10px] text-deck-text-dim shrink-0">
                  {file.additions > 0 && <span className="text-green-400">+{file.additions}</span>}
                  {file.additions > 0 && file.deletions > 0 && " "}
                  {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
                </span>
                <button
                  onClick={() => viewDiff(file.path)}
                  className="text-[10px] text-deck-text-dim hover:text-deck-accent opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  diff
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Commit message */}
      <div className="px-4 py-3 border-t border-deck-border">
        <label className="block text-[10px] text-deck-text-dim uppercase mb-1.5">
          Commit Message
        </label>
        <textarea
          value={finalizeState.commitMessage}
          onChange={(e) => updateFinalizeState({ commitMessage: e.target.value })}
          placeholder={finalizeState.generating ? "Generating..." : "Enter commit message..."}
          disabled={finalizeState.generating}
          rows={3}
          className="w-full bg-deck-bg border border-deck-border rounded-lg px-3 py-2 text-xs font-mono text-deck-text placeholder:text-deck-muted focus:outline-none focus:border-deck-accent resize-none"
        />
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-deck-border flex items-center gap-2">
        <button
          onClick={() => handleExecute(false)}
          disabled={
            finalizeState.executing ||
            finalizeState.generating ||
            !finalizeState.commitMessage.trim() ||
            finalizeState.selectedFiles.size === 0
          }
          className="flex-1 px-3 py-2 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors disabled:opacity-50"
        >
          {finalizeState.executing ? "Committing..." : "Commit"}
        </button>
        <button
          onClick={() => handleExecute(true)}
          disabled={
            finalizeState.executing ||
            finalizeState.generating ||
            !finalizeState.commitMessage.trim() ||
            finalizeState.selectedFiles.size === 0
          }
          className="px-3 py-2 text-xs font-medium bg-deck-success/20 text-deck-success border border-deck-success/30 rounded-lg hover:bg-deck-success/30 transition-colors disabled:opacity-50"
        >
          Commit & Push
        </button>
        <button
          onClick={handleSkip}
          disabled={finalizeState.executing}
          className="px-3 py-2 text-xs text-deck-text-dim border border-deck-border rounded-lg hover:bg-deck-surface-2 transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Diff modal */}
      {diffContent !== null && diffFile && (
        <DiffViewer
          file={diffFile}
          diff={diffContent}
          onClose={() => {
            setDiffContent(null);
            setDiffFile(null);
          }}
        />
      )}
    </div>
  );
}
