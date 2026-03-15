/**
 * Agent Deck CLI - Entry Point
 *
 * Parses argv, dispatches to command handlers.
 * All commands support --json and --port flags.
 */

import { DeckClient } from "./client.js";
import { error, bold, dim } from "./formatter.js";

// ─── Types ────────────────────────────────────────

export interface CliContext {
  client: DeckClient;
  args: string[];
  flags: CliFlags;
}

export interface CliFlags {
  json: boolean;
  port?: number;
  workspace?: string;
  help: boolean;
}

// ─── Arg Parsing ──────────────────────────────────

function parseArgs(argv: string[]): { command: string; args: string[]; flags: CliFlags } {
  const flags: CliFlags = { json: false, help: false };
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--port" && argv[i + 1]) {
      flags.port = parseInt(argv[i + 1], 10);
      i++;
    } else if (arg === "--workspace" && argv[i + 1]) {
      flags.workspace = argv[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    } else {
      // Pass unknown flags as positional for command-specific handling
      positional.push(arg);
      // Check if next arg is a value for this flag
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        positional.push(argv[i + 1]);
        i++;
      }
    }
    i++;
  }

  const command = positional[0] || "";
  const args = positional.slice(1);

  return { command, args, flags };
}

// ─── Command Registry ─────────────────────────────

const COMMANDS: Record<string, () => Promise<{ execute: (ctx: CliContext) => Promise<void> }>> = {
  status:    () => import("./commands/status.js"),
  agents:    () => import("./commands/agents.js"),
  history:   () => import("./commands/history.js"),
  config:    () => import("./commands/config.js"),
  plan:      () => import("./commands/plan.js"),
  launch:    () => import("./commands/launch.js"),
  abort:     () => import("./commands/abort.js"),
  run:       () => import("./commands/run.js"),
  workspace: () => import("./commands/workspace.js"),
  finalize:  () => import("./commands/finalize.js"),
  commit:    () => import("./commands/commit.js"),
  log:       () => import("./commands/log.js"),
};

// ─── Help ─────────────────────────────────────────

function showHelp(): void {
  console.log(`
${bold("Agent Deck CLI")}

${bold("Usage:")}
  agent-deck ${dim("[command] [options]")}

${bold("Commands:")}
  ${bold("serve")}                       Start the server (default)
  ${bold("run")} <task> [--commit] [--pr]  Plan + Launch + Monitor + Deliver
  ${bold("plan")} <task>                 Plan a mission (AI decomposition)
  ${bold("launch")}                      Execute the last plan
  ${bold("status")}                      Show active workflow status
  ${bold("abort")}                       Abort active workflow
  ${bold("agents")}                      List all agents
  ${bold("log")} <agent-name>            View agent output
  ${bold("workspace")} list|add|remove   Manage workspaces
  ${bold("finalize")}                    View changes and commit
  ${bold("commit")} -m "msg"             Non-interactive commit
  ${bold("history")}                     Workflow history
  ${bold("config")} [set key val]        View or update settings

${bold("Global Options:")}
  --json                        Machine-readable JSON output
  --port <n>                    Server port (default: auto-detect 3002-3007)
  --workspace <id>              Workspace ID to use
  --help, -h                    Show help

${bold("Examples:")}
  agent-deck run "add auth"                Full workflow
  agent-deck run "add auth" --commit      Auto-commit after workflow
  agent-deck run "add auth" --commit --pr Auto-commit + create PR
  agent-deck plan "refactor database"      Plan only
  agent-deck status --json                 JSON status
  agent-deck agents                        List agents
  agent-deck workspace add /path/to/proj   Add workspace
`);
}

// ─── Main ─────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv);

  // Help
  if (flags.help && !command) {
    showHelp();
    return;
  }

  // No command or serve → handled by bin/agent-deck.js (should not reach here)
  if (!command || command === "serve") {
    showHelp();
    return;
  }

  // Lookup command
  const loader = COMMANDS[command];
  if (!loader) {
    console.error(error(`Unknown command: ${command}`));
    console.error(`Run ${dim("agent-deck --help")} for usage.`);
    process.exit(1);
  }

  // Connect to server
  let client: DeckClient;
  try {
    client = await DeckClient.detect(flags.port);
  } catch (err: any) {
    if (flags.json) {
      console.log(JSON.stringify({ error: err.message }));
    } else {
      console.error(error(err.message));
    }
    process.exit(1);
  }

  // Execute command
  try {
    const mod = await loader();
    await mod.execute({ client, args, flags });
  } catch (err: any) {
    if (flags.json) {
      console.log(JSON.stringify({ error: err.message }));
    } else {
      console.error(error(err.message));
    }
    process.exit(1);
  }
}
