/**
 * Project Routes - Project scanning and deck.yaml access.
 */

import { Router } from "express";
import fs from "fs";
import path from "path";
import { scanProject } from "../core/project-scanner.js";

export function createProjectRouter(): Router {
  const router = Router();

  /** Scan project structure */
  router.get("/scan", async (req, res) => {
    try {
      const scanPath = (req.query.path as string) || process.cwd();
      const structure = await scanProject(scanPath);
      res.json(structure);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Read deck.yaml if it exists */
  router.get("/deck-yaml", (req, res) => {
    try {
      const projectRoot = (req.query.path as string) || process.cwd();
      const deckYamlPath = path.join(projectRoot, "deck.yaml");

      if (!fs.existsSync(deckYamlPath)) {
        return res.status(404).json({ error: "deck.yaml not found", path: deckYamlPath });
      }

      const content = fs.readFileSync(deckYamlPath, "utf-8");
      res.json({ path: deckYamlPath, content });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
