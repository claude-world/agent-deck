/**
 * Agent Deck CLI - Output Formatter
 *
 * Human-readable output with ANSI colors and aligned tables.
 * Respects NO_COLOR env variable.
 */

const NO_COLOR = !!process.env.NO_COLOR;

// ─── ANSI Colors ──────────────────────────────────

function c(code: number, text: string): string {
  if (NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export const dim = (s: string) => c(2, s);
export const bold = (s: string) => c(1, s);
export const green = (s: string) => c(32, s);
export const red = (s: string) => c(31, s);
export const yellow = (s: string) => c(33, s);
export const cyan = (s: string) => c(36, s);
export const magenta = (s: string) => c(35, s);
export const blue = (s: string) => c(34, s);

// ─── Table Formatting ─────────────────────────────

export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) {
    return dim("  (empty)");
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] || "").length))
  );

  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const headerLine = headers
    .map((h, i) => ` ${bold(h.padEnd(widths[i]))} `)
    .join("│");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => {
      const stripped = stripAnsi(cell || "");
      const pad = widths[i] - stripped.length;
      return ` ${cell}${" ".repeat(Math.max(0, pad))} `;
    }).join("│")
  );

  return [headerLine, sep, ...dataLines].join("\n");
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Status Colors ────────────────────────────────

export function colorStatus(status: string): string {
  switch (status) {
    case "running":
    case "success":
      return green(status);
    case "completed":
    case "finalizing":
      return green(status);
    case "failed":
    case "dead":
    case "cancelled":
      return red(status);
    case "pending":
    case "queued":
    case "planning":
      return yellow(status);
    case "idle":
    case "paused":
    case "skipped":
      return dim(status);
    default:
      return status;
  }
}

// ─── Domain Formatters ────────────────────────────

export function formatAgents(agents: any[]): string {
  if (agents.length === 0) return dim("  No agents");

  const rows = agents.map((a) => [
    a.name,
    colorStatus(a.status),
    a.model || "-",
    a.runtime || "claude-code",
    `$${(a.total_cost_usd || 0).toFixed(4)}`,
  ]);

  return formatTable(["Name", "Status", "Model", "Runtime", "Cost"], rows);
}

export function formatStatus(workflow: any): string {
  if (!workflow) return dim("  No active workflow");

  const lines: string[] = [];
  const wfId = (workflow.id || "").slice(0, 8);
  const cost = workflow.totalCost ?? workflow.total_cost ?? 0;
  lines.push(`${bold("Workflow:")} ${workflow.name} ${dim(`(${wfId})`)}`);
  lines.push(`${bold("Status:")}   ${colorStatus(workflow.status)}`);
  lines.push(`${bold("Cost:")}     $${cost.toFixed(4)} / $${workflow.maxBudgetUsd ?? workflow.max_budget_usd ?? "∞"}`);

  if (workflow.nodes) {
    lines.push("");
    const nodeRows = Object.entries(workflow.nodes as Record<string, any>).map(
      ([name, node]: [string, any]) => [
        name,
        colorStatus(node.status),
        `$${(node.cost || 0).toFixed(4)}`,
        node.error || "-",
      ]
    );
    lines.push(formatTable(["Agent", "Status", "Cost", "Error"], nodeRows));
  }

  return lines.join("\n");
}

export function formatPlan(plan: any, project?: any): string {
  const lines: string[] = [];

  if (project) {
    lines.push(`${bold("Project:")} ${project.name} ${dim(`(${project.root})`)}`);
    lines.push("");
  }

  const agents = plan.agents || [];
  const estCost = (plan.estimatedCost ?? 0).toFixed(2);
  const estTime = plan.estimatedTimeMinutes ?? "?";
  lines.push(`${bold("Mission Plan")} ${dim(`— ${agents.length} agents, ~$${estCost}, ~${estTime}min`)}`);
  lines.push("");

  for (const agent of agents) {
    const deps = (agent.dependsOn || []).length > 0
      ? dim(` → after ${agent.dependsOn.join(", ")}`)
      : "";
    lines.push(`  ${cyan(agent.name)} ${dim(`[${agent.model || "default"}]`)}${deps}`);
    lines.push(`    ${agent.task}`);
  }

  return lines.join("\n");
}

export function formatHistory(workflows: any[]): string {
  if (workflows.length === 0) return dim("  No workflow history");

  const rows = workflows.map((w) => {
    // Parse changes_json for summary
    let changesSummary = "-";
    if (w.changes_json) {
      try {
        const files = JSON.parse(w.changes_json);
        if (Array.isArray(files) && files.length > 0) {
          const adds = files.reduce((s: number, f: any) => s + (f.additions || 0), 0);
          const dels = files.reduce((s: number, f: any) => s + (f.deletions || 0), 0);
          changesSummary = `${files.length} files, ${green(`+${adds}`)} ${red(`-${dels}`)}`;
        }
      } catch {}
    }

    // Commit column
    let commitCol = "-";
    if (w.commit_hash) {
      const hash = w.commit_hash.slice(0, 7);
      const prTag = w.pr_url ? " [PR]" : "";
      commitCol = `${hash}${prTag}`;
    }

    return [
      w.name || (w.id || "").slice(0, 8),
      colorStatus(w.status),
      `$${(w.totalCost || w.total_cost || 0).toFixed(4)}`,
      changesSummary,
      commitCol,
      formatDate(w.startedAt || w.started_at || w.created_at),
    ];
  });

  return formatTable(["Name", "Status", "Cost", "Changes", "Commit", "Date"], rows);
}

export function formatWorkspaces(workspaces: any[]): string {
  if (workspaces.length === 0) return dim("  No workspaces");

  const rows = workspaces.map((w) => [
    w.name || "-",
    w.path,
    w.framework || "-",
    w.language || "-",
    w.git_branch || "-",
  ]);

  return formatTable(["Name", "Path", "Framework", "Language", "Branch"], rows);
}

export function formatChanges(files: any[]): string {
  if (files.length === 0) return dim("  No changes");

  const rows = files.map((f) => {
    const stat = f.status === "added"
      ? green("+")
      : f.status === "deleted"
      ? red("-")
      : yellow("M");
    return [
      stat,
      f.path,
      `${green(`+${f.additions}`)} ${red(`-${f.deletions}`)}`,
    ];
  });

  return formatTable(["", "File", "Changes"], rows);
}

export function formatConfig(settings: any): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    lines.push(`  ${cyan(key)}: ${String(value)}`);
  }
  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────

function formatDate(input: string | number | null): string {
  if (!input) return "-";
  const d = typeof input === "number" ? new Date(input) : new Date(input);
  if (isNaN(d.getTime())) return "-";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

export function header(text: string): string {
  return `\n${bold(text)}\n`;
}

export function success(text: string): string {
  return green(`✓ ${text}`);
}

export function error(text: string): string {
  return red(`✗ ${text}`);
}

export function info(text: string): string {
  return cyan(`→ ${text}`);
}
