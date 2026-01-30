import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { injectPresenterScript } from "./injector.js";
import { watchDirectory } from "./watcher.js";
import { createWebSocketHub } from "./websocket.js";
import { isLocalRequest } from "./request.js";

const CLIENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../client"
);

const QUESTIONS_FILE_NAME = "questions.json";
const QUESTIONS_LOCK_NAME = ".questions.lock";
const QUESTION_TEXT_LIMIT = 500;
const QUESTION_COOKIE_NAME = "miniPresenterQuestionToken";

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

async function sendQuestionsUnsupported(res) {
  res.statusCode = 501;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Questions are not available for remote decks\n");
}

function parseCookies(header) {
  if (!header) {
    return {};
  }
  const cookies = {};
  header.split(";").forEach((part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) {
      return;
    }
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  });
  return cookies;
}

function getQuestionToken(req) {
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[QUESTION_COOKIE_NAME];
  return token && typeof token === "string" ? token : null;
}

function buildQuestionCookie(token) {
  return `${QUESTION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
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

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
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

function getQuestionsPaths(rootDir) {
  return {
    filePath: path.join(rootDir, QUESTIONS_FILE_NAME),
    lockPath: path.join(rootDir, QUESTIONS_LOCK_NAME),
  };
}

function normalizeQuestionsData(payload) {
  if (!payload || typeof payload !== "object") {
    return { version: 1, questions: [] };
  }
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const normalized = questions
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const id = typeof entry.id === "string" ? entry.id : null;
      const text = typeof entry.text === "string" ? entry.text.trim() : null;
      const votes = Number.isFinite(entry.votes) ? entry.votes : 0;
      const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : null;
      const updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : null;
      const voters = Array.isArray(entry.voters)
        ? entry.voters.filter((value) => typeof value === "string")
        : [];
      if (!id || !text) {
        return null;
      }
      return {
        id,
        text,
        votes: Math.max(0, Math.floor(votes)),
        voters,
        createdAt: createdAt ?? new Date().toISOString(),
        updatedAt: updatedAt ?? createdAt ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);
  return { version: 1, questions: normalized };
}

function stripQuestionVoters(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.map((question) => {
    if (!question || typeof question !== "object") {
      return question;
    }
    const { voters: _voters, ...rest } = question;
    return rest;
  });
}

async function readQuestionsFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeQuestionsData(parsed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, questions: [] };
    }
    throw error;
  }
}

async function writeQuestionsFile(filePath, data) {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, filePath);
}

async function acquireLock(lockPath, { retries = 20, delayMs = 40 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fs.open(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (attempt === retries) {
        throw new Error("Failed to acquire questions lock");
      }
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs + attempt * 25);
      });
    }
  }
  throw new Error("Failed to acquire questions lock");
}

async function withFileLock(lockPath, action) {
  const handle = await acquireLock(lockPath);
  try {
    return await action();
  } finally {
    try {
      await handle.close();
    } catch (error) {
      // ignore
    }
    try {
      await fs.unlink(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function updateQuestions(rootDir, action) {
  const { filePath, lockPath } = getQuestionsPaths(rootDir);
  return withFileLock(lockPath, async () => {
    const data = await readQuestionsFile(filePath);
    const result = await action(data);
    await writeQuestionsFile(filePath, data);
    return result;
  });
}

let qrCodeModules = null;

function getQrCodeModules() {
  if (!qrCodeModules) {
    const require = createRequire(import.meta.url);
    const QRCode = require("qrcode-terminal/vendor/QRCode");
    const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");
    qrCodeModules = { QRCode, QRErrorCorrectLevel };
  }
  return qrCodeModules;
}

function renderQrSvg(content, { margin = 2 } = {}) {
  const { QRCode, QRErrorCorrectLevel } = getQrCodeModules();
  const qrcode = new QRCode(-1, QRErrorCorrectLevel.L);
  qrcode.addData(content);
  qrcode.make();

  const moduleCount = qrcode.getModuleCount();
  const size = moduleCount + margin * 2;
  const rows = qrcode.modules;
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="#fff" />`,
  ];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (rows[row][col]) {
        const x = col + margin;
        const y = row + margin;
        parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#111" />`);
      }
    }
  }

  parts.push("</svg>");
  return parts.join("");
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
  let presenterConfig = await loadPresenterConfig({
    rootDir,
    rootUrl: normalizedRootUrl,
  });
  const sessionId = randomUUID();
  let mergedConfig = { ...(presenterConfig ?? {}), sessionId };
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const method = req.method || "GET";
    const isConfigUpdate =
      pathname === "/_/api/config" && (method === "PUT" || method === "POST");
    const isQuestionsUpdate =
      (pathname === "/_/api/questions" && method === "POST") ||
      (pathname === "/_/api/questions/vote" && method === "POST") ||
      (pathname === "/_/api/questions/delete" && method === "POST");

    if (method !== "GET" && method !== "HEAD" && !isConfigUpdate && !isQuestionsUpdate) {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed\n");
      return;
    }

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

      if (pathname === "/_/questions" || pathname === "/_/questions/") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }
        let token = getQuestionToken(req);
        if (!token) {
          token = randomUUID();
          res.setHeader("Set-Cookie", buildQuestionCookie(token));
        }
        const filePath = path.join(CLIENT_DIR, "questions.html");
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

      if (pathname === "/_/questions/qr" || pathname === "/_/questions/qr/") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }
        const filePath = path.join(CLIENT_DIR, "questions-qr.html");
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
        if (req.method === "GET" || req.method === "HEAD") {
          sendJson(res, mergedConfig, req.method);
          return;
        }

        if (!isLocalRequest(req)) {
          if (presenterKey) {
            const providedKey = requestUrl.searchParams.get("key");
            if (providedKey !== presenterKey) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Unauthorized\n");
              return;
            }
          } else {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Forbidden\n");
            return;
          }
        }

        if (!rootDir || normalizedRootUrl) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Presenter config is read-only for remote decks\n");
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid JSON\n");
          return;
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Config payload must be a JSON object\n");
          return;
        }

        const { sessionId: _sessionId, ...rest } = payload;
        presenterConfig = rest;
        mergedConfig = { ...rest, sessionId };

        const configPath = path.join(rootDir, "presenter.json");
        try {
          await fs.writeFile(configPath, `${JSON.stringify(rest, null, 2)}\n`);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Failed to save presenter config\n");
          return;
        }

        hub.updateConfig(mergedConfig);
        sendJson(res, { saved: true, config: mergedConfig }, req.method);
        return;
      }

      if (pathname === "/_/api/questions/qr") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }
        const protocol = req.socket.encrypted ? "https" : "http";
        const host = req.headers.host ?? "localhost";
        const questionsUrl = new URL("/_/questions", `${protocol}://${host}`);
        const svg = renderQrSvg(questionsUrl.toString());
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME_TYPES[".svg"]);
        res.end(svg);
        return;
      }

      if (pathname === "/_/api/questions") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }

        if (req.method === "GET" || req.method === "HEAD") {
          const data = await readQuestionsFile(getQuestionsPaths(rootDir).filePath);
          sendJson(res, { questions: stripQuestionVoters(data.questions) }, req.method);
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid JSON\n");
          return;
        }

        const text = typeof payload?.text === "string" ? payload.text.trim() : "";
        if (!text) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Question text is required\n");
          return;
        }
        if (text.length > QUESTION_TEXT_LIMIT) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(`Question text must be under ${QUESTION_TEXT_LIMIT} characters\n`);
          return;
        }

        try {
          const question = await updateQuestions(rootDir, (data) => {
            const now = new Date().toISOString();
            const entry = {
              id: randomUUID(),
              text,
              votes: 0,
              voters: [],
              createdAt: now,
              updatedAt: now,
            };
            data.questions.push(entry);
            return entry;
          });
          sendJson(res, { ok: true, question: stripQuestionVoters([question])[0] }, req.method);
          return;
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Failed to store question\n");
          return;
        }
      }

      if (pathname === "/_/api/questions/vote") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }

        const token = getQuestionToken(req);
        if (!token) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing voting token\n");
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid JSON\n");
          return;
        }

        const id = typeof payload?.id === "string" ? payload.id : null;
        if (!id) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Question id is required\n");
          return;
        }

        try {
          const result = await updateQuestions(rootDir, (data) => {
            const entry = data.questions.find((item) => item.id === id);
            if (!entry) {
              return null;
            }
            if (!Array.isArray(entry.voters)) {
              entry.voters = [];
            }
            if (entry.voters.includes(token)) {
              return { entry, voted: false };
            }
            entry.voters.push(token);
            entry.votes = Math.max(0, Math.floor(Number(entry.votes ?? 0))) + 1;
            entry.updatedAt = new Date().toISOString();
            return { entry, voted: true };
          });

          if (!result) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Question not found\n");
            return;
          }

          sendJson(res, { ok: true, voted: result.voted, question: stripQuestionVoters([result.entry])[0] }, req.method);
          return;
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Failed to store vote\n");
          return;
        }
      }

      if (pathname === "/_/api/questions/delete") {
        if (!rootDir || normalizedRootUrl) {
          await sendQuestionsUnsupported(res);
          return;
        }

        if (!isLocalRequest(req)) {
          if (presenterKey) {
            const providedKey = requestUrl.searchParams.get("key");
            if (providedKey !== presenterKey) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Unauthorized\n");
              return;
            }
          } else {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Forbidden\n");
            return;
          }
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid JSON\n");
          return;
        }

        const id = typeof payload?.id === "string" ? payload.id : null;
        if (!id) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Question id is required\n");
          return;
        }

        try {
          const removed = await updateQuestions(rootDir, (data) => {
            const index = data.questions.findIndex((item) => item.id === id);
            if (index === -1) {
              return null;
            }
            const [entry] = data.questions.splice(index, 1);
            return entry;
          });

          if (!removed) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Question not found\n");
            return;
          }

          sendJson(res, { ok: true }, req.method);
          return;
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Failed to delete question\n");
          return;
        }
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

      if (pathname === "/_/api/export") {
        if (!isLocalRequest(req)) {
          if (presenterKey) {
            const providedKey = requestUrl.searchParams.get("key");
            if (providedKey !== presenterKey) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Unauthorized\n");
              return;
            }
          } else {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Forbidden\n");
            return;
          }
        }

        if (req.method === "HEAD") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/pdf");
          res.end();
          return;
        }

        const format = requestUrl.searchParams.get("format") || "pdf";
        if (format !== "pdf") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Unsupported export format\n");
          return;
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-presenter-export-"));
        const outputPath = path.join(tempDir, `presentation.${format}`);

        try {
          const { exportPresentation } = await import("./export.js");
          await exportPresentation({
            rootDir,
            rootUrl: normalizedRootUrl ? normalizedRootUrl.toString() : null,
            outputPath,
            format,
          });
          const data = await fs.readFile(outputPath);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename=\"presentation.${format}\"`);
          res.end(data);
          return;
        } catch (error) {
          console.error(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Failed to export slides\n");
          return;
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
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
    config: mergedConfig,
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
