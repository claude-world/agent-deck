/**
 * agent-deck launch — Execute the last plan (or --plan <file>)
 */

import { readFileSync } from "fs";
import type { CliContext } from "../index.js";
import { PLAN_FILE } from "./plan.js";
import { formatStatus, header, success, info, error } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  // Resolve plan file
  let planFile = PLAN_FILE;
  const planIdx = args.indexOf("--plan");
  if (planIdx !== -1 && args[planIdx + 1]) {
    planFile = args[planIdx + 1];
  }

  let saved: { plan: any; project?: any; task?: string };
  try {
    saved = JSON.parse(readFileSync(planFile, "utf-8"));
  } catch {
    throw new Error(
      `No plan found at ${planFile}\nRun: agent-deck plan <task>`
    );
  }

  if (!flags.json) {
    console.log(info(`Launching plan: ${saved.task || "mission"}`));
  }

  const body: Record<string, unknown> = {
    plan: saved.plan,
    name: saved.task || "Mission",
  };
  if (flags.workspace) {
    body.workspaceId = flags.workspace;
  }

  const workflow = await client.post<any>("/api/deck/mission/launch", body);

  if (flags.json) {
    console.log(JSON.stringify(workflow));
    return;
  }

  console.log(header("Launched"));
  console.log(formatStatus(workflow));
  console.log(`\n${success("Workflow started")}`);
  console.log(`  Monitor: agent-deck status`);
}
