/**
 * PlanningCanvas - Shows the planned DAG before launch.
 * User can review and click nodes to edit config, then launch.
 */

import { useMemo } from "react";
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

// ─── Types ──────────────────────────────────────────

interface PlannedAgent {
  name: string;
  task: string;
  role?: string;
  workdir: string;
  model: string;
  dependsOn: string[];
}

export interface MissionPlan {
  agents: PlannedAgent[];
  estimatedCost: number;
  estimatedTimeMinutes: number;
}

interface PlanningCanvasProps {
  plan: MissionPlan;
  onLaunch: () => void;
  onReplan: () => void;
  onSelectNode: (name: string) => void;
}

// ─── Layout ─────────────────────────────────────────

const NODE_WIDTH = 256;
const NODE_HEIGHT = 120;
const nodeTypes: NodeTypes = { agentNode: AgentNode as any };

function layoutDag(agents: PlannedAgent[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  for (const agent of agents) {
    g.setNode(agent.name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const agent of agents) {
    for (const dep of agent.dependsOn) {
      g.setEdge(dep, agent.name);
    }
  }
  dagre.layout(g);

  const nodes: Node[] = agents.map((agent) => {
    const pos = g.node(agent.name);
    return {
      id: agent.name,
      type: "agentNode",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        name: agent.name,
        task: agent.task,
        role: agent.role,
        workdir: agent.workdir,
        model: agent.model,
        status: "pending",
        cost: 0,
      } as AgentNodeData,
    };
  });

  const edges: Edge[] = [];
  for (const agent of agents) {
    for (const dep of agent.dependsOn) {
      edges.push({
        id: `${dep}->${agent.name}`,
        source: dep,
        target: agent.name,
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: "#3a3a4a",
        },
        style: { stroke: "#3a3a4a", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

// ─── Component ──────────────────────────────────────

export function PlanningCanvas({
  plan,
  onLaunch,
  onReplan,
  onSelectNode,
}: PlanningCanvasProps) {
  const { setSelectedAgentId } = useDeckStore();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutDag(plan.agents),
    [plan]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="flex flex-col h-full">
      {/* DAG */}
      <div className="flex-1 relative">
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
          <Controls
            position="bottom-right"
            showInteractive={false}
          />
        </ReactFlow>

        {/* Estimate badge */}
        <div className="absolute top-3 left-3 bg-deck-surface/90 backdrop-blur rounded-lg border border-deck-border px-3 py-2 flex items-center gap-4 text-xs">
          <span className="text-deck-text-dim">
            {plan.agents.length} agents
          </span>
          <span className="font-mono text-deck-success">
            Est. ${plan.estimatedCost.toFixed(2)}
          </span>
          <span className="text-deck-text-dim">
            ~{plan.estimatedTimeMinutes}min
          </span>
        </div>
      </div>

      {/* Action bar */}
      <div className="shrink-0 px-4 py-3 border-t border-deck-border bg-deck-surface flex items-center justify-between">
        <button
          onClick={onReplan}
          className="px-3 py-2 text-xs border border-deck-border rounded-lg text-deck-text-dim hover:text-deck-text hover:bg-deck-surface-2 transition-colors"
        >
          Re-plan
        </button>
        <button
          onClick={onLaunch}
          className="px-5 py-2 text-xs bg-deck-success text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Launch
        </button>
      </div>
    </div>
  );
}
