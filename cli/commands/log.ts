/**
 * agent-deck log <agent-name> — View agent output
 */

import type { CliContext } from "../index.js";
import { header, dim, cyan, bold, colorStatus } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  const name = args[0];
  if (!name) {
    throw new Error("Usage: agent-deck log <agent-name>");
  }

  // Find agent by name
  const agents = await client.get<any[]>("/api/deck/agents");
  const agent = agents.find(
    (a) => a.name === name || a.name.toLowerCase() === name.toLowerCase() || a.id === name
  );

  if (!agent) {
    throw new Error(`Agent not found: ${name}\nAvailable: ${agents.map((a) => a.name).join(", ") || "(none)"}`);
  }

  // Get output
  const output = await client.get<any[]>(`/api/deck/agents/${agent.id}/output`);

  if (flags.json) {
    console.log(JSON.stringify({ agent: { id: agent.id, name: agent.name, status: agent.status }, output }));
    return;
  }

  console.log(header(`Agent: ${agent.name}`));
  console.log(`${bold("Status:")} ${colorStatus(agent.status)}  ${bold("Model:")} ${agent.model}  ${bold("Cost:")} $${(agent.total_cost_usd || 0).toFixed(4)}`);
  console.log("");

  if (!output || output.length === 0) {
    console.log(dim("  No output yet"));
    return;
  }

  for (const event of output) {
    if (event.type === "text" && event.data?.content) {
      process.stdout.write(event.data.content);
    } else if (event.type === "tool_call" && event.data?.toolName) {
      console.log(dim(`  [tool: ${event.data.toolName}]`));
    } else if (event.type === "error" && event.data?.message) {
      console.log(`  ${dim("error:")} ${event.data.message}`);
    }
  }
  console.log("");
}
