import React, { useState, useEffect, useCallback } from "react";

// =====================================================
// Types
// =====================================================

interface Session {
  id: string;
  agent_id: string;
  session_id: string | null;
  status: string;
  config_json: string;
  output_snapshot: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

interface SessionHistoryProps {
  onResumeSession: (sessionId: string) => void;
}

// =====================================================
// Helpers
// =====================================================

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "unknown";
  const ms = Date.now() - new Date(dateStr + "Z").getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-600 bg-green-50";
    case "crashed":
    case "dead":
      return "text-red-600 bg-red-50";
    case "shutdown":
      return "text-amber-600 bg-amber-50";
    case "resumed":
      return "text-blue-600 bg-blue-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

// =====================================================
// Session Card
// =====================================================

function SessionCard({
  session,
  onResume,
  onViewOutput,
}: {
  session: Session;
  onResume: () => void;
  onViewOutput: () => void;
}) {
  let config: { name?: string; model?: string; prompt?: string } = {};
  try {
    config = JSON.parse(session.config_json);
  } catch {}

  const canResume =
    session.session_id &&
    (session.status === "crashed" || session.status === "shutdown");

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3 hover:border-gray-200 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-gray-700 truncate">
            {config.name || "Unknown Agent"}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(session.status)}`}
          >
            {session.status}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">
          {timeAgo(session.ended_at || session.started_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
        {config.model && <span className="font-mono">{config.model}</span>}
        <span className="font-mono">{formatCost(session.total_cost_usd)}</span>
        <span className="font-mono">
          {formatTokens(session.total_input_tokens + session.total_output_tokens)} tokens
        </span>
      </div>

      <div className="flex items-center gap-2">
        {session.output_snapshot && (
          <button
            onClick={onViewOutput}
            className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            View Output
          </button>
        )}
        {canResume && (
          <button
            onClick={onResume}
            className="text-[10px] px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            Resume
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Output Replay Modal
// =====================================================

function OutputReplayModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  let outputData: any[] = [];
  try {
    outputData = JSON.parse(session.output_snapshot || "[]");
  } catch {}

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl shadow-xl w-[640px] max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-200 font-medium">
            Session Output Replay
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {outputData.length === 0 ? (
            <div className="text-gray-500 text-xs text-center py-8">
              No output data available
            </div>
          ) : (
            <div className="space-y-1">
              {outputData.map((item: any, i: number) => (
                <div key={i} className="text-xs font-mono">
                  {item.event?.type === "text" && (
                    <pre className="text-gray-200 whitespace-pre-wrap">
                      {item.event.data?.content}
                    </pre>
                  )}
                  {item.event?.type === "tool_call" && (
                    <div className="text-blue-400 py-0.5">
                      [{item.event.data?.toolName?.replace(/^mcp__[^_]+__/, "")}]
                    </div>
                  )}
                  {item.event?.type === "thinking" && (
                    <div className="text-purple-400/60 italic py-0.5">
                      {(item.event.data?.content || "").slice(0, 200)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Main Component
// =====================================================

const API_BASE = "/api/deck";

export function SessionHistory({ onResumeSession }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaySession, setReplaySession] = useState<Session | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleResume = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
        method: "POST",
      });
      if (res.ok) {
        onResumeSession(sessionId);
        fetchSessions(); // Refresh list
      }
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <div className="p-4 text-xs text-gray-400">Loading sessions...</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] uppercase text-gray-400 font-medium">
        Session History ({sessions.length})
      </div>

      {sessions.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6">
          No past sessions
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onResume={() => handleResume(session.id)}
              onViewOutput={() => setReplaySession(session)}
            />
          ))}
        </div>
      )}

      {replaySession && (
        <OutputReplayModal
          session={replaySession}
          onClose={() => setReplaySession(null)}
        />
      )}
    </div>
  );
}
