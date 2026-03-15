/**
 * DiffViewer - Modal showing unified diff for a file.
 */

import { useEffect } from "react";

interface DiffViewerProps {
  file: string;
  diff: string;
  onClose: () => void;
}

export function DiffViewer({ file, diff, onClose }: DiffViewerProps) {
  const lines = diff.split("\n");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-deck-surface border border-deck-border rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-deck-border shrink-0">
          <h3 className="text-xs font-mono text-deck-text-bright truncate">{file}</h3>
          <button
            onClick={onClose}
            className="p-1 text-deck-text-dim hover:text-deck-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="overflow-auto flex-1 p-0">
          <pre className="text-xs font-mono leading-5">
            {lines.map((line, i) => {
              let className = "px-4 py-0";
              if (line.startsWith("+") && !line.startsWith("+++")) {
                className += " bg-green-950/30 text-green-400";
              } else if (line.startsWith("-") && !line.startsWith("---")) {
                className += " bg-red-950/30 text-red-400";
              } else if (line.startsWith("@@")) {
                className += " bg-blue-950/20 text-blue-400";
              } else {
                className += " text-deck-text-dim";
              }
              return (
                <div key={i} className={className}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}
