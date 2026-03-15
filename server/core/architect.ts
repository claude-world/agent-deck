/**
 * Architect Agent - AI-powered task decomposition.
 *
 * Takes a task description + ProjectStructure -> calls Claude CLI -> returns MissionPlan.
 * Uses `claude --print` so no API key needed -- leverages user's existing Claude auth.
 */

import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import type { ProjectStructure, MissionPlan, PlannedAgent } from "./types.js";

/** Resolve the claude binary path (same logic as ClaudeAdapter) */
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
    return execSync("which claude", { encoding: "utf8" }).trim();
  } catch {
    return "claude";
  }
}

const CLAUDE_BIN = resolveClaudePath();

/** Generate a mission plan from a task description and project structure */
export async function planMission(
  task: string,
  project: ProjectStructure
): Promise<MissionPlan> {
  const prompt = buildPrompt(task, project);

  const resultText = await callClaude(prompt, project.root);

  return parsePlan(resultText, project);
}

function buildPrompt(task: string, project: ProjectStructure): string {
  const projectCtx = [
    `Project: ${project.name}`,
    `Type: ${project.type}`,
    project.framework ? `Framework: ${project.framework}` : null,
    project.language ? `Primary Language: ${project.language}` : null,
    project.gitBranch ? `Git Branch: ${project.gitBranch}` : null,
    project.packages.length > 0
      ? `Packages: ${project.packages.map((p) => `${p.name} (${p.type}, ${p.path})`).join(", ")}`
      : null,
    `Claude Config: CLAUDE.md=${project.hasClaudeMd}, .mcp.json=${project.hasMcpJson}, deck.yaml=${project.hasDeckYaml}, agents=${project.agentCount}, skills=${project.skillCount}, MCP servers=${project.mcpServerCount}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are an AI architect that decomposes software tasks into a multi-agent execution plan.

## Project Context
${projectCtx}

## Task
${task}

## Instructions
Decompose this task into 2-6 specialized agents. Each agent should have a focused, independent task.
Consider dependencies between agents -- agents that produce outputs needed by others should be listed in dependsOn.

Return ONLY a JSON object (no markdown, no explanation) with this exact schema:
{
  "agents": [
    {
      "name": "agent-name",
      "task": "Detailed task description for the agent",
      "role": "researcher|implementer|tester|reviewer|devops",
      "workdir": ".",
      "model": "sonnet",
      "dependsOn": []
    }
  ],
  "estimatedCost": 0.15,
  "estimatedTimeMinutes": 5
}

Rules:
- Use "sonnet" as default model. Use "opus" only for complex architectural decisions or critical reviews.
- Use "haiku" for simple searches, linting, or formatting tasks.
- workdir should be relative to project root (use "." for root).
- For monorepos, assign agents to specific package directories when possible.
- dependsOn contains agent names that must complete before this agent starts.
- estimatedCost in USD, estimatedTimeMinutes is wall-clock time (agents run in parallel where possible).
- Agent names should be short, kebab-case identifiers (e.g., "auth-impl", "api-tests").
- Do NOT create agents for git commit, push, or finalize operations -- those are handled separately by the system.`;
}

function callClaude(prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "--print",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      "sonnet",
    ];

    const envPath = [
      process.env.PATH || "",
      path.join(os.homedir(), ".local", "bin"),
      "/usr/local/bin",
    ].join(":");

    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      env: {
        ...process.env,
        PATH: envPath,
        HOME: os.homedir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin?.end();

    let output = "";
    let resultText = "";

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr?.on("data", () => {
      // Ignore stderr (may contain progress info)
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);

      if (code !== 0 && !output) {
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      // Parse stream-json output to extract the result text
      const lines = output.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          // Look for result event (has "result" field at top level)
          if (event.result) {
            resultText = event.result;
          }
          // Also check for assistant message content blocks
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                resultText = block.text;
              }
            }
          }
        } catch {
          // Not JSON, skip
        }
      }

      if (!resultText) {
        // Fallback: try to find JSON in raw output
        const jsonMatch = output.match(/\{[\s\S]*"agents"[\s\S]*\}/);
        if (jsonMatch) {
          resultText = jsonMatch[0];
        }
      }

      if (resultText) {
        resolve(resultText);
      } else {
        reject(new Error("No result from Claude CLI"));
      }
    });

    // Timeout after 60 seconds
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Claude CLI timed out after 60s"));
    }, 60000);
  });
}

function parsePlan(text: string, _project: ProjectStructure): MissionPlan {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const raw = JSON.parse(jsonStr);

    const agents: PlannedAgent[] = (raw.agents || []).map((a: any) => ({
      name: String(a.name || "agent"),
      task: String(a.task || ""),
      role: a.role || undefined,
      workdir: String(a.workdir || "."),
      model: String(a.model || "sonnet"),
      dependsOn: Array.isArray(a.dependsOn) ? a.dependsOn.map(String) : [],
    }));

    // Validate: all dependsOn references must exist
    const names = new Set(agents.map((a) => a.name));
    for (const agent of agents) {
      agent.dependsOn = agent.dependsOn.filter((dep) => names.has(dep));
    }

    return {
      agents,
      estimatedCost: Number(raw.estimatedCost) || 0,
      estimatedTimeMinutes: Number(raw.estimatedTimeMinutes) || 5,
    };
  } catch (err) {
    throw new Error(`Failed to parse architect response as JSON: ${(err as Error).message}`);
  }
}
