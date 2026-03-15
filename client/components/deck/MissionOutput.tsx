/**
 * MissionOutput - Bottom drawer showing agent output streams.
 *
 * Tabs for each agent in the workflow, with real-time output display.
 */

import React, { useState, useEffect, useRef } from "react";

interface OutputEvent {
  type: string;
  agentId: string;
  timestamp: string;
  data: any;
}

interface MissionOutputProps {
  /** Map of agentName -> agentId */
  agentMap: Record<string, string>;
  /** All output events keyed by agentId */
  outputEvents: Record<string, OutputEvent[]>;
  isOpen: boolean;
  onToggle: () => void;
}

export function MissionOutput({
  agentMap,
  outputEvents,
  isOpen,
  onToggle,
}: MissionOutputProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentNames = Object.keys(agentMap);

  // Auto-select first tab
  useEffect(() => {
    if (!activeTab && agentNames.length > 0) {
      setActiveTab(agentNames[0]);
    }
  }, [agentNames, activeTab]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputEvents, activeTab]);

  const activeAgentId = activeTab ? agentMap[activeTab] : null;
  const events = activeAgentId ? outputEvents[activeAgentId] || [] : [];

  return (
    <div
      className={`border-t border-gray-200 bg-white transition-all ${
        isOpen ? "h-64" : "h-8"
      }`}
    >
      {/* Header bar */}
      <div
        className="h-8 px-3 flex items-center gap-2 bg-gray-50 border-b border-gray-200 cursor-pointer select-none"
        onClick={onToggle}
      >
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-xs font-medium text-gray-600">Output</span>
        {events.length > 0 && (
          <span className="text-[10px] text-gray-400">({events.length} events)</span>
        )}
      </div>

      {isOpen && (
        <div className="flex h-[calc(100%-2rem)]">
          {/* Tabs */}
          <div className="w-36 border-r border-gray-200 overflow-y-auto bg-gray-50 shrink-0">
            {agentNames.map((name) => {
              const agentId = agentMap[name];
              const count = (outputEvents[agentId] || []).length;
              return (
                <button
                  key={name}
                  onClick={() => setActiveTab(name)}
                  className={`w-full text-left px-2 py-1.5 text-xs truncate flex items-center gap-1 ${
                    activeTab === name
                      ? "bg-white font-medium text-gray-900 border-r-2 border-blue-500"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="truncate flex-1">{name}</span>
                  {count > 0 && (
                    <span className="text-[10px] text-gray-400">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Output content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-2 font-mono text-xs text-gray-700 bg-gray-900 text-gray-300"
          >
            {events.length === 0 ? (
              <div className="text-gray-500 text-center mt-4">
                {activeAgentId ? "Waiting for output..." : "Select an agent"}
              </div>
            ) : (
              events.map((evt, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {renderEvent(evt)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function renderEvent(event: OutputEvent): string {
  switch (event.type) {
    case "text":
      return event.data?.content || "";
    case "tool_call":
      return `[tool] ${event.data?.toolName || "unknown"}\n`;
    case "thinking":
      return "";  // Skip thinking events in output
    case "error":
      return `[error] ${event.data?.message || "unknown error"}\n`;
    case "complete":
      return `\n--- Complete (${event.data?.status || "done"}) ---\n`;
    default:
      return "";
  }
}
