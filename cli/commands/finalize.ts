/**
 * agent-deck finalize — View changes and commit
 */

import type { CliContext } from "../index.js";
import { formatChanges, header, success, info, dim, bold } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  const params = flags.workspace ? `?workspaceId=${flags.workspace}` : "";

  // Get changed files
  const resp = await client.get<{ files?: any[]; workspacePath?: string }>(
    `/api/deck/finalize/changes${params}`
  );
  const files = resp?.files ?? [];
  const workspacePath = resp?.workspacePath ?? process.cwd();

  if (flags.json) {
    console.log(JSON.stringify({ files, workspacePath }));
    return;
  }

  console.log(header("Changes"));
  console.log(`${dim(`Workspace: ${workspacePath}`)}`);
  console.log(formatChanges(files));

  if (files.length === 0) {
    return;
  }

  console.log(`\n${dim("  Commit with: agent-deck commit -m \"your message\"")}`);
}
