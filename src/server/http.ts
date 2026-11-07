import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  /** Decoded request path. */
  pathname: string;
  method: string;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

export function mimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function isHtmlPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".html" || ext === ".htm";
}

export function sendText(ctx: RequestContext, status: number, text: string): void {
  const { res } = ctx;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(ctx.method === "HEAD" ? undefined : `${text}\n`);
}

export function sendJson(ctx: RequestContext, payload: unknown, status = 200): void {
  const { res } = ctx;
  res.statusCode = status;
  res.setHeader("Content-Type", MIME_TYPES[".json"]!);
  res.setHeader("Cache-Control", "no-store");
  res.end(ctx.method === "HEAD" ? undefined : JSON.stringify(payload));
}

export function sendBody(
  ctx: RequestContext,
  body: string | Buffer,
  contentType: string,
  { status = 200, cache = "no-cache" }: { status?: number; cache?: string } = {},
): void {
  const { res } = ctx;
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cache);
  res.end(ctx.method === "HEAD" ? undefined : body);
}

export function redirect(ctx: RequestContext, location: string, status = 303): void {
  ctx.res.statusCode = status;
  ctx.res.setHeader("Location", location);
  ctx.res.setHeader("Cache-Control", "no-store");
  ctx.res.end();
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, "Payload too large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limit) {
      throw new HttpError(413, "Payload too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/** Reads a JSON object body. Requires a JSON content type so that cross-site forms cannot post. */
export async function readJsonObject(ctx: RequestContext, limit = 1024 * 1024): Promise<Record<string, unknown>> {
  const contentType = ctx.req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  const raw = (await readBody(ctx.req, limit)).toString("utf8").trim();
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // ignore malformed cookie values
    }
  }
  return cookies;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
