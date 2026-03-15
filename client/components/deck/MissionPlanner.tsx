/**
 * MissionPlanner - Main orchestration view.
 *
 * Three zones:
 * 1. Task Input Bar — describe what to build
 * 2. DAG Canvas — React Flow visualization of agent plan
 * 3. Execution Toolbar — status, cost, controls
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { MissionOutput } from "./MissionOutput";

const API_BASE = "/api/deck";

// ─── Types ───────────────────────────────────────────

interface ProjectStructure {
  name: string;
  root: string;
  type: "monorepo" | "single";
  framework?: string;
  packages: Array<{ name: string; path: string; type: string }>;
  hasClaudeMd: boolean;
  hasMcpJson: boolean;
  agentCount: number;
  skillCount: number;
  mcpServerCount: number;
}

interface PlannedAgent {
  name: string;
  task: string;
  role?: string;
  workdir: string;
  model: string;
  dependsOn: string[];
}

interface MissionPlan {
  agents: PlannedAgent[];
  estimatedCost: number;
  estimatedTimeMinutes: number;
}

interface WorkflowState {
  id: string;
  name: string;
  status: string;
  nodes: Record<string, NodeState>;
  edges: Array<{ source: string; target: string; condition: string }>;
  totalCost: number;
  startedAt: number | null;
  completedAt: number | null;
}

interface NodeState {
  agentName: string;
  config: any;
  status: string;
  cost: number;
  retryCount: number;
  agentId: string | null;
  error: string | null;
}

interface OutputEvent {
  type: string;
  agentId: string;
  timestamp: string;
  data: any;
}

// ─── Layout ──────────────────────────────────────────

const NODE_WIDTH = 256;
const NODE_HEIGHT = 120;

function layoutDag(
  agents: PlannedAgent[]
): { nodes: Node[]; edges: Edge[] } {
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
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#94a3b8" },
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

// ─── Component ───────────────────────────────────────

const nodeTypes: NodeTypes = { agentNode: AgentNode as any };

interface MissionPlannerProps {
  sendJsonMessage: (msg: any) => void;
  lastJsonMessage: any;
  isConnected: boolean;
}

export function MissionPlanner({
  sendJsonMessage,
  lastJsonMessage,
  isConnected,
}: MissionPlannerProps) {
  // State
  const [task, setTask] = useState("");
  const [projectPath, setProjectPath] = useState(".");
  const [editingPath, setEditingPath] = useState(false);
  const [project, setProject] = useState<ProjectStructure | null>(null);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "planning" | "ready" | "running" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputEvents, setOutputEvents] = useState<Record<string, OutputEvent[]>>({});

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Scan project on mount
  useEffect(() => {
    scanProject();
  }, []);

  // Track workflow ID via ref to avoid stale closure
  const workflowRef = useRef<WorkflowState | null>(null);
  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  // Handle WS messages for workflow updates
  useEffect(() => {
    if (!lastJsonMessage) return;
    const msg = lastJsonMessage as any;

    if (msg.type === "deck:workflow:status") {
      setWorkflow(msg.workflow);
      updateNodesFromWorkflow(msg.workflow);
      if (msg.workflow.status === "completed" || msg.workflow.status === "failed" || msg.workflow.status === "cancelled") {
        setPhase("done");
      }
    }

    if (msg.type === "deck:workflow:node") {
      const currentWf = workflowRef.current;
      if (!currentWf || msg.workflowId !== currentWf.id) return;

      const node = msg.node as NodeState;

      // Focus newly running agents so we receive their output stream
      if (node.status === "running" && node.agentId) {
        sendJsonMessage({ type: "deck:agent:focus", agentId: node.agentId });
      }

      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: { ...prev.nodes, [node.agentName]: node },
        };
      });
      // Update React Flow node
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.agentName
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: node.status,
                  cost: node.cost,
                  error: node.error,
                },
              }
            : n
        )
      );
      // Animate edges to running nodes
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: node.status === "running" && e.target === node.agentName,
        }))
      );
    }

    // Collect output events
    if (msg.type === "deck:agent:output") {
      setOutputEvents((prev) => ({
        ...prev,
        [msg.agentId]: [...(prev[msg.agentId] || []), msg.event],
      }));
    }
  }, [lastJsonMessage]);

  // ─── Actions ─────────────────────────────────────

  async function scanProject(path?: string) {
    const scanPath = path || projectPath;
    try {
      setPhase("scanning");
      const res = await fetch(`${API_BASE}/project/scan?path=${encodeURIComponent(scanPath)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProject(data);
      setProjectPath(scanPath);
      setPhase("idle");
    } catch (err: any) {
      setError(`Scan failed: ${err.message}`);
      setPhase("idle");
    }
  }

  async function handlePlan() {
    if (!task.trim()) return;
    setError(null);
    setPlan(null);
    setWorkflow(null);
    setOutputEvents({});

    try {
      setPhase("planning");
      const res = await fetch(`${API_BASE}/mission/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, path: project?.root || "." }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPlan(data.plan);
      if (data.project) setProject(data.project);

      // Layout the DAG
      const { nodes: layoutNodes, edges: layoutEdges } = layoutDag(data.plan.agents);
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setPhase("ready");
    } catch (err: any) {
      setError(`Planning failed: ${err.message}`);
      setPhase("idle");
    }
  }

  async function handleLaunch() {
    if (!plan) return;
    setError(null);

    try {
      // Subscribe to WS if not already
      sendJsonMessage({ type: "deck:subscribe" });

      // Focus on all agents that will be created
      const res = await fetch(`${API_BASE}/workflow/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          name: task.slice(0, 50),
          projectRoot: project?.root || ".",
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const wf = await res.json();
      setWorkflow(wf);
      updateNodesFromWorkflow(wf);
      setPhase("running");
      setOutputOpen(true);

      // Focus all agents for output streaming
      for (const node of Object.values(wf.nodes) as NodeState[]) {
        if (node.agentId) {
          sendJsonMessage({ type: "deck:agent:focus", agentId: node.agentId });
        }
      }
    } catch (err: any) {
      setError(`Launch failed: ${err.message}`);
    }
  }

  async function handleAbort() {
    if (!workflow) return;
    try {
      await fetch(`${API_BASE}/workflow/${workflow.id}/abort`, { method: "POST" });
    } catch {}
  }

  function handleReset() {
    setPlan(null);
    setWorkflow(null);
    setPhase("idle");
    setNodes([]);
    setEdges([]);
    setOutputEvents({});
    setError(null);
    setTask("");
    inputRef.current?.focus();
  }

  function updateNodesFromWorkflow(wf: WorkflowState) {
    setNodes((nds) =>
      nds.map((n) => {
        const nodeState = wf.nodes[n.id];
        if (!nodeState) return n;
        return {
          ...n,
          data: {
            ...n.data,
            status: nodeState.status,
            cost: nodeState.cost,
            error: nodeState.error,
          },
        };
      })
    );
  }

  // Build agentMap for MissionOutput
  const agentMap = useMemo(() => {
    if (!workflow) return {};
    const map: Record<string, string> = {};
    for (const [name, node] of Object.entries(workflow.nodes)) {
      if (node.agentId) map[name] = node.agentId;
    }
    return map;
  }, [workflow]);

  // ─── Computed ────────────────────────────────────

  const isPlanning = phase === "planning";
  const isRunning = phase === "running";
  const isDone = phase === "done";
  const isReady = phase === "ready";

  const statusCounts = useMemo(() => {
    if (!workflow) return null;
    const counts: Record<string, number> = {};
    for (const node of Object.values(workflow.nodes)) {
      counts[node.status] = (counts[node.status] || 0) + 1;
    }
    return counts;
  }, [workflow]);

  const elapsed = useMemo(() => {
    if (!workflow?.startedAt) return null;
    const end = workflow.completedAt || Date.now();
    const seconds = Math.floor((end - workflow.startedAt) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, [workflow, phase]);

  // ─── Render ──────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Task Input Bar */}
      <div className="shrink-0 p-4 border-b border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isPlanning && !isRunning) handlePlan();
            }}
            placeholder="Describe what you want to build, fix, or refactor..."
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            disabled={isPlanning || isRunning}
          />
          {phase === "idle" || phase === "scanning" ? (
            <button
              onClick={handlePlan}
              disabled={!task.trim() || isPlanning || phase === "scanning"}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPlanning ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Planning...
                </>
              ) : (
                "Plan"
              )}
            </button>
          ) : isReady ? (
            <div className="flex gap-2">
              <button
                onClick={handlePlan}
                className="px-3 py-2.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
              >
                Re-plan
              </button>
              <button
                onClick={handleLaunch}
                className="px-4 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Launch
              </button>
            </div>
          ) : isRunning ? (
            <button
              onClick={handleAbort}
              className="px-4 py-2.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              Abort
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
            >
              New Mission
            </button>
          )}
        </div>

        {/* Context chips + project path */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Project path — click to change */}
          {editingPath ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                setEditingPath(false);
                scanProject(projectPath);
              }}
            >
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="px-2 py-0.5 text-[11px] border border-blue-400 rounded bg-white focus:outline-none w-64 font-mono"
                autoFocus
                onBlur={() => {
                  setEditingPath(false);
                  scanProject(projectPath);
                }}
                placeholder="/path/to/project"
              />
            </form>
          ) : (
            <button
              onClick={() => setEditingPath(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
              title="Click to change project path"
              disabled={isRunning}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {project?.root || projectPath}
            </button>
          )}

          {project && (
            <>
              <Chip label={project.name} />
              {project.framework && <Chip label={project.framework} />}
              {project.type === "monorepo" && (
                <Chip label={`${project.packages.length} packages`} />
              )}
              {project.agentCount > 0 && <Chip label={`${project.agentCount} agents`} />}
              {project.skillCount > 0 && <Chip label={`${project.skillCount} skills`} />}
              {project.mcpServerCount > 0 && <Chip label={`${project.mcpServerCount} MCP servers`} />}
            </>
          )}
          {plan && !error && (
            <span className="text-xs text-gray-500 ml-auto">
              Est. ${plan.estimatedCost.toFixed(2)} / ~{plan.estimatedTimeMinutes}min
            </span>
          )}
        </div>

        {error && (
          <div className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">
            {error}
          </div>
        )}
      </div>

      {/* DAG Canvas */}
      <div className="flex-1 relative">
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={20} size={1} />
            <Controls
              position="bottom-right"
              showInteractive={false}
              className="!bg-white !shadow-sm !border !border-gray-200 !rounded-lg"
            />
          </ReactFlow>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              {isPlanning ? (
                <div className="flex flex-col items-center gap-3">
                  <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm">Architect is planning your mission...</p>
                </div>
              ) : (
                <>
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm">Describe a task and click Plan to start</p>
                  <p className="text-xs mt-1">The AI architect will decompose it into a multi-agent plan</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Execution status bar */}
        {(isRunning || isDone) && statusCounts && (
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-200 px-3 py-2 flex items-center gap-3 text-xs">
            <span className={`font-medium ${isDone ? (workflow?.status === "completed" ? "text-green-600" : "text-red-600") : "text-blue-600"}`}>
              {workflow?.status === "completed"
                ? "Completed"
                : workflow?.status === "failed"
                ? "Failed"
                : workflow?.status === "cancelled"
                ? "Cancelled"
                : "Running"}
            </span>
            {statusCounts.success && (
              <span className="text-green-600">{statusCounts.success} done</span>
            )}
            {statusCounts.running && (
              <span className="text-blue-600">{statusCounts.running} running</span>
            )}
            {statusCounts.pending && (
              <span className="text-gray-400">{statusCounts.pending} pending</span>
            )}
            {statusCounts.failed && (
              <span className="text-red-600">{statusCounts.failed} failed</span>
            )}
            {statusCounts.skipped && (
              <span className="text-gray-400">{statusCounts.skipped} skipped</span>
            )}
            {workflow && workflow.totalCost > 0 && (
              <span className="text-gray-500">${workflow.totalCost.toFixed(3)}</span>
            )}
            {elapsed && <span className="text-gray-400">{elapsed}</span>}
          </div>
        )}
      </div>

      {/* Output drawer */}
      {(isRunning || isDone) && (
        <MissionOutput
          agentMap={agentMap}
          outputEvents={outputEvents}
          isOpen={outputOpen}
          onToggle={() => setOutputOpen((o) => !o)}
        />
      )}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600 font-medium">
      {label}
    </span>
  );
}
