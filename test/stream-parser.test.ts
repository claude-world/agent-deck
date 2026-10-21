import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StreamParser } from "../server/deck/stream-parser.js";
import type { StreamEvent } from "../server/deck/types.js";

/** Lines in the shape `claude --print --output-format stream-json --verbose` writes */
const CLI_OUTPUT = [
  { type: "system", subtype: "init", session_id: "sess-1", model: "claude-sonnet-5-5", tools: ["Read"] },
  {
    type: "assistant",
    session_id: "sess-1",
    message: {
      content: [
        { type: "thinking", thinking: "Let me look at the file." },
        { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "README.md" } },
      ],
    },
  },
  { type: "user", session_id: "sess-1", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "# Readme" }] } },
  { type: "assistant", session_id: "sess-1", message: { content: [{ type: "text", text: "Done." }] } },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1234,
    num_turns: 2,
    result: "Done.",
    session_id: "sess-1",
    total_cost_usd: 0.0042,
    usage: { input_tokens: 1200, output_tokens: 80 },
  },
];

function parse(chunks: string[]): StreamEvent[] {
  const parser = new StreamParser("agent-1");
  const events: StreamEvent[] = [];
  parser.on("event", (e: StreamEvent) => events.push(e));
  for (const chunk of chunks) parser.feed(chunk);
  parser.flush();
  return events;
}

describe("StreamParser", () => {
  it("normalizes Claude Code stream-json output", () => {
    const events = parse([CLI_OUTPUT.map((e) => JSON.stringify(e)).join("\n") + "\n"]);

    assert.deepEqual(
      events.map((e) => e.type),
      ["init", "thinking", "tool_call", "text", "complete"]
    );
    assert.equal(events.every((e) => e.agentId === "agent-1"), true);

    const [init, thinking, toolCall, text, complete] = events as any[];
    assert.equal(init.data.sessionId, "sess-1");
    assert.equal(thinking.data.content, "Let me look at the file.");
    assert.deepEqual(toolCall.data, { toolId: "toolu_1", toolName: "Read", toolInput: { file_path: "README.md" } });
    assert.deepEqual(text.data, { content: "Done.", isPartial: false });
    assert.deepEqual(complete.data, {
      status: "success",
      error: undefined,
      durationMs: 1234,
      sessionId: "sess-1",
      costUsd: 0.0042,
      inputTokens: 1200,
      outputTokens: 80,
    });
  });

  it("reassembles lines split across chunks", () => {
    const line = JSON.stringify(CLI_OUTPUT[3]) + "\n";
    const events = parse([line.slice(0, 10), line.slice(10, 25), line.slice(25)]);
    assert.deepEqual(events.map((e) => e.type), ["text"]);
  });

  it("parses a final line without a trailing newline on flush", () => {
    const events = parse([JSON.stringify(CLI_OUTPUT[4])]);
    assert.deepEqual(events.map((e) => e.type), ["complete"]);
  });

  it("reports error results and plain-text CLI errors", () => {
    const events = parse([
      JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom", session_id: "s" }) + "\n",
      "Error: claude: command failed\n",
    ]) as any[];
    assert.equal(events[0].type, "complete");
    assert.equal(events[0].data.status, "error");
    assert.equal(events[0].data.error, "boom");
    assert.equal(events[1].type, "error");
    assert.equal(events[1].data.message, "Error: claude: command failed");
  });

  it("ignores unknown event types and non-JSON noise", () => {
    const events = parse(['{"type":"rate_limit_event"}\n', "some progress output\n"]);
    assert.equal(events.length, 0);
  });
});
