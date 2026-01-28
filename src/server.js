import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPresenterScript } from "./injector.js";
import { watchDirectory } from "./watcher.js";
import { createWebSocketHub } from "./websocket.js";
import { isLocalRequest } from "./request.js";

const CLIENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../client"
);

function normalizeBaseUrl(url) {
  const base = new URL(url);
  if (!base.protocol || (base.protocol !== "http:" && base.protocol !== "https:")) {
    throw new Error(`Unsupported URL protocol: ${base.protocol || ""}`);
  }
  if (!base.pathname.endsWith("/") && !path.extname(base.pathname)) {
    base.pathname += "/";
  }
  return base;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function resolveSafePath(baseDir, requestPath) {
  const resolvedPath = path.resolve(baseDir, `.${requestPath}`);
  if (!resolvedPath.startsWith(baseDir)) {
    return null;
  }
  return resolvedPath;
}

async function resolveFilePath(baseDir, requestPath) {
  let filePath = resolveSafePath(baseDir, requestPath);
  if (!filePath) {
    return null;
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return filePath;
}

async function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found\n");
}

function buildRemoteUrl(baseUrl, pathname, search) {
  const basePath = baseUrl.pathname.endsWith("/")
    ? baseUrl.pathname
    : path.extname(baseUrl.pathname)
      ? `${path.posix.dirname(baseUrl.pathname)}/`
      : `${baseUrl.pathname}/`;
  let relativePath = pathname;
  if (relativePath === basePath.slice(0, -1)) {
    relativePath = "";
  } else if (relativePath.startsWith(basePath)) {
    relativePath = relativePath.slice(basePath.length);
  } else {
    relativePath = relativePath.replace(/^\/+/, "");
  }
  const target = new URL(relativePath, baseUrl);
  if (typeof search === "string") {
    target.search = search;
  }
  return target;
}

async function fetchRemoteText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch (error) {
    return null;
  }
}

async function proxyRemoteRequest({ req, res, requestUrl, pathname, rootUrl }) {
  const targetUrl = buildRemoteUrl(rootUrl, pathname, requestUrl.search);
  let response;
  try {
    response = await fetch(targetUrl, { method: req.method });
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Upstream request failed\n");
    return;
  }
  const contentType = response.headers.get("content-type");

  res.statusCode = response.status;
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  } else if (targetUrl.pathname) {
    res.setHeader("Content-Type", getMimeType(targetUrl.pathname));
  }

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const isHtml = contentType?.includes("text/html");
  if (isHtml) {
    const html = await response.text();
    res.end(injectPresenterScript(html));
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function sendJson(res, payload, method = "GET") {
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[".json"]);
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}

async function loadPresenterConfig({ rootDir, rootUrl }) {
  if (rootUrl) {
    const configUrl = new URL("presenter.json", rootUrl);
    const data = await fetchRemoteText(configUrl);
    if (!data) {
      return null;
    }
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

  const configPath = path.join(rootDir, "presenter.json");
  try {
    const data = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sanitizeNotesHash(hash) {
  if (!hash) {
    return null;
  }
  let trimmed = hash.replace(/^#/, "");
  trimmed = trimmed.replace(/~(next|prev)$/u, "");
  trimmed = trimmed.replace(/\//g, "--");
  return trimmed;
}

function buildNotesCandidates(hash) {
  const safeHash = sanitizeNotesHash(hash);
  if (!safeHash) {
    return [];
  }
  const candidates = [safeHash];
  const base = safeHash.split(/--|-|\./u)[0];
  if (base && base !== safeHash && /^\d+$/.test(base)) {
    candidates.push(base);
  }
  return candidates;
}

async function loadNotesForHash({ rootDir, rootUrl }, hash) {
  const candidates = buildNotesCandidates(hash);
  if (candidates.length === 0) {
    return null;
  }
  if (rootUrl) {
    for (const candidate of candidates) {
      const notesUrl = new URL(`notes/${candidate}.md`, rootUrl);
      const data = await fetchRemoteText(notesUrl);
      if (data) {
        return data;
      }
    }
    return null;
  }

  for (const candidate of candidates) {
    const notesPath = path.join(rootDir, "notes", `${candidate}.md`);
    try {
      return await fs.readFile(notesPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return null;
}

export async function startServer({
  rootDir,
  rootUrl,
  port,
  watch = false,
  quiet = false,
  presenterKey = null,
}) {
  const normalizedRootUrl = rootUrl ? normalizeBaseUrl(rootUrl) : null;
  if (!rootDir && !normalizedRootUrl) {
    throw new Error("No presentation source provided");
  }
  const presenterConfig = await loadPresenterConfig({
    rootDir,
    rootUrl: normalizedRootUrl,
  });
  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed\n");
      return;
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    try {
      if (pathname === "/_/presenter" || pathname === "/_/presenter/") {
        if (presenterKey && !isLocalRequest(req)) {
          const providedKey = requestUrl.searchParams.get("key");
          if (providedKey !== presenterKey) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Unauthorized\n");
            return;
          }
        }
        const filePath = path.join(CLIENT_DIR, "presenter.html");
        const html = await fs.readFile(filePath, "utf8");
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME_TYPES[".html"]);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(html);
        return;
      }

      if (pathname.startsWith("/_/client/")) {
        const relativePath = pathname.slice("/_/client".length);
        const filePath = await resolveFilePath(CLIENT_DIR, relativePath);
        if (!filePath) {
          await sendNotFound(res);
          return;
        }
        const data = await fs.readFile(filePath);
        res.statusCode = 200;
        res.setHeader("Content-Type", getMimeType(filePath));
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(data);
        return;
      }

      if (pathname === "/_/api/config") {
        sendJson(res, presenterConfig ?? {}, req.method);
        return;
      }

      if (pathname === "/_/api/notes") {
        const hash = requestUrl.searchParams.get("hash");
        const notes = await loadNotesForHash(
          { rootDir, rootUrl: normalizedRootUrl },
          hash
        );
        sendJson(res, { notes }, req.method);
        return;
      }

      if (normalizedRootUrl) {
        await proxyRemoteRequest({
          req,
          res,
          requestUrl,
          pathname,
          rootUrl: normalizedRootUrl,
        });
        return;
      }

      const filePath = await resolveFilePath(rootDir, pathname);
      if (!filePath) {
        await sendNotFound(res);
        return;
      }

      const data = await fs.readFile(filePath);
      const mimeType = getMimeType(filePath);
      res.statusCode = 200;
      res.setHeader("Content-Type", mimeType);

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      if (path.extname(filePath).toLowerCase() === ".html") {
        const html = injectPresenterScript(data.toString("utf8"));
        res.end(html);
        return;
      }

      res.end(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        await sendNotFound(res);
        return;
      }
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Internal server error\n");
      console.error(error);
    }
  });

  const hub = createWebSocketHub(server, {
    config: presenterConfig,
    presenterKey,
  });

  if (watch && rootDir) {
    const watcher = watchDirectory(rootDir, () => {
      hub.broadcastReload({ preserveHash: true });
    });
    server.on("close", () => {
      watcher.close();
    });
  }

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });

  if (!quiet) {
    const sourceLabel = normalizedRootUrl ? normalizedRootUrl.toString() : rootDir;
    console.log(`mini-presenter serving ${sourceLabel} on http://localhost:${port}`);
  }

  return server;
}
