/**
 * Agent Deck CLI - HTTP/WebSocket Client
 *
 * Communicates with the Agent Deck server via REST API and WebSocket.
 * Auto-detects server port by scanning 3002-3007.
 */

export interface ClientOptions {
  port?: number;
  baseUrl?: string;
}

export class DeckClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Auto-detect running server on ports 3002-3007 */
  static async detect(preferredPort?: number): Promise<DeckClient> {
    const ports = preferredPort
      ? [preferredPort]
      : [3002, 3003, 3004, 3005, 3006, 3007];

    for (const port of ports) {
      const url = `http://localhost:${port}`;
      try {
        const res = await fetch(`${url}/api/deck/settings`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          return new DeckClient(url);
        }
      } catch {
        // port not available, try next
      }
    }

    const tried = ports.join(", ");
    throw new Error(
      `No Agent Deck server found on ports ${tried}.\nStart the server with: agent-deck serve`
    );
  }

  get url(): string {
    return this.baseUrl;
  }

  get wsUrl(): string {
    return this.baseUrl.replace(/^http/, "ws") + "/ws";
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    // Handle 204 No Content (empty body)
    if (res.status === 204) {
      return { ok: true } as T;
    }
    return res.json() as Promise<T>;
  }
}
