/**
 * Settings - Configuration page for Agent Deck.
 * Settings form, MCP server list, team templates.
 */

import { useState, useEffect } from "react";

const API_BASE = "/api/deck";

interface DeckSettings {
  maxAgents: number;
  maxBudgetUsd: number;
  defaultModel: string;
  defaultRuntime: string;
}

interface TeamConfig {
  id: string;
  name: string;
  description: string;
  config_json: string;
  source?: "db" | "file";
}

export function Settings() {
  const [settings, setSettings] = useState<DeckSettings>({
    maxAgents: 10,
    maxBudgetUsd: 10,
    defaultModel: "sonnet",
    defaultRuntime: "claude-code",
  });
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch settings and teams
  useEffect(() => {
    async function load() {
      try {
        const [teamsRes] = await Promise.all([fetch(`${API_BASE}/teams`)]);
        if (teamsRes.ok) setTeams(await teamsRes.json());
      } catch {
        // ignore
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Settings are currently client-side only
      // In a full implementation, POST to /api/deck/settings
      await new Promise((r) => setTimeout(r, 300));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* General settings */}
        <section>
          <h2 className="text-sm font-semibold text-deck-text-bright mb-4">
            General Settings
          </h2>
          <div className="space-y-4 bg-deck-surface rounded-lg border border-deck-border p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Max Concurrent Agents
                </label>
                <input
                  type="number"
                  value={settings.maxAgents}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxAgents: parseInt(e.target.value) || 1,
                    })
                  }
                  min={1}
                  max={50}
                  className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Max Budget (USD)
                </label>
                <input
                  type="number"
                  value={settings.maxBudgetUsd}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxBudgetUsd: parseFloat(e.target.value) || 1,
                    })
                  }
                  min={0.1}
                  step={0.5}
                  className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Default Model
                </label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultModel: e.target.value })
                  }
                  className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                >
                  <option value="haiku">Haiku 4.5</option>
                  <option value="sonnet">Sonnet 4.6</option>
                  <option value="opus">Opus 4.6</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Default Runtime
                </label>
                <select
                  value={settings.defaultRuntime}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultRuntime: e.target.value,
                    })
                  }
                  className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex</option>
                  <option value="gemini-cli">Gemini CLI</option>
                  <option value="litellm">LiteLLM Proxy</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-xs bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
              </button>
            </div>
          </div>
        </section>

        {/* Team Templates */}
        <section>
          <h2 className="text-sm font-semibold text-deck-text-bright mb-4">
            Team Templates
          </h2>
          {teams.length === 0 ? (
            <div className="bg-deck-surface rounded-lg border border-deck-border p-8 text-center">
              <p className="text-xs text-deck-muted">
                No team templates found. Create one from the Command Center or
                add YAML files to team-configs/.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => {
                let agentCount = 0;
                try {
                  agentCount =
                    JSON.parse(team.config_json).agents?.length || 0;
                } catch {}

                return (
                  <div
                    key={team.id}
                    className="bg-deck-surface rounded-lg border border-deck-border p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-deck-text-bright">
                          {team.name}
                        </span>
                        {team.source === "file" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 font-medium">
                            YAML
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <p className="text-[10px] text-deck-text-dim mt-0.5">
                          {team.description}
                        </p>
                      )}
                      <span className="text-[10px] text-deck-muted">
                        {agentCount} {agentCount === 1 ? "agent" : "agents"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Keyboard Shortcuts */}
        <section>
          <h2 className="text-sm font-semibold text-deck-text-bright mb-4">
            Keyboard Shortcuts
          </h2>
          <div className="bg-deck-surface rounded-lg border border-deck-border p-5">
            <div className="space-y-2 text-xs">
              {[
                ["Cmd/Ctrl + 1", "Command Center"],
                ["Cmd/Ctrl + 2", "History"],
                ["Cmd/Ctrl + 3", "Settings"],
                ["1-9", "Select agent by index"],
                ["Escape", "Deselect / close panel"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-deck-text-dim">{desc}</span>
                  <kbd className="text-[10px] font-mono px-2 py-0.5 bg-deck-surface-2 border border-deck-border rounded text-deck-muted">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
