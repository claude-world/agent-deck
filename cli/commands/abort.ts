/**
 * agent-deck abort — Abort the active workflow
 */

import type { CliContext } from "../index.js";
import { success, error as fmtError, info } from "../formatter.js";

export async function execute({ client, flags }: CliContext): Promise<void> {
  // Find active workflow
  const active = await client.get<any>("/api/deck/mission/active");

  if (!active || !active.id) {
    if (flags.json) {
      console.log(JSON.stringify({ error: "No active workflow" }));
    } else {
      console.log(info("No active workflow to abort"));
    }
    return;
  }

  await client.post(`/api/deck/mission/${active.id}/abort`);

  if (flags.json) {
    console.log(JSON.stringify({ ok: true, workflowId: active.id }));
    return;
  }

  console.log(success(`Aborted workflow: ${active.name} (${(active.id || "").slice(0, 8)})`));
}
