/**
 * RunningCanvas - Live React Flow DAG with animated edges and status updates.
 */

import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import { AgentNode, type AgentNodeData } from "./AgentNode";
import { useDeckStore } from "../../stores/deck-store";
import type { WorkflowState } from "../../stores/deck-store";

const NODE_WIDTH = 256;
const NODE_HEIGHT = 120;
const nodeTypes: NodeTypes = { agentNode: AgentNode as any };

interface RunningCanvasProps {
  onSelectNode: (name: string) => void;
  onAbort: () => void;
}

function buildDag(workflow: WorkflowState): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  const nodeNames = Object.keys(workflow.nodes);
  for (const name of nodeNames) {
    g.setNode(name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of workflow.edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const nodes: Node[] = nodeNames.map((name) => {
    const pos = g.node(name);
    const ns = workflow.nodes[name];
    return {
      id: name,
      type: "agentNode",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        name: ns.agentName,
        task: ns.config?.task || ns.config?.prompt || "",
        role: ns.config?.role,
        workdir: ns.config?.workdir || ".",
        model: ns.config?.model || "sonnet",
        status: ns.status,
        cost: ns.cost,
        error: ns.error,
      } as AgentNodeData,
    };
  });

  const edges: Edge[] = workflow.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    animated: workflow.nodes[e.target]?.status === "running",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: "#3a3a4a",
    },
    style: {
      stroke:
        workflow.nodes[e.target]?.status === "running"
          ? "#22c55e"
          : workflow.nodes[e.target]?.status === "failed"
            ? "#ef4444"
            : "#3a3a4a",
      strokeWidth: 1.5,
    },
  }));

  return { nodes, edges };
}

export function RunningCanvas({ onSelectNode, onAbort }: RunningCanvasProps) {
  const { activeWorkflow, setSelectedAgentId } = useDeckStore();

  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () => (activeWorkflow ? buildDag(activeWorkflow) : { nodes: [], edges: [] }),
    [activeWorkflow]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  // Sync when workflow updates
  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [builtNodes, builtEdges]);

  // Budget progress
  const budgetPct = activeWorkflow
    ? Math.min(
        ((activeWorkflow.totalCost || 0) /
          (activeWorkflow.maxBudgetUsd || 10)) *
          100,
        100
      )
    : 0;

  const statusCounts = useMemo(() => {
    if (!activeWorkflow) return {};
    const counts: Record<string, number> = {};
    for (const node of Object.values(activeWorkflow.nodes)) {
      counts[node.status] = (counts[node.status] || 0) + 1;
    }
    return counts;
  }, [activeWorkflow]);

  return (
    <div className="flex flex-col h-full">
      {/* Budget bar */}
      <div className="shrink-0 px-4 py-2 border-b border-deck-border bg-deck-surface flex items-center gap-3">
        <div className="flex-1">
          <div className="h-1.5 bg-deck-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budgetPct >= 90
                  ? "bg-deck-error"
                  : budgetPct >= 70
                    ? "bg-deck-warning"
                    : "bg-deck-accent"
              }`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-deck-text-dim shrink-0">
          {statusCounts.success && (
            <span className="text-deck-success">{statusCounts.success} done</span>
          )}
          {statusCounts.running && (
            <span className="text-deck-success">{statusCounts.running} running</span>
          )}
          {statusCounts.pending && (
            <span className="text-deck-muted">{statusCounts.pending} pending</span>
          )}
          {statusCounts.failed && (
            <span className="text-deck-error">{statusCounts.failed} failed</span>
          )}
          <span className="font-mono text-deck-success">
            ${(activeWorkflow?.totalCost || 0).toFixed(3)}
          </span>
        </div>
        <button
          onClick={onAbort}
          className="px-2.5 py-1 text-[10px] bg-deck-error/10 text-deck-error border border-deck-error/30 rounded hover:bg-deck-error/20 transition-colors"
        >
          Abort
        </button>
      </div>

      {/* DAG */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setSelectedAgentId(node.id);
            onSelectNode(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a25" gap={20} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
