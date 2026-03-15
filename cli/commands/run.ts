/**
 * agent-deck run <task> — Plan + Launch + Monitor + Finalize
 *
 * The main workflow command. Connects via WebSocket for real-time updates.
 * --json mode outputs NDJSON (one JSON object per line per event).
 * --no-finalize skips the finalize step.
 * --commit auto-commits after workflow completes.
 * --pr auto-creates a PR (implies --push).
 * --push pushes after commit.
 */

import { WebSocket } from "ws";
import type { CliContext, CliFlags } from "../index.js";
import type { DeckClient } from "../client.js";
import { formatPlan, formatChanges, colorStatus, header, info, dim, bold, cyan, red, green, yellow } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  const task = args.filter(a => !a.startsWith("--")).join(" ");
  const noFinalize = args.includes("--no-finalize");
  const doPr = args.includes("--pr");
  const doPush = args.includes("--push") || doPr;
  const doCommit = args.includes("--commit") || doPr || doPush;

  if (!task) {
    throw new Error("Usage: agent-deck run <task> [--commit] [--pr] [--push] [--no-finalize]");
  }

  // ─── Step 1: Plan ─────────────────────────────────
  if (!flags.json) {
    console.log(info(`Planning: ${task}`));
  }

  const planBody: Record<string, string> = { task };
  if (flags.workspace) planBody.workspaceId = flags.workspace;

  const { plan, project } = await client.post<{ plan: any; project: any }>(
    "/api/deck/mission/plan",
    planBody
  );

  if (flags.json) {
    console.log(JSON.stringify({ event: "plan", agents: plan.agents.length, estimatedCost: plan.estimatedCost }));
  } else {
    console.log(header("Mission Plan"));
    console.log(formatPlan(plan, project));
    console.log("");
  }

  // ─── Step 2: Launch ───────────────────────────────
  const launchBody: Record<string, unknown> = { plan, name: task };
  if (flags.workspace) launchBody.workspaceId = flags.workspace;

  const workflow = await client.post<any>("/api/deck/mission/launch", launchBody);

  if (flags.json) {
    console.log(JSON.stringify({ event: "launched", workflowId: workflow.id }));
  } else {
    console.log(info(`Launched workflow ${dim((workflow.id || "").slice(0, 8))}`));
  }

  // ─── Step 3: Monitor via WebSocket ────────────────
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(client.wsUrl);
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        if (!flags.json) console.log(dim("\n  Timeout — workflow still running. Check with: agent-deck status"));
        finish();
      }
    }, 30 * 60 * 1000);

    function finish() {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        try { ws.close(); } catch {}
        resolve();
      }
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "deck:subscribe" }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "deck:workflow:node") {
          const node = msg.node;
          if (flags.json) {
            console.log(JSON.stringify({
              event: "node",
              agent: node.agentName,
              status: node.status,
              cost: node.cost,
              error: node.error || undefined,
            }));
          } else {
            const statusStr = colorStatus(node.status);
            const cost = node.cost > 0 ? dim(` $${node.cost.toFixed(4)}`) : "";
            const err = node.error ? red(` — ${node.error}`) : "";
            console.log(`  ${cyan(node.agentName)} ${statusStr}${cost}${err}`);
          }
        }

        if (msg.type === "deck:workflow:status") {
          const wf = msg.workflow;
          const terminal = ["completed", "failed", "cancelled", "finalizing"];
          if (terminal.includes(wf.status)) {
            if (flags.json) {
              console.log(JSON.stringify({
                event: "complete",
                status: wf.status,
                totalCost: wf.totalCost,
              }));
            } else {
              console.log("");
              console.log(`${bold("Result:")} ${colorStatus(wf.status)}  ${dim(`$${(wf.totalCost || 0).toFixed(4)}`)}`);
            }
            finish();
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", () => {
      // errors always fire close next — handle polling there only
    });

    ws.on("close", () => {
      if (!resolved) {
        // WS closed unexpectedly, fall back to polling
        resolved = true; // prevent timeout from interfering
        clearTimeout(timeoutId);
        pollUntilDone(client, workflow.id, flags).then(() => resolve()).catch(reject);
      }
    });
  });

  // ─── Step 4: Delivery ─────────────────────────────
  if (noFinalize) return;

  // 4a. Get changed files
  const wsQs = flags.workspace ? `?workspaceId=${encodeURIComponent(flags.workspace)}` : "";
  let changesData: { files: any[]; workspacePath: string };
  try {
    changesData = await client.get<{ files: any[]; workspacePath: string }>(
      `/api/deck/finalize/changes${wsQs}`
    );
  } catch {
    changesData = { files: [], workspacePath: "" };
  }

  const files = changesData.files || [];
  const totalAdditions = files.reduce((s: number, f: any) => s + (f.additions || 0), 0);
  const totalDeletions = files.reduce((s: number, f: any) => s + (f.deletions || 0), 0);

  if (files.length === 0) {
    if (flags.json) {
      console.log(JSON.stringify({ event: "changes", files: 0, additions: 0, deletions: 0 }));
    } else {
      console.log(dim("\n  No changes detected"));
    }
    return;
  }

  // Display changes
  if (flags.json) {
    console.log(JSON.stringify({ event: "changes", files: files.length, additions: totalAdditions, deletions: totalDeletions }));
  } else {
    console.log(header("Changes"));
    console.log(formatChanges(files));
    console.log(`  ${dim(`${files.length} files changed,`)} ${green(`+${totalAdditions}`)} ${red(`-${totalDeletions}`)}`);
  }

  // 4b. Store changes in DB (only when not committing — /execute stores them itself)
  if (!doCommit) {
    try {
      await client.post("/api/deck/finalize/changes", {
        workflowId: workflow.id,
        files,
      });
    } catch {}
  }

  // 4c. Commit if --commit
  if (doCommit) {
    // Generate AI commit message
    let commitMessage: string;
    try {
      const msgRes = await client.post<{ message: string }>("/api/deck/finalize/message", {
        workspaceId: flags.workspace,
        task,
      });
      commitMessage = msgRes.message;
    } catch {
      commitMessage = `feat: ${task.slice(0, 50)}`;
    }

    // Execute commit
    const allFiles = files.map((f: any) => f.path);
    try {
      const result = await client.post<{
        commitHash: string;
        commitMessage: string;
        pushed: boolean;
        filesCommitted: number;
      }>("/api/deck/finalize/execute", {
        workflowId: workflow.id,
        workspaceId: flags.workspace,
        selectedFiles: allFiles,
        commitMessage,
        push: doPush,
      });

      if (flags.json) {
        console.log(JSON.stringify({
          event: "committed",
          commitHash: result.commitHash,
          commitMessage: result.commitMessage,
          pushed: result.pushed,
        }));
      } else {
        const pushStatus = result.pushed ? `  ${green("pushed")}` : "";
        console.log(info(`Committed: ${bold(result.commitHash)} — ${result.commitMessage}${pushStatus}`));
      }

      // 4d. Create PR if --pr
      if (doPr) {
        try {
          const prRes = await client.post<{ prUrl: string }>("/api/deck/finalize/pr", {
            workflowId: workflow.id,
            workspaceId: flags.workspace,
            title: commitMessage,
            body: `## Summary\n\nTask: ${task}\n\n${files.length} files changed, +${totalAdditions} -${totalDeletions}`,
          });

          if (flags.json) {
            console.log(JSON.stringify({ event: "pr_created", prUrl: prRes.prUrl }));
          } else {
            console.log(info(`PR: ${cyan(prRes.prUrl)}`));
          }
        } catch (err: any) {
          if (flags.json) {
            console.log(JSON.stringify({ event: "pr_error", error: err.message }));
          } else {
            console.log(yellow(`  PR creation failed: ${err.message}`));
          }
        }
      }
    } catch (err: any) {
      if (flags.json) {
        console.log(JSON.stringify({ event: "commit_error", error: err.message }));
      } else {
        console.log(red(`  Commit failed: ${err.message}`));
      }
    }
  } else {
    // No --commit flag — hint to user
    if (!flags.json) {
      console.log(dim(`\n  Commit with: agent-deck commit -m 'msg' --all`));
    }
  }
}

/** Fallback: poll workflow status every 3s via mission/active endpoint */
async function pollUntilDone(client: DeckClient, workflowId: string, flags: CliFlags): Promise<void> {
  const terminal = ["completed", "failed", "cancelled", "finalizing"];
  const seen = new Set<string>();

  for (let i = 0; i < 600; i++) {
    await sleep(3000);
    try {
      // Use mission/active — always returns the currently running workflow
      const wf = await client.get<any>("/api/deck/mission/active");
      if (!wf) {
        // No active workflow — it must have finished. Check history for final state.
        try {
          const hist = await client.get<any>(`/api/deck/history/${workflowId}`);
          if (hist) {
            if (flags.json) {
              console.log(JSON.stringify({ event: "complete", status: hist.status, totalCost: hist.total_cost || hist.totalCost || 0 }));
            }
            return;
          }
        } catch {}
        return;
      }

      // Different workflow is active — ours must have finished
      if (wf.id !== workflowId) {
        try {
          const hist = await client.get<any>(`/api/deck/history/${workflowId}`);
          if (hist) {
            if (flags.json) {
              console.log(JSON.stringify({ event: "complete", status: hist.status, totalCost: hist.total_cost || hist.totalCost || 0 }));
            }
            return;
          }
        } catch {}
        continue;
      }

      // Report node changes
      if (wf.nodes) {
        for (const [name, node] of Object.entries(wf.nodes as Record<string, any>)) {
          const key = `${name}:${node.status}`;
          if (!seen.has(key)) {
            seen.add(key);
            if (flags.json) {
              console.log(JSON.stringify({ event: "node", agent: name, status: node.status, cost: node.cost }));
            } else {
              console.log(`  ${name} → ${colorStatus(node.status)}`);
            }
          }
        }
      }

      if (terminal.includes(wf.status)) {
        if (flags.json) {
          console.log(JSON.stringify({ event: "complete", status: wf.status, totalCost: wf.totalCost }));
        }
        return;
      }
    } catch {
      // server might be temporarily unreachable
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
