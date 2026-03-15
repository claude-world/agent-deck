/**
 * AgentNode - Custom React Flow node for DAG visualization.
 *
 * Shows agent name, role, task, workdir, model, cost, and status
 * via left border color coding.
 */

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

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

const STATUS_COLORS: Record<string, string> = {
  pending: "border-l-gray-400",
  queued: "border-l-yellow-400",
  running: "border-l-blue-500",
  success: "border-l-green-500",
  failed: "border-l-red-500",
  retrying: "border-l-orange-400",
  cancelled: "border-l-gray-500",
  skipped: "border-l-gray-300",
};

const STATUS_BG: Record<string, string> = {
  running: "bg-blue-50",
  success: "bg-green-50",
  failed: "bg-red-50",
  skipped: "bg-gray-50",
};

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  researcher: { bg: "bg-purple-100", text: "text-purple-700" },
  implementer: { bg: "bg-blue-100", text: "text-blue-700" },
  tester: { bg: "bg-green-100", text: "text-green-700" },
  reviewer: { bg: "bg-yellow-100", text: "text-yellow-700" },
  devops: { bg: "bg-orange-100", text: "text-orange-700" },
};

function AgentNodeComponent({ data }: NodeProps) {
  const d = data as AgentNodeData;
  const borderColor = STATUS_COLORS[d.status] || "border-l-gray-400";
  const bgColor = STATUS_BG[d.status] || "bg-white";
  const roleBadge = d.role ? ROLE_BADGE[d.role] : null;
  const isRunning = d.status === "running";

  return (
    <div
      className={`border-l-4 ${borderColor} ${bgColor} rounded-lg shadow-sm border border-gray-200 w-64 overflow-hidden ${
        isRunning ? "ring-2 ring-blue-300 ring-opacity-50" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />

      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="font-medium text-sm text-gray-900 truncate flex-1">
          {d.name}
        </span>
        {roleBadge && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${roleBadge.bg} ${roleBadge.text} font-medium`}
          >
            {d.role}
          </span>
        )}
        {isRunning && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-gray-600 line-clamp-2">{d.task}</p>
        {d.error && (
          <p className="text-[10px] text-red-600 mt-1 truncate">{d.error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-[10px] text-gray-500">
        <span className="truncate flex-1" title={d.workdir}>
          {d.workdir === "." ? "root" : d.workdir}
        </span>
        <span className="px-1 py-0.5 bg-gray-200 rounded text-gray-600 font-mono">
          {d.model}
        </span>
        {d.cost > 0 && (
          <span className="text-green-600 font-medium">
            ${d.cost.toFixed(3)}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
