import React, { useState, useEffect, useRef, useCallback } from "react";

// =====================================================
// Types
// =====================================================

interface Agent {
  id: string;
  name: string;
  agent_type: string;
  status: "running" | "idle" | "dead" | "completed";
  model: string;
  prompt: string;
  started_at: string;
  last_event_at: string | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  interactive?: boolean;
  session_id?: string | null;
}

interface StreamEvent {
  type: string;
  agentId: string;
  timestamp: string;
  data: any;
}

interface BufferedEvent {
  seq: number;
  event: StreamEvent;
}

interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

interface AgentDetailPanelProps {
  agent: Agent;
  sendJsonMessage: (msg: any) => void;
  onClose: () => void;
  contextUsage?: ContextUsage;
}

// =====================================================
// Output Block Types
// =====================================================

interface OutputBlock {
  id: string;
  type: "text" | "thinking" | "tool_call" | "tool_result" | "error" | "init" | "complete";
  content: string;
  isPartial: boolean;
  timestamp: string;
  toolName?: string;
  toolInput?: any;
}

type DetailTab = "output" | "tools" | "info";

// =====================================================
// Helper Components
// =====================================================

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt + "Z").getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-100 text-green-700",
    idle: "bg-amber-100 text-amber-700",
    completed: "bg-blue-100 text-blue-700",
    dead: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function ModelBadge({ model }: { model: string }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
      {model}
    </span>
  );
}

// =====================================================
// Output Renderer
// =====================================================

function OutputRenderer({ blocks }: { blocks: OutputBlock[] }) {
  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-xs">
        Waiting for output...
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {blocks.map((block) => (
        <OutputBlockEntry key={block.id} block={block} />
      ))}
    </div>
  );
}

function OutputBlockEntry({ block }: { block: OutputBlock }) {
  const [isCollapsed, setIsCollapsed] = useState(block.type === "thinking");

  switch (block.type) {
    case "text":
      return (
        <div className="px-3 py-1">
          <pre className="text-sm text-gray-200 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {block.content}
            {block.isPartial && <span className="animate-pulse text-blue-400">|</span>}
          </pre>
        </div>
      );

    case "thinking":
      return (
        <div className="px-3 py-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 mb-0.5"
          >
            <span>{isCollapsed ? "\u25B6" : "\u25BC"}</span>
            <span className="italic">thinking</span>
          </button>
          {!isCollapsed && (
            <pre className="text-xs text-purple-300/70 italic whitespace-pre-wrap break-words font-mono leading-relaxed pl-3 border-l border-purple-800/30">
              {block.content}
              {block.isPartial && <span className="animate-pulse">|</span>}
            </pre>
          )}
        </div>
      );

    case "tool_call":
      return <ToolCallEntry block={block} />;

    case "error":
      return (
        <div className="px-3 py-1.5 bg-red-950/30">
          <span className="text-[10px] text-red-400 font-medium">ERROR</span>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono mt-0.5">
            {block.content}
          </pre>
        </div>
      );

    case "init":
      return (
        <div className="px-3 py-1 text-[10px] text-emerald-500">
          Session started {block.content && `(${block.content})`}
        </div>
      );

    case "complete":
      return (
        <div className="px-3 py-1.5 border-t border-gray-700/50 mt-1">
          <span className="text-[10px] text-blue-400 font-medium">COMPLETED</span>
          <pre className="text-xs text-gray-400 font-mono mt-0.5">
            {block.content}
          </pre>
        </div>
      );

    default:
      return null;
  }
}

function ToolCallEntry({ block }: { block: OutputBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolDisplay = block.toolName
    ?.replace(/^mcp__[^_]+__/, "")
    .replace(/_/g, " ") || "unknown tool";

  return (
    <div className="px-3 py-1 bg-blue-950/20 border-l-2 border-blue-600/40">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span className="text-[10px] text-blue-400">{isExpanded ? "\u25BC" : "\u25B6"}</span>
        <span className="text-[10px] font-medium text-blue-300">
          {toolDisplay}
        </span>
        <span className="text-[10px] text-gray-500 ml-auto">
          {new Date(block.timestamp).toLocaleTimeString()}
        </span>
      </button>
      {isExpanded && block.toolInput && (
        <pre className="text-[11px] text-gray-400 font-mono mt-1 pl-4 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {typeof block.toolInput === "string"
            ? block.toolInput
            : JSON.stringify(block.toolInput, null, 2)}
        </pre>
      )}
    </div>
  );
}

// =====================================================
// Agent Metrics Bar
// =====================================================

function AgentMetricsBar({ agent }: { agent: Agent }) {
  const [uptime, setUptime] = useState(formatDuration(agent.started_at));

  useEffect(() => {
    if (agent.status !== "running" && agent.status !== "idle") return;
    const timer = setInterval(() => {
      setUptime(formatDuration(agent.started_at));
    }, 1000);
    return () => clearInterval(timer);
  }, [agent.started_at, agent.status]);

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
      <div>
        <span className="text-gray-400">Tokens: </span>
        <span className="font-mono text-gray-700">
          {formatTokens(agent.total_input_tokens)} in / {formatTokens(agent.total_output_tokens)} out
        </span>
      </div>
      <div>
        <span className="text-gray-400">Cost: </span>
        <span className="font-mono text-gray-700">{formatCost(agent.total_cost_usd)}</span>
      </div>
      <div>
        <span className="text-gray-400">Uptime: </span>
        <span className="font-mono text-gray-700">{uptime}</span>
      </div>
    </div>
  );
}

// =====================================================
// Input Bar (for interactive sessions)
// =====================================================

function InputBar({
  agentId,
  sendJsonMessage,
}: {
  agentId: string;
  sendJsonMessage: (msg: any) => void;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendJsonMessage({
      type: "deck:agent:input",
      agentId,
      text: trimmed,
    });
    setText("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 px-4 py-2 border-t border-gray-200 bg-white">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
        rows={1}
        className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded resize-none focus:outline-none focus:border-blue-300"
      />
      <button
        onClick={handleSend}
        disabled={!text.trim()}
        className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 shrink-0"
      >
        Send
      </button>
    </div>
  );
}

// =====================================================
// Tools Tab
// =====================================================

function ToolsTab({ blocks }: { blocks: OutputBlock[] }) {
  const toolBlocks = blocks.filter((b) => b.type === "tool_call");

  if (toolBlocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
        No tool calls yet
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {toolBlocks.map((block) => (
        <div key={block.id} className="bg-white rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">
              {block.toolName?.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-gray-400">
              {new Date(block.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {block.toolInput && (
            <pre className="text-[11px] text-gray-500 font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {typeof block.toolInput === "string"
                ? block.toolInput
                : JSON.stringify(block.toolInput, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// =====================================================
// Info Tab
// =====================================================

function InfoTab({ agent, contextUsage }: { agent: Agent; contextUsage?: ContextUsage }) {
  return (
    <div className="p-4 space-y-4 text-xs">
      <div>
        <div className="text-gray-400 uppercase text-[10px] mb-1">Agent ID</div>
        <div className="font-mono text-gray-600 break-all">{agent.id}</div>
      </div>
      <div>
        <div className="text-gray-400 uppercase text-[10px] mb-1">Prompt</div>
        <pre className="text-gray-600 whitespace-pre-wrap break-words bg-gray-50 rounded p-2 max-h-48 overflow-y-auto">
          {agent.prompt}
        </pre>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Model</div>
          <div className="text-gray-600 font-mono">{agent.model}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Type</div>
          <div className="text-gray-600">{agent.agent_type}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Started</div>
          <div className="text-gray-600">
            {new Date(agent.started_at + "Z").toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Status</div>
          <StatusBadge status={agent.status} />
        </div>
      </div>
      {contextUsage && (
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Context Window</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 font-mono">
                {(contextUsage.usedTokens / 1000).toFixed(0)}K / {(contextUsage.maxTokens / 1000).toFixed(0)}K tokens
              </span>
              <span className={`font-mono font-medium ${
                contextUsage.percentage >= 90 ? "text-red-600" :
                contextUsage.percentage >= 70 ? "text-amber-600" : "text-green-600"
              }`}>
                {contextUsage.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  contextUsage.percentage >= 90 ? "bg-red-500" :
                  contextUsage.percentage >= 70 ? "bg-amber-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(contextUsage.percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {agent.session_id && (
        <div>
          <div className="text-gray-400 uppercase text-[10px] mb-1">Session ID</div>
          <div className="font-mono text-gray-600 break-all text-[11px]">{agent.session_id}</div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// Main Component
// =====================================================

const API_BASE = "/api/deck";

export function AgentDetailPanel({
  agent,
  sendJsonMessage,
  onClose,
  contextUsage,
}: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("output");
  const [blocks, setBlocks] = useState<OutputBlock[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastSeq, setLastSeq] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockIdCounter = useRef(0);

  const nextBlockId = () => `block-${blockIdCounter.current++}`;

  // Focus this agent on mount, unfocus on unmount
  useEffect(() => {
    sendJsonMessage({ type: "deck:agent:focus", agentId: agent.id });

    return () => {
      sendJsonMessage({ type: "deck:agent:unfocus", agentId: agent.id });
    };
  }, [agent.id, sendJsonMessage]);

  // Fetch history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/agents/${agent.id}/output?since=0`
        );
        if (!res.ok) return;
        const data: BufferedEvent[] = await res.json();
        if (data.length > 0) {
          const newBlocks = data.map((be) => streamEventToBlock(be.event, nextBlockId));
          setBlocks(newBlocks);
          setLastSeq(data[data.length - 1].seq);
        }
      } catch {
        // History not available, will get live events
      }
    };
    fetchHistory();
  }, [agent.id]);

  // Process incoming stream events (called from parent via onStreamEvent)
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      if (event.agentId !== agent.id) return;

      setBlocks((prev) => {
        const last = prev[prev.length - 1];

        // Accumulate partial text deltas
        if (event.type === "text" && event.data?.isPartial) {
          if (last && last.type === "text" && last.isPartial) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + (event.data.content || ""),
            };
            return updated;
          }
          return [...prev, streamEventToBlock(event, nextBlockId)];
        }

        // Finalize text block
        if (event.type === "text" && !event.data?.isPartial) {
          if (last && last.type === "text" && last.isPartial) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: event.data.content || last.content,
              isPartial: false,
            };
            return updated;
          }
          return [...prev, streamEventToBlock(event, nextBlockId)];
        }

        // Accumulate partial thinking deltas
        if (event.type === "thinking" && event.data?.isPartial) {
          if (last && last.type === "thinking" && last.isPartial) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + (event.data.content || ""),
            };
            return updated;
          }
          return [...prev, streamEventToBlock(event, nextBlockId)];
        }

        // Finalize thinking block
        if (event.type === "thinking" && !event.data?.isPartial) {
          if (last && last.type === "thinking" && last.isPartial) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: event.data.content || last.content,
              isPartial: false,
            };
            return updated;
          }
          return [...prev, streamEventToBlock(event, nextBlockId)];
        }

        return [...prev, streamEventToBlock(event, nextBlockId)];
      });
    },
    [agent.id]
  );

  // Expose handler via ref-like pattern (parent passes WS events)
  // This is called from DeckView when it receives deck:agent:output
  useEffect(() => {
    (window as any).__agentDetailHandler = handleStreamEvent;
    return () => {
      delete (window as any).__agentDetailHandler;
    };
  }, [handleStreamEvent]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isInteractive = agent.interactive && (agent.status === "running" || agent.status === "idle");
  const isActive = agent.status === "running" || agent.status === "idle";

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "output", label: "Output" },
    { key: "tools", label: "Tools" },
    { key: "info", label: "Info" },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            title="Close (Escape)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-medium text-sm text-gray-900 truncate">
            {agent.name}
          </span>
          <StatusBadge status={agent.status} />
          <ModelBadge model={agent.model} />
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-gray-200 px-4 flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "output" && (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto bg-gray-900 text-gray-100"
          >
            <OutputRenderer blocks={blocks} />
          </div>
        )}
        {activeTab === "tools" && (
          <div className="h-full overflow-y-auto bg-gray-50">
            <ToolsTab blocks={blocks} />
          </div>
        )}
        {activeTab === "info" && (
          <div className="h-full overflow-y-auto">
            <InfoTab agent={agent} contextUsage={contextUsage} />
          </div>
        )}
      </div>

      {/* Input bar (interactive mode only) */}
      {isInteractive && (
        <InputBar agentId={agent.id} sendJsonMessage={sendJsonMessage} />
      )}

      {/* Metrics bar */}
      <AgentMetricsBar agent={agent} />
    </div>
  );
}

// =====================================================
// Helpers
// =====================================================

function streamEventToBlock(
  event: StreamEvent,
  nextId: () => string
): OutputBlock {
  switch (event.type) {
    case "text":
      return {
        id: nextId(),
        type: "text",
        content: event.data?.content || "",
        isPartial: event.data?.isPartial ?? false,
        timestamp: event.timestamp,
      };
    case "thinking":
      return {
        id: nextId(),
        type: "thinking",
        content: event.data?.content || "",
        isPartial: event.data?.isPartial ?? false,
        timestamp: event.timestamp,
      };
    case "tool_call":
      return {
        id: nextId(),
        type: "tool_call",
        content: "",
        isPartial: false,
        timestamp: event.timestamp,
        toolName: event.data?.toolName,
        toolInput: event.data?.toolInput,
      };
    case "error":
      return {
        id: nextId(),
        type: "error",
        content: event.data?.message || event.data?.content || "Unknown error",
        isPartial: false,
        timestamp: event.timestamp,
      };
    case "init":
      return {
        id: nextId(),
        type: "init",
        content: event.data?.sessionId || "",
        isPartial: false,
        timestamp: event.timestamp,
      };
    case "complete": {
      const d = event.data || {};
      const info = [
        d.status,
        d.costUsd ? `$${d.costUsd.toFixed(4)}` : null,
        d.durationMs ? `${(d.durationMs / 1000).toFixed(1)}s` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return {
        id: nextId(),
        type: "complete",
        content: info,
        isPartial: false,
        timestamp: event.timestamp,
      };
    }
    default:
      return {
        id: nextId(),
        type: "text",
        content: JSON.stringify(event.data),
        isPartial: false,
        timestamp: event.timestamp,
      };
  }
}
