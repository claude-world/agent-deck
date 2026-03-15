#!/usr/bin/env node

/**
 * Agent Deck CLI
 *
 * Usage:
 *   npx agent-deck          # Start on default port 3002
 *   npx agent-deck --port 8080
 *   npx agent-deck --help
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Agent Deck - Web-Based Agent Command Center

Usage:
  agent-deck [options]

Options:
  --port <n>    Server port (default: 3002, env: PORT)
  --help, -h    Show this help message
  --version     Show version

Environment Variables:
  PORT                      Server port (default: 3002)
  DECK_MAX_AGENTS           Max concurrent agents (default: 10)
  DECK_IDLE_THRESHOLD_SECONDS  Idle detection threshold (default: 300)
  LITELLM_PROXY_URL         LiteLLM proxy URL (enables LiteLLM runtime)
  AGENT_STATE_DB            Path to agent-state.db (optional bridge)
`);
  process.exit(0);
}

if (args.includes("--version")) {
  const pkg = await import("../package.json", { with: { type: "json" } });
  console.log(`agent-deck v${pkg.default.version}`);
  process.exit(0);
}

// Parse --port flag
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env.PORT = args[portIdx + 1];
}

// Run the server via tsx
const serverPath = join(__dirname, "../server/index.ts");
const child = spawn("npx", ["tsx", serverPath], {
  stdio: "inherit",
  env: { ...process.env },
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

// Forward signals
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
