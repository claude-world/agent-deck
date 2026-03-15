/**
 * agent-deck config — View or update settings
 *
 * Usage:
 *   agent-deck config              View all settings
 *   agent-deck config set key val  Update a setting
 */

import type { CliContext } from "../index.js";
import { formatConfig, header, success, dim } from "../formatter.js";

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  // agent-deck config set <key> <val>
  if (args[0] === "set" && args[1]) {
    const key = args[1];
    const val = args[2];
    if (val === undefined) {
      throw new Error(`Usage: agent-deck config set <key> <value>`);
    }

    // Try to parse as number or boolean
    let parsed: unknown = val;
    if (val === "true") parsed = true;
    else if (val === "false") parsed = false;
    else if (/^\d+(\.\d+)?$/.test(val)) parsed = parseFloat(val);

    const updated = await client.put("/api/deck/settings", { [key]: parsed });

    if (flags.json) {
      console.log(JSON.stringify(updated));
      return;
    }

    console.log(success(`${key} = ${val}`));
    return;
  }

  // agent-deck config (view)
  const settings = await client.get("/api/deck/settings");

  if (flags.json) {
    console.log(JSON.stringify(settings));
    return;
  }

  console.log(header("Settings"));
  console.log(formatConfig(settings));
  console.log(`\n  ${dim("Update: agent-deck config set <key> <value>")}`);
}
