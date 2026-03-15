/**
 * CLI entry point — invoked by bin/agent-deck.js via tsx or pre-built bundle.
 * Reads args from AGENT_DECK_CLI_ARGS env variable.
 */

import { main } from "./index.js";

let args: string[];
try {
  args = JSON.parse(process.env.AGENT_DECK_CLI_ARGS || "[]");
  if (!Array.isArray(args)) args = [];
} catch {
  console.error("Invalid AGENT_DECK_CLI_ARGS environment variable");
  process.exit(1);
}

main(args).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
