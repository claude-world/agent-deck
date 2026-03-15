/**
 * Finalize Module - Git operations for post-workflow commit/push.
 *
 * Provides: getChangedFiles, getDiff, generateCommitMessage, executeFinalize.
 */

import { execFileSync, spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import type { ChangedFile, FinalizeConfig, FinalizeResult } from "./types.js";

/** Validate a file path is safe (relative, no traversal above workspace) */
function validateFilePath(workspacePath: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Absolute paths not allowed: ${filePath}`);
  }
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(workspacePath + path.sep) && resolved !== workspacePath) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return filePath;
}

/** Get list of changed files in the workspace */
export function getChangedFiles(workspacePath: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: workspacePath,
      encoding: "utf8",
      timeout: 10000,
    });

    for (const line of status.split("\n").filter(Boolean)) {
      const x = line[0]; // staged
      const y = line[1]; // unstaged
      let filePath = line.slice(3).trim();

      if (filePath.startsWith(".git/")) continue;

      // Handle renamed files: "R  old-name -> new-name"
      if (x === "R" && filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").pop()!;
      }

      let fileStatus: ChangedFile["status"] = "modified";
      if (x === "A" || y === "?") fileStatus = "added";
      else if (x === "D" || y === "D") fileStatus = "deleted";
      else if (x === "R") fileStatus = "renamed";

      const staged = x !== " " && x !== "?";

      let additions = 0;
      let deletions = 0;
      try {
        const args = ["diff", "--numstat"];
        if (staged) args.push("--cached");
        args.push("--", filePath);

        const numstat = execFileSync("git", args, {
          cwd: workspacePath,
          encoding: "utf8",
          timeout: 5000,
        }).trim();
        if (numstat) {
          const parts = numstat.split("\t");
          additions = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
          deletions = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;
        }
      } catch {}

      files.push({ path: filePath, status: fileStatus, staged, additions, deletions });
    }
  } catch {}

  return files;
}

/** Get unified diff for a specific file */
export function getDiff(workspacePath: string, filePath: string): string {
  validateFilePath(workspacePath, filePath); // Throws before try-catch

  try {
    let diff = "";
    try {
      diff = execFileSync("git", ["diff", "--cached", "--", filePath], {
        cwd: workspacePath,
        encoding: "utf8",
        timeout: 10000,
      });
    } catch {}

    if (!diff) {
      try {
        diff = execFileSync("git", ["diff", "--", filePath], {
          cwd: workspacePath,
          encoding: "utf8",
          timeout: 10000,
        });
      } catch {}
    }

    // For new untracked files, show file content (with path traversal check)
    if (!diff) {
      const fullPath = path.resolve(workspacePath, filePath);
      if (fullPath.startsWith(workspacePath) && fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        diff = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${content.split("\n").length} @@\n${content.split("\n").map((l) => `+${l}`).join("\n")}`;
      }
    }

    return diff;
  } catch {
    return "";
  }
}

/** Generate a commit message using Claude CLI --print */
export async function generateCommitMessage(
  workspacePath: string,
  taskDescription?: string
): Promise<string> {
  let diffSummary = "";
  try {
    diffSummary = execFileSync("git", ["diff", "--stat"], {
      cwd: workspacePath,
      encoding: "utf8",
      timeout: 10000,
    });
  } catch {}

  try {
    const cached = execFileSync("git", ["diff", "--cached", "--stat"], {
      cwd: workspacePath,
      encoding: "utf8",
      timeout: 10000,
    });
    if (cached) diffSummary = cached + "\n" + diffSummary;
  } catch {}

  if (!diffSummary.trim()) {
    return taskDescription
      ? `feat: ${taskDescription.slice(0, 50)}`
      : "chore: update files";
  }

  // Sanitize task description: strip control chars, limit length
  const sanitizedTask = taskDescription
    ? taskDescription.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200)
    : undefined;

  const prompt = `Generate a concise conventional commit message for these changes. Return ONLY the commit message, no explanation.

${sanitizedTask ? `Task: ${sanitizedTask}\n` : ""}
Changes:
${diffSummary.slice(0, 2000)}

Use format: type(scope): description
Types: feat, fix, refactor, docs, test, chore
Keep it under 72 characters.`;

  return new Promise((resolve) => {
    const claudePath = resolveClaudePath();
    const proc = spawn(claudePath, ["--print", prompt, "--model", "haiku"], {
      cwd: workspacePath,
      env: {
        ...process.env,
        PATH: [
          process.env.PATH || "",
          path.join(os.homedir(), ".local", "bin"),
          "/usr/local/bin",
        ].join(":"),
        HOME: os.homedir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin?.end();
    let output = "";

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(sanitizedTask ? `feat: ${sanitizedTask.slice(0, 50)}` : "chore: update files");
    }, 30000);

    proc.on("exit", () => {
      clearTimeout(timeout);
      const msg = output.trim().replace(/^["']|["']$/g, "").split("\n")[0];
      resolve(msg || (sanitizedTask ? `feat: ${sanitizedTask.slice(0, 50)}` : "chore: update files"));
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve(sanitizedTask ? `feat: ${sanitizedTask.slice(0, 50)}` : "chore: update files");
    });
  });
}

/** Execute the finalize: stage files, commit, optionally push */
export function executeFinalize(config: FinalizeConfig): FinalizeResult {
  const { workspacePath, selectedFiles, commitMessage, push } = config;

  // Validate all file paths before any git operations
  for (const file of selectedFiles) {
    validateFilePath(workspacePath, file);
  }

  // Stage selected files (using execFileSync — no shell injection)
  for (const file of selectedFiles) {
    try {
      execFileSync("git", ["add", "--", file], {
        cwd: workspacePath,
        timeout: 10000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to stage ${file}: ${msg}`);
    }
  }

  // Commit
  let commitHash = "";
  try {
    execFileSync("git", ["commit", "-m", commitMessage], {
      cwd: workspacePath,
      encoding: "utf8",
      timeout: 30000,
    });

    commitHash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Commit failed: ${msg}`);
  }

  // Push (optional)
  let pushed = false;
  if (push) {
    try {
      execFileSync("git", ["push"], {
        cwd: workspacePath,
        encoding: "utf8",
        timeout: 60000,
      });
      pushed = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Finalize] Push failed: ${msg}`);
    }
  }

  return {
    commitHash,
    commitMessage,
    pushed,
    filesCommitted: selectedFiles.length,
  };
}

/** Check if the GitHub CLI (gh) is available */
export function isGhAvailable(): boolean {
  try {
    execFileSync("gh", ["--version"], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Create a pull request using the GitHub CLI */
export function createPullRequest(
  workspacePath: string,
  options: { title: string; body?: string; base?: string }
): { prUrl: string } {
  const args = ["pr", "create", "--title", options.title];
  if (options.body) args.push("--body", options.body);
  if (options.base) args.push("--base", options.base);

  const output = execFileSync("gh", args, {
    cwd: workspacePath,
    encoding: "utf8",
    timeout: 30000,
  }).trim();

  // gh pr create outputs the PR URL as the last line
  const lines = output.split("\n");
  const prUrl = lines[lines.length - 1].trim();

  if (!prUrl.startsWith("https://")) {
    throw new Error(`gh pr create did not return a valid URL: ${prUrl.slice(0, 100)}`);
  }

  return { prUrl };
}

/** Resolve the claude binary path */
function resolveClaudePath(): string {
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    path.join(os.homedir(), ".npm-global", "bin", "claude"),
    "/usr/local/bin/claude",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  try {
    return execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
  } catch {
    return "claude";
  }
}
