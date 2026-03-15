/**
 * agent-deck status — Show active workflow status
 */

import type { CliContext } from "../index.js";
import { formatStatus, header } from "../formatter.js";

export async function execute({ client, flags }: CliContext): Promise<void> {
  const workflow = await client.get("/api/deck/mission/active");

  if (flags.json) {
    console.log(JSON.stringify(workflow));
    return;
  }

  console.log(header("Active Workflow"));
  console.log(formatStatus(workflow));
}
