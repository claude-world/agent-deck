/**
 * Output Buffer - Per-agent ring buffer for stream events
 *
 * Stores last N events with monotonic sequence IDs so clients can
 * catch up when opening a detail panel mid-session.
 */

import type { StreamEvent } from "./types.js";

export interface BufferedEvent {
  seq: number;
  event: StreamEvent;
}

export class OutputBuffer {
  private buffer: BufferedEvent[] = [];
  private maxSize: number;
  private nextSeq = 1;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Push a new event, evicting oldest if at capacity */
  push(event: StreamEvent): number {
    const seq = this.nextSeq++;
    this.buffer.push({ seq, event });
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    return seq;
  }

  /** Get all buffered events */
  getAll(): BufferedEvent[] {
    return this.buffer;
  }

  /** Get events after a given sequence ID (for incremental sync) */
  getFrom(sinceSeq: number): BufferedEvent[] {
    const idx = this.buffer.findIndex((e) => e.seq > sinceSeq);
    if (idx === -1) return [];
    return this.buffer.slice(idx);
  }

  /** Current sequence counter */
  getLatestSeq(): number {
    return this.nextSeq - 1;
  }

  /** Number of buffered events */
  size(): number {
    return this.buffer.length;
  }

  /** Clear all events */
  clear(): void {
    this.buffer = [];
  }

  /** Serialize buffer for persistence */
  serialize(): string {
    return JSON.stringify(this.buffer);
  }
}

/**
 * Manages output buffers for all agents
 */
export class OutputBufferManager {
  private buffers: Map<string, OutputBuffer> = new Map();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Get or create buffer for an agent */
  getBuffer(agentId: string): OutputBuffer {
    let buffer = this.buffers.get(agentId);
    if (!buffer) {
      buffer = new OutputBuffer(this.maxSize);
      this.buffers.set(agentId, buffer);
    }
    return buffer;
  }

  /** Push event to agent's buffer */
  push(agentId: string, event: StreamEvent): number {
    return this.getBuffer(agentId).push(event);
  }

  /** Get agent output, optionally from a sequence ID */
  getAgentOutput(agentId: string, sinceSeq?: number): BufferedEvent[] {
    const buffer = this.buffers.get(agentId);
    if (!buffer) return [];
    return sinceSeq ? buffer.getFrom(sinceSeq) : buffer.getAll();
  }

  /** Remove buffer for an agent (on cleanup) */
  remove(agentId: string): void {
    this.buffers.delete(agentId);
  }

  /** Serialize a specific agent's buffer */
  serialize(agentId: string): string | null {
    const buffer = this.buffers.get(agentId);
    return buffer ? buffer.serialize() : null;
  }
}
