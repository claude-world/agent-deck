/**
 * Project Scanner - Detects project structure from workspace path.
 *
 * Scans for monorepo configs, frameworks, Claude Code config files,
 * and builds a ProjectStructure map for the Architect Agent.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { ProjectStructure, PackageInfo } from "./types.js";

/** Scan a workspace directory and return its project structure */
export async function scanProject(rootPath: string): Promise<ProjectStructure> {
  const absRoot = path.resolve(rootPath);

  const name = await detectProjectName(absRoot);
  const monorepoType = detectMonorepoType(absRoot);
  const packages = monorepoType
    ? await detectPackages(absRoot, monorepoType)
    : [];
  const framework = detectFramework(absRoot) || undefined;
  const claudeConfig = detectClaudeConfig(absRoot);

  // v1.0 additions
  const hasDeckYaml = fs.existsSync(path.join(absRoot, "deck.yaml"));
  let gitBranch: string | null = null;
  let gitStatus: string | null = null;
  try {
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: absRoot, encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {}
  try {
    const raw = execSync("git status --porcelain", {
      cwd: absRoot, encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = raw.split("\n").filter(Boolean);
    gitStatus = lines.slice(0, 5).join("\n") || null;
  } catch {}

  return {
    name,
    root: absRoot,
    type: monorepoType ? "monorepo" : "single",
    framework,
    packages,
    hasClaudeMd: claudeConfig.hasClaudeMd,
    hasMcpJson: claudeConfig.hasMcpJson,
    hasDeckYaml,
    agentCount: claudeConfig.agentCount,
    skillCount: claudeConfig.skillCount,
    mcpServerCount: claudeConfig.mcpServerCount,
    gitBranch,
    gitStatus,
    language: null, // Delegated to core/project-scanner.ts for full detection
  };
}

async function detectProjectName(root: string): Promise<string> {
  // Try package.json name
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch {}
  }

  // Try Cargo.toml
  const cargoPath = path.join(root, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, "utf-8");
      const match = content.match(/name\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } catch {}
  }

  // Try git remote
  try {
    const gitConfigPath = path.join(root, ".git", "config");
    if (fs.existsSync(gitConfigPath)) {
      const content = fs.readFileSync(gitConfigPath, "utf-8");
      const match = content.match(/url\s*=\s*.*\/([^/\s]+?)(?:\.git)?$/m);
      if (match) return match[1];
    }
  } catch {}

  // Fallback to directory name
  return path.basename(root);
}

type MonorepoType = "pnpm" | "nx" | "turbo" | "lerna" | "workspaces" | "cargo" | "go";

function detectMonorepoType(root: string): MonorepoType | null {
  if (fs.existsSync(path.join(root, "pnpm-workspace.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "nx.json"))) return "nx";
  if (fs.existsSync(path.join(root, "turbo.json"))) return "turbo";
  if (fs.existsSync(path.join(root, "lerna.json"))) return "lerna";

  // Check package.json workspaces
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.workspaces) return "workspaces";
    } catch {}
  }

  // Rust workspace
  const cargoPath = path.join(root, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, "utf-8");
      if (content.includes("[workspace]")) return "cargo";
    } catch {}
  }

  // Go workspace
  if (fs.existsSync(path.join(root, "go.work"))) return "go";

  return null;
}

async function detectPackages(root: string, type: MonorepoType): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  let globs: string[] = [];

  switch (type) {
    case "pnpm": {
      const yamlPath = path.join(root, "pnpm-workspace.yaml");
      try {
        const content = fs.readFileSync(yamlPath, "utf-8");
        // Simple YAML parse for packages array
        const matches = content.match(/- ['"]?([^'"}\n]+)['"]?/g);
        if (matches) {
          globs = matches.map((m) => m.replace(/^- ['"]?/, "").replace(/['"]?$/, ""));
        }
      } catch {}
      break;
    }
    case "workspaces":
    case "turbo":
    case "lerna": {
      const pkgPath = path.join(root, "package.json");
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const ws = pkg.workspaces;
        globs = Array.isArray(ws) ? ws : ws?.packages || [];
      } catch {}
      break;
    }
    case "nx": {
      // Nx typically uses packages/ or apps/ + libs/
      globs = ["packages/*", "apps/*", "libs/*"];
      break;
    }
    case "cargo": {
      const cargoPath = path.join(root, "Cargo.toml");
      try {
        const content = fs.readFileSync(cargoPath, "utf-8");
        const matches = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
        if (matches) {
          const memberStr = matches[1];
          const members = memberStr.match(/"([^"]+)"/g);
          if (members) {
            globs = members.map((m) => m.replace(/"/g, ""));
          }
        }
      } catch {}
      break;
    }
    case "go": {
      const goWorkPath = path.join(root, "go.work");
      try {
        const content = fs.readFileSync(goWorkPath, "utf-8");
        const useMatch = content.match(/use\s*\(([\s\S]*?)\)/);
        if (useMatch) {
          globs = useMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
        }
      } catch {}
      break;
    }
  }

  // Resolve globs to actual directories
  for (const glob of globs) {
    // Simple glob resolution: handle "packages/*" pattern
    const basePath = glob.replace(/\/?\*$/, "");
    const fullBase = path.join(root, basePath);

    if (glob.endsWith("*") || glob.endsWith("/*")) {
      if (fs.existsSync(fullBase)) {
        try {
          const entries = fs.readdirSync(fullBase, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgDir = path.join(fullBase, entry.name);
              const info = buildPackageInfo(root, pkgDir);
              if (info) packages.push(info);
            }
          }
        } catch {}
      }
    } else {
      // Exact path
      const pkgDir = path.join(root, glob);
      if (fs.existsSync(pkgDir)) {
        const info = buildPackageInfo(root, pkgDir);
        if (info) packages.push(info);
      }
    }
  }

  return packages;
}

function buildPackageInfo(root: string, pkgDir: string): PackageInfo | null {
  const relPath = path.relative(root, pkgDir);
  let name = path.basename(pkgDir);
  let framework: string | undefined;
  const deps: string[] = [];

  // Try package.json
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.name) name = pkg.name;
      framework = detectFrameworkFromDeps(pkg.dependencies, pkg.devDependencies) || undefined;

      // Collect internal deps (workspace refs)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, ver] of Object.entries(allDeps)) {
        if (typeof ver === "string" && (ver.startsWith("workspace:") || ver === "*")) {
          deps.push(dep);
        }
      }
    } catch {}
  }

  // Try Cargo.toml
  const cargoPath = path.join(pkgDir, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, "utf-8");
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) name = nameMatch[1];
    } catch {}
  }

  const pkgType = inferPackageType(relPath, name, framework);

  return {
    name,
    path: relPath,
    type: pkgType,
    framework,
    dependencies: deps,
  };
}

function inferPackageType(relPath: string, name: string, framework?: string): "app" | "library" | "config" {
  const lower = relPath.toLowerCase();
  if (lower.startsWith("apps/") || lower.startsWith("services/")) return "app";
  if (lower.startsWith("libs/") || lower.startsWith("packages/")) return "library";
  if (lower.startsWith("config") || lower.startsWith("tools/")) return "config";
  if (framework) return "app";
  if (name.startsWith("@") && name.includes("/config")) return "config";
  return "library";
}

function detectFramework(root: string): string | null {
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return detectFrameworkFromDeps(pkg.dependencies, pkg.devDependencies);
    } catch {}
  }

  // Rust
  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    try {
      const content = fs.readFileSync(path.join(root, "Cargo.toml"), "utf-8");
      if (content.includes("actix-web")) return "Actix Web";
      if (content.includes("axum")) return "Axum";
      if (content.includes("rocket")) return "Rocket";
      return "Rust";
    } catch { return "Rust"; }
  }

  // Go
  if (fs.existsSync(path.join(root, "go.mod"))) {
    try {
      const content = fs.readFileSync(path.join(root, "go.mod"), "utf-8");
      if (content.includes("gin-gonic")) return "Gin";
      if (content.includes("fiber")) return "Fiber";
      return "Go";
    } catch { return "Go"; }
  }

  // Python
  if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "requirements.txt"))) {
    return "Python";
  }

  return null;
}

function detectFrameworkFromDeps(
  deps?: Record<string, string>,
  devDeps?: Record<string, string>
): string | null {
  const all = { ...deps, ...devDeps };
  if (!all) return null;

  const frameworks: string[] = [];

  // Frontend
  if (all["next"]) frameworks.push("Next.js");
  else if (all["astro"]) frameworks.push("Astro");
  else if (all["nuxt"]) frameworks.push("Nuxt");
  else if (all["svelte"] || all["@sveltejs/kit"]) frameworks.push("SvelteKit");
  else if (all["react"]) frameworks.push("React");
  else if (all["vue"]) frameworks.push("Vue");

  // Backend
  if (all["express"]) frameworks.push("Express");
  else if (all["fastify"]) frameworks.push("Fastify");
  else if (all["hono"]) frameworks.push("Hono");
  else if (all["koa"]) frameworks.push("Koa");

  return frameworks.length > 0 ? frameworks.join(" + ") : null;
}

function detectClaudeConfig(root: string): {
  hasClaudeMd: boolean;
  hasMcpJson: boolean;
  agentCount: number;
  skillCount: number;
  mcpServerCount: number;
} {
  const hasClaudeMd = fs.existsSync(path.join(root, "CLAUDE.md"));
  const hasMcpJson = fs.existsSync(path.join(root, ".mcp.json"));

  let agentCount = 0;
  const agentsDir = path.join(root, ".claude", "agents");
  if (fs.existsSync(agentsDir)) {
    try {
      agentCount = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).length;
    } catch {}
  }

  let skillCount = 0;
  const skillsDir = path.join(root, ".claude", "skills");
  if (fs.existsSync(skillsDir)) {
    try {
      skillCount = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory()).length;
    } catch {}
  }

  let mcpServerCount = 0;
  if (hasMcpJson) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf-8"));
      mcpServerCount = Object.keys(mcpConfig.mcpServers || {}).length;
    } catch {}
  }

  return { hasClaudeMd, hasMcpJson, agentCount, skillCount, mcpServerCount };
}
