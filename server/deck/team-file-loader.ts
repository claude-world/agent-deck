/**
 * Team YAML File Loader
 *
 * Scans a directory for *.yaml/*.yml files and loads them as team configs.
 * File-based configs are read-only (cannot be edited/deleted via the UI).
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { TeamConfigSchema } from "./types.js";

export interface FileTeamConfig {
  id: string; // filename-based stable ID
  name: string;
  description: string;
  config: TeamConfigSchema;
  filePath: string;
  source: "file";
}

/**
 * Load all YAML team configs from a directory.
 * Returns a Map of id -> TeamConfigSchema for use by DeckManager.
 */
export async function loadTeamConfigs(
  configDir: string
): Promise<FileTeamConfig[]> {
  const results: FileTeamConfig[] = [];

  if (!fs.existsSync(configDir)) {
    return results;
  }

  const files = fs.readdirSync(configDir).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml")
  );

  for (const file of files) {
    const filePath = path.join(configDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseYaml(raw) as TeamConfigSchema;

      // Validate minimal structure
      if (!parsed.name || !Array.isArray(parsed.agents)) {
        console.warn(`[TeamLoader] Skipping ${file}: missing 'name' or 'agents' array`);
        continue;
      }

      for (const agent of parsed.agents) {
        if (!agent.name || !agent.prompt) {
          console.warn(`[TeamLoader] Skipping ${file}: agent missing 'name' or 'prompt'`);
          continue;
        }
      }

      // Generate stable ID from filename
      const id = `file:${path.basename(file, path.extname(file))}`;

      results.push({
        id,
        name: parsed.name,
        description: parsed.description || "",
        config: parsed,
        filePath,
        source: "file",
      });

      console.log(`[TeamLoader] Loaded ${file} (${parsed.agents.length} agents)`);
    } catch (err: any) {
      console.warn(`[TeamLoader] Failed to parse ${file}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Convert FileTeamConfigs to a Map for DeckManager and to the REST API format.
 */
export function fileConfigsToMap(configs: FileTeamConfig[]): Map<string, TeamConfigSchema> {
  const map = new Map<string, TeamConfigSchema>();
  for (const c of configs) {
    map.set(c.id, c.config);
  }
  return map;
}

export function fileConfigsToApiFormat(configs: FileTeamConfig[]): Array<{
  id: string;
  name: string;
  description: string;
  config_json: string;
  source: "file";
  created_at: string;
  updated_at: string;
}> {
  return configs.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    config_json: JSON.stringify(c.config),
    source: "file" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}
