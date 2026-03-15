/**
 * agent-deck history — Workflow history
 */

import type { CliContext } from "../index.js";
import { formatHistory, header } from "../formatter.js";

export async function execute({ client, flags }: CliContext): Promise<void> {
  const workflows = await client.get<any[]>("/api/deck/history");

  if (flags.json) {
    console.log(JSON.stringify(workflows));
    return;
  }

  console.log(header("Workflow History"));
  console.log(formatHistory(workflows));
}
