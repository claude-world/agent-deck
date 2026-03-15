/**
 * AgentNode - Dark-themed React Flow node for the DAG.
 *
 * Left border color codes status. Deck dark theme colors.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StatusDot } from "../shared/StatusDot";
import { CostBadge } from "../shared/CostBadge";

export interface AgentNodeData {
  name: string;
  task: string;
  role?: string;
  workdir: string;
  model: string;
  status: string;
  cost: number;
  error?: string | null;
  [key: string]: unknown;
}

const STATUS_BORDER: Record<string, string> = {
  pending: "border-l-deck-muted",
  queued: "border-l-deck-warning",
  running: "border-l-deck-success",
  success: "border-l-deck-success",
  completed: "border-l-deck-accent",
  failed: "border-l-deck-error",
  retrying: "border-l-deck-warning",
  cancelled: "border-l-deck-muted",
  skipped: "border-l-deck-muted",
};

const ROLE_BADGE: Record<string, string> = {
  researcher: "bg-purple-900/50 text-purple-300",
  implementer: "bg-blue-900/50 text-blue-300",
  tester: "bg-emerald-900/50 text-emerald-300",
  reviewer: "bg-amber-900/50 text-amber-300",
  devops: "bg-orange-900/50 text-orange-300",
};

function AgentNodeComponent({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const borderColor = STATUS_BORDER[d.status] || "border-l-deck-muted";
  const isRunning = d.status === "running";

  return (
    <div
      className={`border-l-4 ${borderColor} bg-deck-surface rounded-lg border border-deck-border w-64 overflow-hidden transition-all ${
        isRunning ? "ring-1 ring-deck-success/30" : ""
      } ${selected ? "ring-2 ring-deck-accent" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-deck-border !w-2 !h-2 !border-0"
      />

      {/* Header */}
      <div className="px-3 py-2 border-b border-deck-border/50 flex items-center gap-2">
        <StatusDot status={d.status} />
        <span className="font-medium text-sm text-deck-text-bright truncate flex-1">
          {d.name}
        </span>
        {d.role && ROLE_BADGE[d.role] && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[d.role]}`}
          >
            {d.role}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-deck-text-dim line-clamp-2">{d.task}</p>
        {d.error && (
          <p className="text-[10px] text-deck-error mt-1 truncate">{d.error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-deck-surface-2/50 border-t border-deck-border/50 flex items-center gap-2 text-[10px] text-deck-text-dim">
        <span className="truncate flex-1" title={d.workdir}>
          {d.workdir === "." ? "root" : d.workdir}
        </span>
        <span className="px-1 py-0.5 bg-deck-surface-2 rounded text-deck-muted font-mono">
          {d.model}
        </span>
        <CostBadge cost={d.cost} />
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-deck-border !w-2 !h-2 !border-0"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
