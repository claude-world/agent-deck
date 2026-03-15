/**
 * LiveTab - Real-time output stream for the selected agent.
 * Dark terminal look with auto-scroll.
 */

import { useEffect, useRef, useState } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { StreamEvent } from "../../stores/deck-store";

interface LiveTabProps {
  agentId: string | null;
  sendJsonMessage: (msg: any) => void;
}

export function LiveTab({ agentId, sendJsonMessage }: LiveTabProps) {
  const { outputEvents } = useDeckStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const events = agentId ? outputEvents[agentId] || [] : [];

  // Focus agent on mount
  useEffect(() => {
    if (agentId) {
      sendJsonMessage({ type: "deck:agent:focus", agentId });
    }
    return () => {
      if (agentId) {
        sendJsonMessage({ type: "deck:agent:unfocus", agentId });
      }
    };
  }, [agentId]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-full text-deck-muted text-xs">
        No agent selected
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto bg-deck-bg font-mono text-xs p-3 space-y-0.5"
    >
      {events.length === 0 ? (
        <div className="flex items-center justify-center h-full text-deck-muted">
          <div className="text-center">
            <div className="animate-pulse-dot text-deck-accent mb-2">...</div>
            <span>Waiting for output...</span>
          </div>
        </div>
      ) : (
        events.map((evt, i) => <LiveEventLine key={i} event={evt} />)
      )}
    </div>
  );
}

function LiveEventLine({ event }: { event: StreamEvent }) {
  switch (event.type) {
    case "text":
      return (
        <pre className="text-deck-text whitespace-pre-wrap break-words leading-relaxed">
          {event.data?.content || ""}
        </pre>
      );
    case "thinking":
      return (
        <pre className="text-purple-400/60 italic whitespace-pre-wrap break-words leading-relaxed pl-2 border-l border-purple-800/30">
          {event.data?.content || ""}
        </pre>
      );
    case "tool_call": {
      const toolName =
        event.data?.toolName
          ?.replace(/^mcp__[^_]+__/, "")
          .replace(/_/g, " ") || "unknown";
      return (
        <div className="text-blue-400 py-0.5 flex items-center gap-1.5">
          <span className="text-[10px] text-blue-500/60">{">"}</span>
          <span>{toolName}</span>
        </div>
      );
    }
    case "error":
      return (
        <div className="text-deck-error py-0.5">
          [error] {event.data?.message || event.data?.content || "unknown"}
        </div>
      );
    case "complete":
      return (
        <div className="text-deck-accent py-1 border-t border-deck-border/30 mt-1">
          --- Complete ({event.data?.status || "done"}) ---
        </div>
      );
    case "init":
      return (
        <div className="text-deck-success/60 py-0.5">
          Session started
          {event.data?.sessionId && ` (${event.data.sessionId})`}
        </div>
      );
    default:
      return null;
  }
}
