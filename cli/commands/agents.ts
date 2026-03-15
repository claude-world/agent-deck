/**
 * agent-deck agents — List all agents
 */

import type { CliContext } from "../index.js";
import { formatAgents, header } from "../formatter.js";

export async function execute({ client, flags }: CliContext): Promise<void> {
  const agents = await client.get<any[]>("/api/deck/agents");

  if (flags.json) {
    console.log(JSON.stringify(agents));
    return;
  }

  console.log(header("Agents"));
  console.log(formatAgents(agents));
}
