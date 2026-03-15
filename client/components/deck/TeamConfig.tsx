import React, { useState } from "react";

interface TeamConfigData {
  id: string;
  name: string;
  description: string;
  config_json: string;
  created_at: string;
  updated_at: string;
  source?: "db" | "file";
}

interface TeamConfigProps {
  teams: TeamConfigData[];
  onSave: (name: string, description: string, configJson: string) => void;
  onUpdate: (
    id: string,
    name: string,
    description: string,
    configJson: string
  ) => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onReloadYaml?: () => void;
}

const TEMPLATES = {
  solo: {
    name: "Solo Agent",
    description: "Single agent for focused work",
    agents: [
      {
        name: "worker",
        model: "sonnet",
        prompt: "Complete the assigned task.",
        agent_type: "general",
      },
    ],
  },
  pair: {
    name: "Pair: Builder + Reviewer",
    description: "One builds, one reviews",
    agents: [
      {
        name: "builder",
        model: "sonnet",
        prompt: "Implement the feature described in the task.",
        agent_type: "implementer",
      },
      {
        name: "reviewer",
        model: "sonnet",
        prompt:
          "Review the code changes for quality, security, and correctness.",
        agent_type: "reviewer",
      },
    ],
  },
  squad: {
    name: "Squad: Plan + Build + Test",
    description: "Full development squad",
    agents: [
      {
        name: "planner",
        model: "sonnet",
        prompt: "Create a detailed implementation plan.",
        agent_type: "planner",
      },
      {
        name: "implementer",
        model: "sonnet",
        prompt: "Implement the feature according to the plan.",
        agent_type: "implementer",
      },
      {
        name: "tester",
        model: "haiku",
        prompt: "Write comprehensive tests for the implementation.",
        agent_type: "tester",
      },
    ],
  },
};

export function TeamConfig({
  teams,
  onSave,
  onUpdate,
  onDelete,
  onLaunch,
  onReloadYaml,
}: TeamConfigProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configText, setConfigText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const validateJson = (text: string): boolean => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.agents || !Array.isArray(parsed.agents)) {
        setJsonError("Config must have an 'agents' array");
        return false;
      }
      for (const agent of parsed.agents) {
        if (!agent.name || !agent.prompt) {
          setJsonError("Each agent must have 'name' and 'prompt'");
          return false;
        }
      }
      setJsonError(null);
      return true;
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
      return false;
    }
  };

  const handleSave = () => {
    if (!name.trim() || !configText.trim()) return;
    if (!validateJson(configText)) return;

    if (editingId) {
      onUpdate(editingId, name, description, configText);
      setEditingId(null);
    } else {
      onSave(name, description, configText);
    }
    setName("");
    setDescription("");
    setConfigText("");
  };

  const handleEdit = (team: TeamConfigData) => {
    setEditingId(team.id);
    setName(team.name);
    setDescription(team.description);
    try {
      setConfigText(JSON.stringify(JSON.parse(team.config_json), null, 2));
    } catch {
      setConfigText(team.config_json);
    }
    setJsonError(null);
  };

  const loadTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key];
    setName(t.name);
    setDescription(t.description);
    setConfigText(JSON.stringify({ name: t.name, agents: t.agents }, null, 2));
    setJsonError(null);
  };

  const handleExport = (team: TeamConfigData) => {
    const blob = new Blob([team.config_json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${team.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Templates */}
      <div>
        <div className="text-[10px] uppercase text-gray-400 mb-2">
          Quick Templates
        </div>
        <div className="flex gap-2">
          {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map(
            (key) => (
              <button
                key={key}
                onClick={() => loadTemplate(key)}
                className="text-xs px-2.5 py-1.5 rounded border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600"
              >
                {TEMPLATES[key].name}
              </button>
            )
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team config name"
          className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-xs px-3 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
        />
        <textarea
          value={configText}
          onChange={(e) => {
            setConfigText(e.target.value);
            if (jsonError) validateJson(e.target.value);
          }}
          placeholder='{"name": "...", "agents": [{"name": "...", "prompt": "...", "model": "sonnet"}]}'
          className={`w-full h-40 text-xs font-mono px-3 py-2 border rounded focus:outline-none resize-none ${
            jsonError
              ? "border-red-300 focus:border-red-400"
              : "border-gray-200 focus:border-blue-300"
          }`}
        />
        {jsonError && (
          <p className="text-[10px] text-red-500">{jsonError}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !configText.trim()}
            className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
          >
            {editingId ? "Update" : "Save Config"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setName("");
                setDescription("");
                setConfigText("");
                setJsonError(null);
              }}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Saved configs */}
      {teams.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase text-gray-400">
              Saved Configs
            </div>
            {onReloadYaml && (
              <button
                onClick={onReloadYaml}
                className="text-[10px] px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-500"
                title="Reload YAML team configs from disk"
              >
                Reload YAML
              </button>
            )}
          </div>
          <div className="space-y-2">
            {teams.map((team) => {
              let agentCount = 0;
              try {
                agentCount = JSON.parse(team.config_json).agents?.length || 0;
              } catch {}

              const isFileSource = team.source === "file";

              return (
                <div
                  key={team.id}
                  className="border border-gray-200 rounded-lg p-3 hover:border-gray-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-800">
                          {team.name}
                        </span>
                        {isFileSource && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 font-medium">
                            YAML
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <div className="text-xs text-gray-400">
                          {team.description}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1">
                        {agentCount} agents
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onLaunch(team.id)}
                        className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Launch
                      </button>
                      {!isFileSource && (
                        <>
                          <button
                            onClick={() => handleEdit(team)}
                            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleExport(team)}
                            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
                            title="Export JSON"
                          >
                            Export
                          </button>
                          <button
                            onClick={() => onDelete(team.id)}
                            className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
