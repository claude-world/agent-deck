/**
 * agent-deck commit -m "msg" [--push] [--all] — Non-interactive finalize
 *
 * Without --all: commits only staged files. If none staged, errors.
 * With --all: commits all changed files.
 */

import type { CliContext } from "../index.js";
import { success, info, error as fmtError, dim } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  // Parse -m "message"
  const msgIdx = args.indexOf("-m");
  if (msgIdx === -1 || !args[msgIdx + 1]) {
    throw new Error("Usage: agent-deck commit -m \"commit message\" [--push] [--all]");
  }
  const message = args[msgIdx + 1];
  const push = args.includes("--push");
  const all = args.includes("--all");

  // Get changed files
  const params = flags.workspace ? `?workspaceId=${flags.workspace}` : "";
  const resp = await client.get<{ files?: any[] }>(
    `/api/deck/finalize/changes${params}`
  );
  const files = resp?.files ?? [];

  if (files.length === 0) {
    if (flags.json) {
      console.log(JSON.stringify({ error: "No changes to commit" }));
    } else {
      console.log(info("No changes to commit"));
    }
    return;
  }

  // Select files: --all commits everything, otherwise only staged files
  let selectedFiles: string[];
  if (all) {
    selectedFiles = files.map((f: any) => f.path);
  } else {
    selectedFiles = files.filter((f: any) => f.staged).map((f: any) => f.path);
    if (selectedFiles.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify({ error: "No staged files. Use --all to commit all changes." }));
      } else {
        console.log(fmtError("No staged files. Use --all to commit all changes."));
      }
      process.exit(1);
    }
  }

  // Get active workflow ID (optional)
  let workflowId = "";
  try {
    const active = await client.get<any>("/api/deck/mission/active");
    if (active?.id) workflowId = active.id;
  } catch {}

  // Execute finalize
  const result = await client.post<any>("/api/deck/finalize/execute", {
    workflowId,
    workspaceId: flags.workspace,
    selectedFiles,
    commitMessage: message,
    push,
  });

  if (flags.json) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(success(`Committed: ${(result.commitHash || "").slice(0, 7)} — ${result.commitMessage}`));
  console.log(dim(`  ${result.filesCommitted} files committed${result.pushed ? ", pushed to remote" : ""}`));
}
