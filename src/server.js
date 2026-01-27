import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPresenterScript } from "./injector.js";
import { createWebSocketHub } from "./websocket.js";

const CLIENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../client"
);

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

function sendJson(res, payload, method = "GET") {
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[".json"]);
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}

async function loadPresenterConfig(rootDir) {
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

async function loadNotesForHash(rootDir, hash) {
  const candidates = buildNotesCandidates(hash);
  if (candidates.length === 0) {
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

export async function startServer({ rootDir, port }) {
  const presenterConfig = await loadPresenterConfig(rootDir);
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
        const notes = await loadNotesForHash(rootDir, hash);
        sendJson(res, { notes }, req.method);
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

  createWebSocketHub(server, presenterConfig);

  server.listen(port, () => {
    console.log(`mini-presenter serving ${rootDir} on http://localhost:${port}`);
  });

  return server;
}
