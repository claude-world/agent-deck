import { useEffect } from "react";
import { useDeckStore } from "../stores/deck-store";

export function useKeyboard() {
  const { setSelectedAgentId, agents, setPage } = useDeckStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inInput =
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable;

      // Meta/Ctrl shortcuts always work (even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setPage("command-center");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setPage("history");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        setPage("settings");
        return;
      }

      // Non-meta shortcuts only fire outside inputs
      if (inInput) return;

      if (e.key === "Escape") {
        setSelectedAgentId(null);
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (agents[num - 1]) setSelectedAgentId(agents[num - 1].id);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [agents, setSelectedAgentId, setPage]);
}
