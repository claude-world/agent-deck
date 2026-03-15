/**
 * OutputDrawer - Bottom drawer with 3 modes: Merged, Tabs, Minimized.
 * Shows interleaved output from all agents or per-agent tabs.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { StreamEvent } from "../../stores/deck-store";

type DrawerMode = "merged" | "tabs" | "minimized";

export function OutputDrawer() {
  const { outputEvents, activeWorkflow } = useDeckStore();
  const [mode, setMode] = useState<DrawerMode>("minimized");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get agent names from workflow
  const agentNames = useMemo(() => {
    if (!activeWorkflow) return [];
    return Object.keys(activeWorkflow.nodes);
  }, [activeWorkflow]);

  // Build agentId -> name map
  const idToName = useMemo(() => {
    if (!activeWorkflow) return {};
    const map: Record<string, string> = {};
    for (const [name, node] of Object.entries(activeWorkflow.nodes)) {
      if (node.agentId) map[node.agentId] = name;
    }
    return map;
  }, [activeWorkflow]);

  // Build name -> agentId map
  const nameToId = useMemo(() => {
    if (!activeWorkflow) return {};
    const map: Record<string, string> = {};
    for (const [name, node] of Object.entries(activeWorkflow.nodes)) {
      if (node.agentId) map[name] = node.agentId;
    }
    return map;
  }, [activeWorkflow]);

  // Merged events (all agents interleaved by timestamp)
  const mergedEvents = useMemo(() => {
    const all: (StreamEvent & { agentName: string })[] = [];
    for (const [agentId, events] of Object.entries(outputEvents)) {
      const name = idToName[agentId] || agentId.slice(0, 8);
      for (const evt of events) {
        all.push({ ...evt, agentName: name });
      }
    }
    return all.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [outputEvents, idToName]);

  // Auto-select first tab
  useEffect(() => {
    if (!activeTab && agentNames.length > 0) {
      setActiveTab(agentNames[0]);
    }
  }, [agentNames]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && mode !== "minimized") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mergedEvents.length, outputEvents, mode, activeTab]);

  const tabEvents = activeTab
    ? outputEvents[nameToId[activeTab] || ""] || []
    : [];

  const totalEvents = Object.values(outputEvents).reduce(
    (sum, evts) => sum + evts.length,
    0
  );

  return (
    <div
      className={`border-t border-deck-border bg-deck-surface transition-all ${
        mode === "minimized" ? "h-8" : "h-64"
      }`}
    >
      {/* Header bar */}
      <div
        className="h-8 px-3 flex items-center gap-2 bg-deck-surface-2/50 border-b border-deck-border cursor-pointer select-none"
        onClick={() => setMode(mode === "minimized" ? "merged" : "minimized")}
      >
        <svg
          className={`w-3 h-3 text-deck-muted transition-transform ${
            mode !== "minimized" ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-xs font-medium text-deck-text-dim">Output</span>
        {totalEvents > 0 && (
          <span className="text-[10px] text-deck-muted">
            ({totalEvents} events)
          </span>
        )}

        {/* Mode toggles */}
        {mode !== "minimized" && (
          <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMode("merged")}
              className={`text-[10px] px-2 py-0.5 rounded ${
                mode === "merged"
                  ? "bg-deck-accent/20 text-deck-accent"
                  : "text-deck-muted hover:text-deck-text-dim"
              }`}
            >
              Merged
            </button>
            <button
              onClick={() => setMode("tabs")}
              className={`text-[10px] px-2 py-0.5 rounded ${
                mode === "tabs"
                  ? "bg-deck-accent/20 text-deck-accent"
                  : "text-deck-muted hover:text-deck-text-dim"
              }`}
            >
              Tabs
            </button>
          </div>
        )}
      </div>

      {mode !== "minimized" && (
        <div className="flex h-[calc(100%-2rem)]">
          {/* Tabs sidebar (tabs mode only) */}
          {mode === "tabs" && (
            <div className="w-32 border-r border-deck-border overflow-y-auto bg-deck-surface shrink-0">
              {agentNames.map((name) => {
                const agentId = nameToId[name];
                const count = agentId
                  ? (outputEvents[agentId] || []).length
                  : 0;
                return (
                  <button
                    key={name}
                    onClick={() => setActiveTab(name)}
                    className={`w-full text-left px-2 py-1.5 text-[10px] truncate flex items-center gap-1 ${
                      activeTab === name
                        ? "bg-deck-surface-2 text-deck-text-bright border-r-2 border-deck-accent"
                        : "text-deck-text-dim hover:bg-deck-surface-2/50"
                    }`}
                  >
                    <span className="truncate flex-1">{name}</span>
                    {count > 0 && (
                      <span className="text-deck-muted">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Output content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-deck-bg font-mono text-xs p-2"
          >
            {mode === "merged" ? (
              mergedEvents.length === 0 ? (
                <div className="text-deck-muted text-center mt-4">
                  Waiting for output...
                </div>
              ) : (
                mergedEvents.map((evt, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {evt.type === "text" && (
                      <span>
                        <span className="text-deck-accent/60">
                          [{evt.agentName}]{" "}
                        </span>
                        <span className="text-deck-text">
                          {evt.data?.content || ""}
                        </span>
                      </span>
                    )}
                    {evt.type === "tool_call" && (
                      <span className="text-blue-400">
                        [{evt.agentName}] {">"}{" "}
                        {evt.data?.toolName
                          ?.replace(/^mcp__[^_]+__/, "")
                          .replace(/_/g, " ")}
                        {"\n"}
                      </span>
                    )}
                    {evt.type === "error" && (
                      <span className="text-deck-error">
                        [{evt.agentName}] {evt.data?.message || "error"}
                        {"\n"}
                      </span>
                    )}
                    {evt.type === "complete" && (
                      <span className="text-deck-accent">
                        [{evt.agentName}] --- Complete ---{"\n"}
                      </span>
                    )}
                  </div>
                ))
              )
            ) : tabEvents.length === 0 ? (
              <div className="text-deck-muted text-center mt-4">
                {activeTab ? "Waiting for output..." : "Select an agent"}
              </div>
            ) : (
              tabEvents.map((evt, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {evt.type === "text" && (
                    <span className="text-deck-text">
                      {evt.data?.content || ""}
                    </span>
                  )}
                  {evt.type === "tool_call" && (
                    <span className="text-blue-400">
                      {">"}{" "}
                      {evt.data?.toolName
                        ?.replace(/^mcp__[^_]+__/, "")
                        .replace(/_/g, " ")}
                      {"\n"}
                    </span>
                  )}
                  {evt.type === "error" && (
                    <span className="text-deck-error">
                      [error] {evt.data?.message || "unknown"}
                      {"\n"}
                    </span>
                  )}
                  {evt.type === "complete" && (
                    <span className="text-deck-accent">
                      --- Complete ({evt.data?.status || "done"}) ---{"\n"}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
