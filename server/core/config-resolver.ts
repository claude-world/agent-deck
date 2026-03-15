/**
 * Config Resolver - 5-layer config merge system.
 *
 * Resolution order (highest priority first):
 * 1. Runtime overrides (from API call)
 * 2. Environment variables (DECK_*)
 * 3. deck.yaml project config
 * 4. ~/.config/agent-deck/config.yaml global config
 * 5. Built-in defaults
 */

import fs from "fs";
import path from "path";
import os from "os";
import { parse as parseYaml } from "yaml";
import type { AgentConfig, DeckSettings } from "./types.js";
import { DEFAULT_SETTINGS } from "./types.js";

// =====================================================
// Settings Resolution
// =====================================================

/**
 * Resolve settings by merging 5 layers.
 * Pass runtime overrides to apply API-level config on top.
 */
export function resolveSettings(
  projectRoot?: string,
  runtimeOverrides?: Partial<DeckSettings>
): DeckSettings {
  // Layer 5: Built-in defaults
  const result: DeckSettings = { ...DEFAULT_SETTINGS };

  // Layer 4: Global config (~/.config/agent-deck/config.yaml)
  const globalConfig = loadGlobalConfig();
  if (globalConfig?.settings) {
    applySettingsLayer(result, globalConfig.settings);
  }

  // Layer 3: Project config (deck.yaml in project root)
  if (projectRoot) {
    const projectConfig = loadProjectConfig(projectRoot);
    if (projectConfig?.settings) {
      applySettingsLayer(result, projectConfig.settings);
    }
  }

  // Layer 2: Environment variables (DECK_*)
  applyEnvLayer(result);

  // Layer 1: Runtime overrides
  if (runtimeOverrides) {
    applySettingsLayer(result, runtimeOverrides);
  }

  return result;
}

// =====================================================
// Agent Config Resolution
// =====================================================

/**
 * Resolve an agent config by merging project-level defaults with
 * the provided partial config.
 */
export function resolveAgentConfig(
  base: Partial<AgentConfig>,
  projectRoot?: string
): AgentConfig {
  const settings = resolveSettings(projectRoot);

  // Load project-level agent defaults from deck.yaml
  let projectDefaults: Partial<AgentConfig> = {};
  if (projectRoot) {
    const projectConfig = loadProjectConfig(projectRoot);
    if (projectConfig?.agentDefaults) {
      projectDefaults = projectConfig.agentDefaults;
    }
  }

  return {
    name: base.name || "agent",
    prompt: base.prompt || "",
    model: base.model || projectDefaults.model || settings.defaultModel,
    workspace: base.workspace || projectDefaults.workspace || projectRoot || process.cwd(),
    agent_type: base.agent_type || projectDefaults.agent_type || "general",
    runtime: base.runtime || projectDefaults.runtime || settings.defaultRuntime,
    interactive: base.interactive ?? projectDefaults.interactive ?? false,
    team_config_id: base.team_config_id,
    resumeSessionId: base.resumeSessionId,
    maxBudgetUsd: base.maxBudgetUsd ?? projectDefaults.maxBudgetUsd ?? settings.maxBudgetUsd,
    maxRetries: base.maxRetries ?? projectDefaults.maxRetries ?? 0,
    failureStrategy: base.failureStrategy ?? projectDefaults.failureStrategy ?? "abort-downstream",
    env: base.env ?? projectDefaults.env,
  };
}

// =====================================================
// Config File Loaders
// =====================================================

interface ConfigFile {
  settings?: Partial<DeckSettings>;
  agentDefaults?: Partial<AgentConfig>;
}

function loadGlobalConfig(): ConfigFile | null {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "agent-deck",
    "config.yaml"
  );
  return loadYamlConfig(configPath);
}

function loadProjectConfig(projectRoot: string): ConfigFile | null {
  const configPath = path.join(projectRoot, "deck.yaml");
  return loadYamlConfig(configPath);
}

function loadYamlConfig(filePath: string): ConfigFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseYaml(raw) as ConfigFile;
  } catch {
    return null;
  }
}

// =====================================================
// Layer Application
// =====================================================

function applySettingsLayer(
  target: DeckSettings,
  layer: Partial<DeckSettings>
): void {
  if (layer.maxAgents !== undefined) target.maxAgents = layer.maxAgents;
  if (layer.maxBudgetUsd !== undefined) target.maxBudgetUsd = layer.maxBudgetUsd;
  if (layer.idleThresholdSeconds !== undefined) target.idleThresholdSeconds = layer.idleThresholdSeconds;
  if (layer.defaultModel !== undefined) target.defaultModel = layer.defaultModel;
  if (layer.defaultRuntime !== undefined) target.defaultRuntime = layer.defaultRuntime;
  if (layer.autoOpenBrowser !== undefined) target.autoOpenBrowser = layer.autoOpenBrowser;
  if (layer.theme !== undefined) target.theme = layer.theme;
}

function applyEnvLayer(target: DeckSettings): void {
  const envMap: Record<string, (val: string) => void> = {
    DECK_MAX_AGENTS: (v) => { target.maxAgents = parseInt(v, 10); },
    DECK_MAX_BUDGET_USD: (v) => { target.maxBudgetUsd = parseFloat(v); },
    DECK_IDLE_THRESHOLD_SECONDS: (v) => { target.idleThresholdSeconds = parseInt(v, 10); },
    DECK_DEFAULT_MODEL: (v) => { target.defaultModel = v; },
    DECK_DEFAULT_RUNTIME: (v) => { target.defaultRuntime = v as DeckSettings["defaultRuntime"]; },
    DECK_AUTO_OPEN_BROWSER: (v) => { target.autoOpenBrowser = v === "true" || v === "1"; },
    DECK_THEME: (v) => { target.theme = v as DeckSettings["theme"]; },
  };

  for (const [envKey, apply] of Object.entries(envMap)) {
    const val = process.env[envKey];
    if (val !== undefined && val !== "") {
      apply(val);
    }
  }
}
