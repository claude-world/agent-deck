/**
 * ConfigTab - Agent configuration: model, runtime, prompt, workspace.
 * For editing before launch or viewing during/after execution.
 */

import type { Agent, NodeState } from "../../stores/deck-store";

interface ConfigTabProps {
  agent?: Agent | null;
  workflowNode?: NodeState | null;
}

export function ConfigTab({ agent, workflowNode }: ConfigTabProps) {
  const config = workflowNode?.config || {};
  const model = agent?.model || config.model || "sonnet";
  const runtime = agent?.runtime || config.runtime || "claude-code";
  const prompt = agent?.prompt || config.prompt || config.task || "";
  const workdir = config.workdir || ".";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Model */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Model
        </label>
        <select
          value={model}
          disabled
          className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none"
        >
          <option value="haiku">Haiku 4.5</option>
          <option value="sonnet">Sonnet 4.6</option>
          <option value="opus">Opus 4.6</option>
        </select>
      </div>

      {/* Runtime */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Runtime
        </label>
        <select
          value={runtime}
          disabled
          className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none"
        >
          <option value="claude-code">Claude Code</option>
          <option value="codex">Codex</option>
          <option value="gemini-cli">Gemini CLI</option>
          <option value="litellm">LiteLLM Proxy</option>
        </select>
      </div>

      {/* Workspace */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Workspace
        </label>
        <input
          type="text"
          value={workdir}
          disabled
          className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text-dim"
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Prompt / Task
        </label>
        <textarea
          value={prompt}
          readOnly
          rows={8}
          className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text resize-none focus:outline-none font-mono"
        />
      </div>

      {/* Agent meta */}
      {agent && (
        <div className="space-y-2 pt-2 border-t border-deck-border">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Agent ID</span>
            <span className="font-mono text-deck-text-dim truncate max-w-[200px]">
              {agent.id}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Status</span>
            <span className="text-deck-text">{agent.status}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Cost</span>
            <span className="font-mono text-deck-success">
              ${agent.total_cost_usd < 0.01 ? agent.total_cost_usd.toFixed(4) : agent.total_cost_usd.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Tokens</span>
            <span className="font-mono text-deck-text-dim">
              {(agent.total_input_tokens / 1000).toFixed(1)}K in /{" "}
              {(agent.total_output_tokens / 1000).toFixed(1)}K out
            </span>
          </div>
          {agent.session_id && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-deck-muted">Session</span>
              <span className="font-mono text-deck-text-dim truncate max-w-[200px]">
                {agent.session_id}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Workflow node meta */}
      {workflowNode && !agent && (
        <div className="space-y-2 pt-2 border-t border-deck-border">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Node</span>
            <span className="text-deck-text">{workflowNode.agentName}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Status</span>
            <span className="text-deck-text">{workflowNode.status}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Cost</span>
            <span className="font-mono text-deck-success">
              ${workflowNode.cost.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Retries</span>
            <span className="text-deck-text">{workflowNode.retryCount}</span>
          </div>
          {workflowNode.error && (
            <div>
              <span className="text-[10px] text-deck-muted">Error</span>
              <p className="text-xs text-deck-error mt-0.5 break-words">
                {workflowNode.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
