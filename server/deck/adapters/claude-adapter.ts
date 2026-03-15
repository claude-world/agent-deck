/**
 * Claude Code CLI Adapter (simplified for local use)
 *
 * Spawns Claude Code CLI via child_process.spawn with --output-format stream-json.
 * Uses regular process spawn (not PTY) since we run in non-interactive --print mode.
 */

import { EventEmitter } from "events";
import { spawn, execSync, type ChildProcess } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import { StreamParser } from "../stream-parser.js";
import type { AgentAdapter, AdapterEvents } from "../adapter-interface.js";
import type { StreamEvent, CompleteEvent, SpawnAgentConfig } from "../types.js";

/** Resolve the full path to the claude CLI binary */
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

export class ClaudeAdapter extends EventEmitter implements AgentAdapter {
  private process: ChildProcess | null = null;
  private streamParser: StreamParser | null = null;
  private agentId: string;
  private pid: number | null = null;
  private completed = false;
  private interactive = false;
  private sessionId: string | null = null;

  constructor(agentId: string) {
    super();
    this.agentId = agentId;
  }

  getSessionId(): string | null {
    return this.sessionId || this.streamParser?.getSessionId() || null;
  }

  /** Spawn Claude CLI with the given config */
  spawn(config: SpawnAgentConfig): number {
    if (this.process) {
      throw new Error("Process already running");
    }

    this.interactive = !!config.interactive;
    const args = this.buildCliArgs(config);

    this.streamParser = new StreamParser(this.agentId);
    this.setupStreamParsing();

    const envPath = [
      process.env.PATH || "",
      path.join(os.homedir(), ".local", "bin"),
      "/usr/local/bin",
    ].join(":");

    this.process = spawn(CLAUDE_BIN, args, {
      cwd: config.workspace || process.cwd(),
      env: {
        ...process.env,
        PATH: envPath,
        HOME: os.homedir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.pid = this.process.pid || null;

    // In print mode (non-interactive), close stdin to prevent hanging.
    // In interactive mode, keep stdin open for follow-up messages.
    if (!this.interactive) {
      this.process.stdin?.end();
    }

    // Stream stdout through parser
    this.process.stdout?.on("data", (data: Buffer) => {
      this.streamParser?.feed(data.toString());
    });

    // Capture stderr for error reporting
    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        // Feed to parser in case it contains JSON events
        this.streamParser?.feed(text);
      }
    });

    this.process.on("error", (err) => {
      this.emit("error", err);
      this.cleanup();
    });

    this.process.on("exit", (code) => {
      this.handleProcessExit(code);
    });

    return this.pid!;
  }

  /** Send input to stdin */
  write(text: string): void {
    if (!this.process?.stdin) throw new Error("No active process");
    this.process.stdin.write(text + "\n");
  }

  /** Send SIGINT */
  interrupt(): void {
    if (this.process) {
      this.process.kill("SIGINT");
    }
  }

  /** Force kill */
  kill(): void {
    if (this.process) {
      this.process.kill("SIGKILL");
      this.cleanup();
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  getPid(): number | null {
    return this.pid;
  }

  private buildCliArgs(config: SpawnAgentConfig): string[] {
    const args: string[] = [];

    // Resume mode: --resume SESSION_ID
    if (config.resumeSessionId) {
      args.push("--resume", config.resumeSessionId);
      args.push("--output-format", "stream-json", "--verbose");
      if (config.model) args.push("--model", config.model);
      return args;
    }

    if (config.interactive) {
      // Interactive mode: no --print, stdin stays open
      args.push("--output-format", "stream-json", "--verbose");
      args.push("-p", config.prompt);
    } else {
      // Print mode (fire-and-forget)
      args.push("--print", config.prompt, "--output-format", "stream-json", "--verbose");
    }

    if (config.model) {
      args.push("--model", config.model);
    }

    return args;
  }

  private setupStreamParsing(): void {
    if (!this.streamParser) return;

    this.streamParser.on("event", (event: StreamEvent) => {
      // Capture session ID from init events
      if (event.type === "init" && (event as any).data?.sessionId) {
        this.sessionId = (event as any).data.sessionId;
      }

      this.emit("stream", event);

      if (event.type === "complete") {
        this.completed = true;
        const data = (event as CompleteEvent).data;
        if (data.sessionId) this.sessionId = data.sessionId;
        this.emit("complete", data);
      }
    });

    this.streamParser.on("error", (error: Error) => {
      this.emit("error", error);
    });
  }

  private handleProcessExit(exitCode: number | null): void {
    this.streamParser?.flush();

    // If no complete event was emitted by the parser, emit one
    if (!this.completed) {
      this.emit("complete", {
        status: exitCode === 0 ? "success" : "error",
        error: exitCode !== 0 ? `Process exited with code ${exitCode}` : undefined,
        sessionId: this.streamParser?.getSessionId() || undefined,
      });
    }

    this.cleanup();
  }

  private cleanup(): void {
    this.process = null;
    if (this.streamParser) {
      this.streamParser.reset();
      this.streamParser.removeAllListeners();
      this.streamParser = null;
    }
  }

  dispose(): void {
    if (this.process) {
      this.process.kill("SIGKILL");
    }
    this.cleanup();
    this.removeAllListeners();
  }
}

// Type-safe emitter
export interface ClaudeAdapter {
  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
