// Presenter authentication.
//
// Requests from the local machine are always trusted. Everybody else needs the
// presenter PIN once; after that they get an HttpOnly session cookie. Proxy
// headers (cloudflared) are only honored when the TCP peer is loopback, so they
// cannot be spoofed from the network.

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { parseCookies } from "./http.ts";

const SESSION_COOKIE = "mp_presenter";
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60_000;
const BLOCK_MS = 5 * 60_000;
/** After this many failures in total, PIN login is disabled until restart. */
const GLOBAL_FAILURE_LIMIT = 200;

function normalizeAddress(address: string | undefined | null): string | null {
  if (!address) {
    return null;
  }
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

export function isLoopbackAddress(address: string | undefined | null): boolean {
  const normalized = normalizeAddress(address);
  return normalized === "::1" || (normalized?.startsWith("127.") ?? false);
}

function header(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(",")[0]?.trim() || null;
}

function forwardedFor(req: IncomingMessage): string | null {
  return header(req, "cf-connecting-ip") ?? header(req, "x-forwarded-for");
}

/** True when the TCP peer is loopback and the request was not relayed by a local proxy. */
export function isLocalRequest(req: IncomingMessage): boolean {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return false;
  }
  if (forwardedFor(req) !== null) {
    return false;
  }
  // Defend against DNS rebinding: a local browser talking to us under a
  // foreign host name is not trusted.
  const host = (req.headers.host ?? "").toLowerCase();
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return hostname === "localhost" || hostname === "[::1]" || (hostname?.startsWith("127.") ?? false);
}

/** The client address, honoring proxy headers only from a loopback peer. */
export function clientAddress(req: IncomingMessage): string {
  const peer = normalizeAddress(req.socket.remoteAddress) ?? "unknown";
  if (isLoopbackAddress(peer)) {
    return normalizeAddress(forwardedFor(req)) ?? peer;
  }
  return peer;
}

/** True when the request was made over HTTPS, directly or via a local proxy. */
export function isSecureRequest(req: IncomingMessage): boolean {
  if ((req.socket as { encrypted?: boolean }).encrypted) {
    return true;
  }
  return isLoopbackAddress(req.socket.remoteAddress) && header(req, "x-forwarded-proto") === "https";
}

/**
 * Rejects cross-origin state changes. Browsers send `Origin` on POST/PUT and on
 * WebSocket upgrades; it must match the host the request was sent to.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host.toLowerCase() === (req.headers.host ?? "").toLowerCase();
  } catch {
    return false;
  }
}

interface AttemptEntry {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; reason: "invalid"; remaining: number }
  | { ok: false; reason: "blocked"; retryAfterMs: number }
  | { ok: false; reason: "disabled" };

export class PresenterAuth {
  readonly pin: string | null;
  private readonly sessions = new Set<string>();
  private readonly attempts = new Map<string, AttemptEntry>();
  private failures = 0;

  constructor(pin: string | null) {
    this.pin = pin;
  }

  /** Whether the request may act as presenter. */
  isAuthorized(req: IncomingMessage): boolean {
    if (isLocalRequest(req)) {
      return true;
    }
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    return token !== undefined && this.sessions.has(token);
  }

  /** Remaining block time for an address, or 0. */
  blockedFor(req: IncomingMessage, now = Date.now()): number {
    const entry = this.attempts.get(clientAddress(req));
    return entry && entry.blockedUntil > now ? entry.blockedUntil - now : 0;
  }

  login(req: IncomingMessage, candidate: string, now = Date.now()): LoginResult {
    if (!this.pin || this.failures >= GLOBAL_FAILURE_LIMIT) {
      return { ok: false, reason: "disabled" };
    }
    const address = clientAddress(req);
    let entry = this.attempts.get(address);
    if (!entry || (entry.resetAt <= now && entry.blockedUntil <= now)) {
      entry = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS, blockedUntil: 0 };
      this.attempts.set(address, entry);
    }
    if (entry.blockedUntil > now) {
      return { ok: false, reason: "blocked", retryAfterMs: entry.blockedUntil - now };
    }

    const expected = Buffer.from(this.pin);
    const actual = Buffer.from(candidate.trim());
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      this.attempts.delete(address);
      const token = randomBytes(24).toString("base64url");
      this.sessions.add(token);
      const secure = isSecureRequest(req) ? "; Secure" : "";
      return { ok: true, cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}` };
    }

    this.failures += 1;
    if (this.failures === GLOBAL_FAILURE_LIMIT) {
      console.warn("Too many failed presenter PIN attempts; PIN login is disabled until restart.");
    }
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.blockedUntil = now + BLOCK_MS;
      return { ok: false, reason: "blocked", retryAfterMs: BLOCK_MS };
    }
    return { ok: false, reason: "invalid", remaining: MAX_ATTEMPTS - entry.count };
  }
}

export function generatePin(): string {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
}
