/**
 * Settings Routes - Config resolution, MCP servers, team templates.
 */

import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { DeckStore } from "../core/db.js";
import { resolveSettings } from "../core/config-resolver.js";
import { DEFAULT_SETTINGS } from "../core/types.js";
import type { DeckSettings } from "../core/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSettingsRouter(store: DeckStore): Router {
  const router = Router();

  /** Get all settings (merged from DB + defaults) */
  router.get("/", (_req, res) => {
    try {
      // Get DB settings
      const dbSettings = store.getAllSettings();

      // Start with resolved settings (defaults + env + config files)
      const resolved = resolveSettings();

      // Overlay DB settings on top of resolved defaults
      const merged: DeckSettings = { ...resolved };
      for (const [key, value] of Object.entries(dbSettings)) {
        if (key in merged) {
          const defaultVal = (DEFAULT_SETTINGS as any)[key];
          if (typeof defaultVal === "number") {
            (merged as any)[key] = parseFloat(value);
          } else if (typeof defaultVal === "boolean") {
            (merged as any)[key] = value === "true" || value === "1";
          } else {
            (merged as any)[key] = value;
          }
        }
      }

      res.json(merged);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Update settings */
  router.put("/", (req, res) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "Request body must be an object" });
      }

      // Only allow known setting keys
      const allowedKeys = Object.keys(DEFAULT_SETTINGS);
      for (const [key, value] of Object.entries(updates)) {
        if (!allowedKeys.includes(key)) continue;
        store.setSetting(key, String(value));
      }

      // Return merged result
      const dbSettings = store.getAllSettings();
      const resolved = resolveSettings();
      const merged: DeckSettings = { ...resolved };
      for (const [key, value] of Object.entries(dbSettings)) {
        if (key in merged) {
          const defaultVal = (DEFAULT_SETTINGS as any)[key];
          if (typeof defaultVal === "number") {
            (merged as any)[key] = parseFloat(value);
          } else if (typeof defaultVal === "boolean") {
            (merged as any)[key] = value === "true" || value === "1";
          } else {
            (merged as any)[key] = value;
          }
        }
      }

      res.json(merged);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** List detected MCP servers */
  router.get("/mcp-servers", (req, res) => {
    try {
      const projectRoot = (req.query.path as string) || process.cwd();
      const mcpJsonPath = path.join(projectRoot, ".mcp.json");

      if (!fs.existsSync(mcpJsonPath)) {
        return res.json({ servers: [] });
      }

      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      const servers = Object.entries(mcpConfig.mcpServers || {}).map(
        ([name, config]: [string, any]) => ({
          name,
          command: config.command,
          args: config.args,
          env: config.env ? Object.keys(config.env) : [],
        })
      );

      res.json({ servers, path: mcpJsonPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** List team templates */
  router.get("/team-templates", (_req, res) => {
    try {
      const configDir = path.join(__dirname, "../../team-configs");
      const templates: Array<{ name: string; file: string; description?: string }> = [];

      if (fs.existsSync(configDir)) {
        const files = fs.readdirSync(configDir).filter(
          (f) => f.endsWith(".yaml") || f.endsWith(".yml")
        );

        for (const file of files) {
          const filePath = path.join(configDir, file);
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            // Simple extraction of name and description from YAML
            const nameMatch = content.match(/^name:\s*(.+)$/m);
            const descMatch = content.match(/^description:\s*(.+)$/m);
            templates.push({
              name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, "") : file,
              file,
              description: descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, "") : undefined,
            });
          } catch {
            templates.push({ name: file, file });
          }
        }
      }

      res.json({ templates, configDir });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
