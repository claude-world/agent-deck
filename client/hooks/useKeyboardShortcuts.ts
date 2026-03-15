import { useEffect } from "react";

interface KeyboardShortcutsConfig {
  onCloseDetail: () => void;
  onOpenSpawn: () => void;
  onSelectAgent: (index: number) => void;
}

/**
 * Global keyboard shortcuts for Agent Deck
 *
 * - Escape: close detail panel
 * - Cmd/Ctrl+N: open spawn dialog
 * - 1-9: focus nth agent
 */
export function useKeyboardShortcuts({
  onCloseDetail,
  onOpenSpawn,
  onSelectAgent,
}: KeyboardShortcutsConfig): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Escape: close detail panel
      if (e.key === "Escape") {
        onCloseDetail();
        return;
      }

      // Cmd/Ctrl + N: open spawn dialog
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onOpenSpawn();
        return;
      }

      // 1-9: select nth agent
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        onSelectAgent(num - 1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCloseDetail, onOpenSpawn, onSelectAgent]);
}
