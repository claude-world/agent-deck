import React, { useRef, useEffect, useState } from "react";

interface DeckEvent {
  id: number;
  agent_id: string;
  agent_name?: string;
  event_type: string;
  tool_name: string | null;
  content: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

interface ActivityFeedProps {
  events: DeckEvent[];
  selectedAgentId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr + "Z").getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function getEventColor(type: string): string {
  switch (type) {
    case "tool_call":
      return "text-blue-600 bg-blue-50";
    case "text":
      return "text-gray-600 bg-gray-50";
    case "thinking":
      return "text-purple-600 bg-purple-50";
    case "complete":
      return "text-green-600 bg-green-50";
    case "error":
      return "text-red-600 bg-red-50";
    case "killed":
      return "text-red-600 bg-red-50";
    case "init":
      return "text-emerald-600 bg-emerald-50";
    case "context_warning":
      return "text-amber-600 bg-amber-50";
    default:
      return "text-gray-500 bg-gray-50";
  }
}

function EventEntry({ event }: { event: DeckEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorClass = getEventColor(event.event_type);
  const hasContent = event.content && event.content.length > 0;

  let displayText = event.event_type;
  if (event.tool_name) {
    displayText = event.tool_name
      .replace(/^mcp__[^_]+__/, "")
      .replace(/_/g, " ");
  }

  // Parse content for tool_call events
  let parsedContent: string | null = null;
  if (hasContent && event.event_type === "tool_call") {
    try {
      const obj = JSON.parse(event.content!);
      parsedContent = JSON.stringify(obj, null, 2);
    } catch {
      parsedContent = event.content;
    }
  } else if (hasContent) {
    parsedContent = event.content;
  }

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 hover:bg-gray-50/50">
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${colorClass}`}
      >
        {event.event_type}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {event.agent_name && (
            <span className="text-[10px] text-gray-400 shrink-0">
              {event.agent_name}
            </span>
          )}
          <span
            className={`text-xs text-gray-700 truncate ${hasContent ? "cursor-pointer hover:text-blue-600" : ""}`}
            onClick={() => hasContent && setIsExpanded(!isExpanded)}
          >
            {displayText}
            {event.event_type === "text" && parsedContent
              ? `: ${parsedContent.slice(0, 80)}${parsedContent.length > 80 ? "..." : ""}`
              : ""}
          </span>
        </div>
        {isExpanded && parsedContent && (
          <pre className="text-[11px] bg-white border border-gray-100 rounded p-2 mt-1 overflow-x-auto max-h-48 overflow-y-auto font-mono text-gray-600">
            {parsedContent.slice(0, 2000)}
          </pre>
        )}
      </div>
      <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
}

export function ActivityFeed({
  events,
  selectedAgentId,
  isCollapsed,
  onToggleCollapse,
}: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filter events by selected agent
  const filteredEvents = selectedAgentId
    ? events.filter((e) => e.agent_id === selectedAgentId)
    : events;

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div
      className={`border-t border-gray-200 bg-white flex flex-col transition-all ${
        isCollapsed ? "h-8" : "h-[300px]"
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 shrink-0"
      >
        <span className="font-medium">
          Activity Feed
          {filteredEvents.length > 0 && (
            <span className="ml-1 text-gray-400">
              ({filteredEvents.length})
            </span>
          )}
        </span>
        <span>{isCollapsed ? "\u25B2" : "\u25BC"}</span>
      </button>

      {/* Event list */}
      {!isCollapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-mono text-xs divide-y divide-gray-50"
        >
          {filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-xs">
              No events yet
            </div>
          ) : (
            filteredEvents.map((event) => (
              <EventEntry key={event.id} event={event} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
