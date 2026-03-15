/**
 * agent-deck workspace list|add|remove — Manage workspaces
 */

import { resolve } from "path";
import type { CliContext } from "../index.js";
import { formatWorkspaces, header, success, info } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  const sub = args[0] || "list";

  switch (sub) {
    case "list":
    case "ls": {
      const workspaces = await client.get<any[]>("/api/deck/workspaces");
      if (flags.json) {
        console.log(JSON.stringify(workspaces));
        return;
      }
      console.log(header("Workspaces"));
      console.log(formatWorkspaces(workspaces));
      break;
    }

    case "add": {
      const rawPath = args[1] || ".";
      const absPath = resolve(rawPath);
      const result = await client.post<any>("/api/deck/workspaces", {
        path: absPath,
        name: args[2],
      });
      if (flags.json) {
        console.log(JSON.stringify(result));
        return;
      }
      console.log(success(`Added workspace: ${absPath}`));
      break;
    }

    case "remove":
    case "rm": {
      const id = args[1];
      if (!id) {
        throw new Error("Usage: agent-deck workspace remove <id-or-path>");
      }

      // Try to find by path first
      const workspaces = await client.get<any[]>("/api/deck/workspaces");
      const absPath = resolve(id);
      const match = workspaces.find((w) => w.id === id || w.path === absPath);

      if (!match) {
        throw new Error(`Workspace not found: ${id}`);
      }

      await client.delete(`/api/deck/workspaces/${match.id}`);
      if (flags.json) {
        console.log(JSON.stringify({ ok: true, id: match.id }));
        return;
      }
      console.log(success(`Removed workspace: ${match.path}`));
      break;
    }

    default:
      throw new Error(`Unknown workspace subcommand: ${sub}\nUsage: agent-deck workspace list|add|remove`);
  }
}
