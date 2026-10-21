/**
 * Local Access Guard
 *
 * Agent Deck has no authentication: anything that can reach the server can
 * spawn agents and commit code. The server therefore binds to the loopback
 * interface and rejects requests whose Host or Origin is not a loopback
 * address (LAN clients, cross-site requests from other websites, DNS rebinding).
 */

import type { RequestHandler } from "express";

/** Address the HTTP + WebSocket server binds to */
export const LOCAL_HOST = "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when a Host header value (`host[:port]`) names a loopback address */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

/** True when there is no Origin header (CLI, curl) or the origin is a local page */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTNAMES.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** True when an HTTP request or WebSocket upgrade comes from this machine */
export function isLocalRequest(headers: { host?: string; origin?: string }): boolean {
  return isLoopbackHost(headers.host) && isAllowedOrigin(headers.origin);
}

/** Express middleware that answers 403 to non-local requests */
export function localOnly(): RequestHandler {
  return (req, res, next) => {
    if (!isLocalRequest(req.headers)) {
      res.status(403).json({ error: "Agent Deck only accepts requests from localhost" });
      return;
    }
    next();
  };
}
