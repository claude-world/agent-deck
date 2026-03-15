/**
 * Workspace Manager - Multi-project support.
 *
 * Manages project workspaces: add, scan, rename, remove.
 */

import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import type { DeckStore } from "./db.js";
import type { Workspace } from "./types.js";

export class WorkspaceManager {
  private store: DeckStore;

  constructor(store: DeckStore) {
    this.store = store;
  }

  /** Add a workspace by path, scanning for project info */
  add(wsPath: string, name?: string): Workspace {
    const absPath = path.resolve(wsPath);

    // Check if already exists
    const existing = this.store.getWorkspaceByPath(absPath);
    if (existing) {
      this.store.touchWorkspace(existing.id);
      return existing;
    }

    // Verify path exists
    if (!fs.existsSync(absPath)) {
      throw new Error(`Path does not exist: ${absPath}`);
    }

    const info = this.scanPath(absPath);
    const id = uuidv4();

    return this.store.createWorkspace(
      id,
      name || info.name,
      absPath,
      info.framework,
      info.language,
      info.gitBranch
    );
  }

  /** Get all workspaces */
  getAll(): Workspace[] {
    return this.store.getAllWorkspaces();
  }

  /** Get a single workspace */
  get(id: string): Workspace | undefined {
    return this.store.getWorkspace(id);
  }

  /** Get workspace by path */
  getByPath(wsPath: string): Workspace | undefined {
    return this.store.getWorkspaceByPath(path.resolve(wsPath));
  }

  /** Rescan a workspace to update its metadata */
  rescan(id: string): Workspace {
    const ws = this.store.getWorkspace(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);

    const info = this.scanPath(ws.path);
    this.store.updateWorkspaceInfo(id, ws.name, info.framework, info.language, info.gitBranch);

    return this.store.getWorkspace(id)!;
  }

  /** Rename a workspace */
  rename(id: string, name: string): Workspace {
    const ws = this.store.getWorkspace(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);

    this.store.updateWorkspaceInfo(id, name, ws.framework ?? undefined, ws.language ?? undefined, ws.git_branch ?? undefined);
    return this.store.getWorkspace(id)!;
  }

  /** Remove a workspace (does not delete files) */
  remove(id: string): void {
    const ws = this.store.getWorkspace(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    this.store.deleteWorkspace(id);
  }

  /** Touch workspace (update last_used_at) */
  touch(id: string): void {
    this.store.touchWorkspace(id);
  }

  /** Get workflow stats for a workspace */
  getStats(id: string): { totalWorkflows: number; totalCost: number; lastRun: string | null } {
    const workflows = this.store.getWorkflowsByWorkspace(id);
    const totalCost = workflows.reduce((sum: number, w: any) => sum + (w.total_cost || 0), 0);
    const lastRun = workflows.length > 0 ? workflows[0].created_at : null;
    return { totalWorkflows: workflows.length, totalCost, lastRun };
  }

  /** Scan a path for project information */
  private scanPath(absPath: string): {
    name: string;
    framework: string | undefined;
    language: string | undefined;
    gitBranch: string | undefined;
  } {
    const name = path.basename(absPath);
    let framework: string | undefined;
    let language: string | undefined;
    let gitBranch: string | undefined;

    // Detect git branch
    try {
      gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: absPath,
        encoding: "utf8",
        timeout: 5000,
      }).trim();
    } catch {}

    // Detect framework from package.json
    const pkgPath = path.join(absPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) framework = "Next.js";
        else if (deps.astro || deps["@astrojs/react"]) framework = "Astro";
        else if (deps.nuxt) framework = "Nuxt";
        else if (deps.svelte || deps["@sveltejs/kit"]) framework = "SvelteKit";
        else if (deps.react) framework = "React";
        else if (deps.vue) framework = "Vue";
        else if (deps.express) framework = "Express";

        language = deps.typescript || deps["@types/node"] ? "TypeScript" : "JavaScript";
      } catch {}
    }

    // Detect Python
    if (!language) {
      if (fs.existsSync(path.join(absPath, "pyproject.toml")) ||
          fs.existsSync(path.join(absPath, "setup.py")) ||
          fs.existsSync(path.join(absPath, "requirements.txt"))) {
        language = "Python";
        if (fs.existsSync(path.join(absPath, "pyproject.toml"))) {
          try {
            const content = fs.readFileSync(path.join(absPath, "pyproject.toml"), "utf8");
            if (content.includes("django")) framework = "Django";
            else if (content.includes("fastapi")) framework = "FastAPI";
            else if (content.includes("flask")) framework = "Flask";
          } catch {}
        }
      }
    }

    // Detect Rust
    if (!language && fs.existsSync(path.join(absPath, "Cargo.toml"))) {
      language = "Rust";
    }

    // Detect Go
    if (!language && fs.existsSync(path.join(absPath, "go.mod"))) {
      language = "Go";
    }

    return { name, framework, language, gitBranch };
  }
}
