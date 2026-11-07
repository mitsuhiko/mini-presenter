// Where slides come from: a local folder (served statically) or a remote site
// (proxied). Both inject the display script into HTML documents.

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpError, isHtmlPath, mimeType, sendBody, type RequestContext } from "./http.ts";
import { injectDisplayScript } from "./inject.ts";

/** Files written by mini-presenter that must not be served to the audience. */
const PRIVATE_FILES = new Set(["questions.json", "recording.json", "recording.webm"]);

export interface DeckSource {
  readonly kind: "local" | "remote";
  readonly label: string;
  /** Local folder, only for local decks. */
  readonly rootDir: string | null;
  /** Reads a deck-relative text file, `null` if missing. */
  readText(relativePath: string): Promise<string | null>;
  serve(ctx: RequestContext): Promise<void>;
}

/** Resolves a URL path inside `rootDir`, rejecting traversal and dotfiles. */
export function resolveInside(rootDir: string, requestPath: string): string | null {
  const segments = requestPath.split(/[/\\]+/u).filter(Boolean);
  if (segments.some((segment) => segment.startsWith(".") || segment.includes("\0"))) {
    return null;
  }
  const resolved = path.resolve(rootDir, ...segments);
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    return null;
  }
  return resolved;
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(header: string | undefined, size: number): ByteRange | "invalid" | null {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    return null;
  }
  let start: number;
  let end: number;
  if (!match[1]) {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  return start > end || start >= size ? "invalid" : { start, end };
}

export async function serveFile(ctx: RequestContext, filePath: string, { inject = true } = {}): Promise<void> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new HttpError(404, "Not found");
  }
  const { req, res } = ctx;
  const lastModified = stats.mtime.toUTCString();

  if (isHtmlPath(filePath) && inject) {
    const html = injectDisplayScript(await fs.readFile(filePath, "utf8"));
    sendBody(ctx, html, mimeType(filePath));
    return;
  }

  res.setHeader("Last-Modified", lastModified);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Accept-Ranges", "bytes");
  const since = req.headers["if-modified-since"];
  if (since && Math.floor(stats.mtimeMs / 1000) <= Math.floor(Date.parse(since) / 1000)) {
    res.statusCode = 304;
    res.end();
    return;
  }

  const range = parseRange(req.headers.range, stats.size);
  if (range === "invalid") {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${stats.size}`);
    res.end();
    return;
  }

  res.setHeader("Content-Type", mimeType(filePath));
  if (range) {
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stats.size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
  } else {
    res.statusCode = 200;
    res.setHeader("Content-Length", stats.size);
  }
  if (ctx.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(filePath, range ?? {}), res);
}

export function createLocalSource(rootDir: string): DeckSource {
  const root = path.resolve(rootDir);
  return {
    kind: "local",
    label: root,
    rootDir: root,
    async readText(relativePath) {
      const filePath = resolveInside(root, relativePath);
      if (!filePath) {
        return null;
      }
      try {
        return await fs.readFile(filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") {
          return null;
        }
        throw error;
      }
    },
    async serve(ctx) {
      let filePath = resolveInside(root, ctx.pathname);
      if (!filePath || PRIVATE_FILES.has(path.relative(root, filePath))) {
        throw new HttpError(404, "Not found");
      }
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch {
        throw new HttpError(404, "Not found");
      }
      if (stats.isDirectory()) {
        if (!ctx.pathname.endsWith("/")) {
          ctx.res.statusCode = 301;
          ctx.res.setHeader("Location", `${ctx.url.pathname}/${ctx.url.search}`);
          ctx.res.end();
          return;
        }
        filePath = path.join(filePath, "index.html");
      }
      try {
        await serveFile(ctx, filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new HttpError(404, "Not found");
        }
        throw error;
      }
    },
  };
}

/** Normalizes a remote deck URL so relative lookups resolve inside it. */
export function normalizeRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (!url.pathname.endsWith("/") && !path.posix.extname(url.pathname)) {
    url.pathname += "/";
  }
  url.hash = "";
  return url;
}

/**
 * Maps a local request path (still URL-encoded) onto the remote deck. Paths
 * that already include the deck's base path are used as-is, everything else
 * is resolved relative to the deck directory.
 */
export function remoteUrlFor(base: URL, encodedPathname: string, search: string): URL {
  const deckDir = new URL("./", base);
  let target: URL;
  if (encodedPathname === "/" && !base.pathname.endsWith("/")) {
    // The deck URL points at a file: serve that file at the root.
    target = new URL(base.toString());
  } else if (encodedPathname.startsWith(deckDir.pathname) && deckDir.pathname !== "/") {
    target = new URL(encodedPathname, deckDir);
  } else {
    target = new URL(`./${encodedPathname.replace(/^\/+/u, "")}`, deckDir);
  }
  target.search = search;
  return target;
}

const FORWARDED_REQUEST_HEADERS = ["accept", "accept-language", "range", "if-none-match", "if-modified-since"];
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
  "content-range",
  "accept-ranges",
];

export function createRemoteSource(rootUrl: string): DeckSource {
  const base = normalizeRemoteUrl(rootUrl);
  const deckDir = base.pathname.endsWith("/") ? base : new URL("./", base);

  async function fetchText(url: URL): Promise<string | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  }

  return {
    kind: "remote",
    label: base.toString(),
    rootDir: null,
    readText(relativePath) {
      return fetchText(new URL(relativePath.replace(/^\/+/u, ""), deckDir));
    },
    async serve(ctx) {
      const target = remoteUrlFor(base, ctx.url.pathname, ctx.url.search);
      const headers = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = ctx.req.headers[name];
        if (typeof value === "string") {
          headers.set(name, value);
        }
      }
      let response: Response;
      try {
        response = await fetch(target, { method: ctx.method, headers, redirect: "follow" });
      } catch {
        throw new HttpError(502, "Upstream request failed");
      }

      const { res } = ctx;
      res.statusCode = response.status;
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value) {
          res.setHeader(name, value);
        }
      }
      if (!response.headers.has("content-type")) {
        res.setHeader("Content-Type", mimeType(target.pathname));
      }
      if (ctx.method === "HEAD" || !response.body) {
        res.end();
        return;
      }
      if (response.headers.get("content-type")?.includes("text/html")) {
        res.removeHeader("etag");
        res.end(injectDisplayScript(await response.text()));
        return;
      }
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), res);
    },
  };
}
