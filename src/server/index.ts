import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig, sanitizeConfig, type PresenterConfig } from "../shared/config.ts";
import { notesFileCandidates } from "../shared/notes.ts";
import { isRecord, ROUTES, shareBaseUrl, type Capabilities, type SessionInfo } from "../shared/protocol.ts";
import { isSameOrigin, isSecureRequest, PresenterAuth } from "./auth.ts";
import { createLocalSource, createRemoteSource, resolveInside, serveFile, type DeckSource } from "./deck.ts";
import {
  escapeHtml,
  HttpError,
  parseCookies,
  readBody,
  readJsonObject,
  redirect,
  sendBody,
  sendJson,
  sendText,
  type RequestContext,
} from "./http.ts";
import { Hub } from "./hub.ts";
import { injectBase } from "./inject.ts";
import { QUESTION_TEXT_LIMIT, QuestionStore } from "./questions.ts";
import { renderQrSvg } from "./qr.ts";
import { watchDeck } from "./watch.ts";

const QUESTION_COOKIE = "miniPresenterQuestionToken";
const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;

/** Built browser assets: `dist/client` next to the bundled CLI, or relative to the sources. */
function findClientDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, "client"), path.resolve(here, "../../dist/client")];
  const found = candidates.find((candidate) => existsSync(path.join(candidate, "presenter.html")));
  if (!found) {
    throw new Error("Client assets not found. Run `npm run build` first.");
  }
  return found;
}

/** Non-internal IPv4 addresses of this machine. */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);
}

export interface ServerOptions {
  rootDir?: string | null;
  rootUrl?: string | null;
  port: number;
  host?: string;
  watch?: boolean;
  presenterPin?: string | null;
  externalUrl?: string | null;
}

export interface PresenterServer {
  readonly server: http.Server;
  readonly port: number;
  readonly source: DeckSource;
  setExternalUrl(url: string | null): void;
  close(): Promise<void>;
}

interface Route {
  [method: string]: (ctx: RequestContext) => Promise<void> | void;
}

export async function startServer(options: ServerOptions): Promise<PresenterServer> {
  const source: DeckSource = options.rootUrl
    ? createRemoteSource(options.rootUrl)
    : options.rootDir
      ? createLocalSource(options.rootDir)
      : (() => {
          throw new Error("No presentation source provided");
        })();
  const isLocalDeck = source.kind === "local" && source.rootDir !== null;
  const clientDir = findClientDir();
  const auth = new PresenterAuth(options.presenterPin ?? null);
  const questions = isLocalDeck ? new QuestionStore(source.rootDir!) : null;

  const capabilities: Capabilities = {
    questions: isLocalDeck,
    export: true,
    recording: isLocalDeck,
    configSave: isLocalDeck,
    notesFiles: true,
  };
  const session: SessionInfo = {
    sessionId: randomUUID(),
    mode: "server",
    capabilities,
    externalUrl: options.externalUrl ?? null,
    lanUrl: null,
  };

  async function loadConfig(): Promise<PresenterConfig> {
    const text = await source.readText("presenter.json");
    if (!text) {
      return {};
    }
    try {
      return sanitizeConfig(parseConfig(JSON.parse(text)));
    } catch {
      console.warn("Ignoring invalid presenter.json");
      return {};
    }
  }

  let config = await loadConfig();
  const hub = new Hub(config, session);
  let exportRunning = false;

  // --- helpers -------------------------------------------------------------

  function requirePresenter(ctx: RequestContext): void {
    if (!auth.isAuthorized(ctx.req)) {
      throw new HttpError(401, "Unauthorized");
    }
  }

  function requireLocalDeck(): string {
    if (!isLocalDeck || !source.rootDir) {
      throw new HttpError(501, "Only available for local decks");
    }
    return source.rootDir;
  }

  function requireQuestions(): QuestionStore {
    if (!questions) {
      throw new HttpError(501, "Questions are not available for remote decks");
    }
    return questions;
  }

  async function sendPage(ctx: RequestContext, name: string, replacements: Record<string, string> = {}, status = 200) {
    let html = await fs.readFile(path.join(clientDir, name), "utf8");
    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    sendBody(ctx, injectBase(html, ROUTES.client), "text/html; charset=utf-8", { status, cache: "no-store" });
  }

  function formatWait(ms: number): string {
    const seconds = Math.max(1, Math.ceil(ms / 1000));
    if (seconds < 60) {
      return `${seconds} second${seconds === 1 ? "" : "s"}`;
    }
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  async function sendAuthPage(ctx: RequestContext, status: number, message: string, detail: string, level: string, disabled = false) {
    if (disabled) {
      ctx.res.setHeader("Retry-After", "300");
    }
    await sendPage(
      ctx,
      "auth.html",
      {
        LEVEL: level,
        MESSAGE: escapeHtml(message),
        DETAIL: escapeHtml(detail),
        DISABLED: disabled ? "disabled" : "",
      },
      status,
    );
  }

  async function handlePresenterLogin(ctx: RequestContext, pin: string) {
    const result = auth.login(ctx.req, pin);
    if (result.ok) {
      ctx.res.setHeader("Set-Cookie", result.cookie);
      redirect(ctx, ROUTES.presenter);
      return;
    }
    if (result.reason === "blocked") {
      await sendAuthPage(ctx, 429, "Too many attempts.", `Try again in ${formatWait(result.retryAfterMs)}.`, "warn", true);
    } else if (result.reason === "disabled") {
      await sendAuthPage(ctx, 403, "Presenter login is disabled.", "Open the presenter view on the presenting machine.", "error", true);
    } else {
      await sendAuthPage(ctx, 401, "Invalid presenter PIN.", `Attempts remaining: ${result.remaining}.`, "error");
    }
  }

  function questionToken(ctx: RequestContext, { create = false } = {}): string | null {
    const token = parseCookies(ctx.req.headers.cookie)[QUESTION_COOKIE];
    if (token && /^[\w-]{8,64}$/u.test(token)) {
      return token;
    }
    if (!create) {
      return null;
    }
    const fresh = randomUUID();
    const secure = isSecureRequest(ctx.req) ? "; Secure" : "";
    ctx.res.setHeader("Set-Cookie", `${QUESTION_COOKIE}=${fresh}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`);
    return fresh;
  }

  function questionId(payload: Record<string, unknown>): string {
    if (typeof payload.id !== "string" || !payload.id) {
      throw new HttpError(400, "Question id is required");
    }
    return payload.id;
  }

  function publicBaseUrl(ctx: RequestContext): string {
    const origin = `${isSecureRequest(ctx.req) ? "https" : "http"}://${ctx.req.headers.host ?? "localhost"}`;
    try {
      return shareBaseUrl(session, origin);
    } catch {
      return shareBaseUrl(session, "http://localhost");
    }
  }

  // --- routes ------------------------------------------------------------

  const routes: Record<string, Route> = {
    [ROUTES.presenter]: {
      async GET(ctx) {
        const pin = ctx.url.searchParams.get("key");
        if (pin !== null && !auth.isAuthorized(ctx.req)) {
          await handlePresenterLogin(ctx, pin);
          return;
        }
        if (pin !== null) {
          redirect(ctx, ROUTES.presenter);
          return;
        }
        if (!auth.isAuthorized(ctx.req)) {
          const blocked = auth.blockedFor(ctx.req);
          if (blocked > 0) {
            await sendAuthPage(ctx, 429, "Too many attempts.", `Try again in ${formatWait(blocked)}.`, "warn", true);
          } else {
            await sendAuthPage(ctx, 401, "Presenter PIN required.", "Enter the PIN shown in the terminal.", "info");
          }
          return;
        }
        await sendPage(ctx, "presenter.html");
      },
      async POST(ctx) {
        const body = (await readBody(ctx.req, 4096)).toString("utf8");
        await handlePresenterLogin(ctx, new URLSearchParams(body).get("key") ?? "");
      },
    },

    [ROUTES.questions]: {
      async GET(ctx) {
        requireQuestions();
        questionToken(ctx, { create: true });
        await sendPage(ctx, "questions.html");
      },
    },

    [ROUTES.questionsQr]: {
      async GET(ctx) {
        requireQuestions();
        await sendPage(ctx, "qr.html");
      },
    },

    [ROUTES.api.session]: {
      GET(ctx) {
        sendJson(ctx, session);
      },
    },

    [ROUTES.api.config]: {
      GET(ctx) {
        // `sessionId` is kept for older deck integrations reading this endpoint.
        sendJson(ctx, { ...config, sessionId: session.sessionId });
      },
      async PUT(ctx) {
        requirePresenter(ctx);
        const rootDir = requireLocalDeck();
        const next = sanitizeConfig(parseConfig(await readJsonObject(ctx)));
        const filePath = path.join(rootDir, "presenter.json");
        const tempPath = `${filePath}.${randomUUID()}.tmp`;
        await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`);
        await fs.rename(tempPath, filePath);
        config = next;
        hub.updateConfig(config);
        sendJson(ctx, { saved: true, config });
      },
    },

    [ROUTES.api.notes]: {
      async GET(ctx) {
        for (const candidate of notesFileCandidates(ctx.url.searchParams.get("hash"))) {
          const notes = await source.readText(`notes/${candidate}.md`);
          if (notes !== null) {
            sendJson(ctx, { notes });
            return;
          }
        }
        sendJson(ctx, { notes: null });
      },
    },

    [ROUTES.api.recording]: {
      async GET(ctx) {
        requirePresenter(ctx);
        const rootDir = requireLocalDeck();
        let recording: unknown;
        try {
          recording = JSON.parse(await fs.readFile(path.join(rootDir, "recording.json"), "utf8"));
        } catch {
          recording = null;
        }
        if (!isRecord(recording)) {
          sendJson(ctx, { available: false });
          return;
        }
        const hasAudio = existsSync(path.join(rootDir, "recording.webm"));
        sendJson(ctx, {
          available: true,
          recording: { ...recording, audioUrl: hasAudio ? ROUTES.api.recordingAudio : null },
        });
      },
      async PUT(ctx) {
        requirePresenter(ctx);
        const rootDir = requireLocalDeck();
        const payload = await readJsonObject(ctx, 64 * 1024 * 1024);
        if (!Array.isArray(payload.events)) {
          throw new HttpError(400, "Recording events are required");
        }
        const durationMs = Number(payload.durationMs);
        const recording = {
          version: 1,
          createdAt: new Date().toISOString(),
          durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : 0,
          audioMimeType: typeof payload.audioMimeType === "string" ? payload.audioMimeType : "audio/webm",
          events: payload.events.filter(isRecord),
        };
        await fs.writeFile(path.join(rootDir, "recording.json"), `${JSON.stringify(recording, null, 2)}\n`);
        sendJson(ctx, { saved: true, recording });
      },
    },

    [ROUTES.api.recordingAudio]: {
      async GET(ctx) {
        requirePresenter(ctx);
        const rootDir = requireLocalDeck();
        try {
          await serveFile(ctx, path.join(rootDir, "recording.webm"), { inject: false });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new HttpError(404, "Recording audio not found");
          }
          throw error;
        }
      },
      async PUT(ctx) {
        requirePresenter(ctx);
        const rootDir = requireLocalDeck();
        const data = await readBody(ctx.req, MAX_AUDIO_BYTES);
        if (data.length === 0) {
          throw new HttpError(400, "Recording audio is required");
        }
        await fs.writeFile(path.join(rootDir, "recording.webm"), data);
        sendJson(ctx, { saved: true });
      },
    },

    [ROUTES.api.questions]: {
      async GET(ctx) {
        sendJson(ctx, { questions: await requireQuestions().list(questionToken(ctx)) });
      },
      async POST(ctx) {
        const store = requireQuestions();
        const payload = await readJsonObject(ctx, 16 * 1024);
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        if (!text) {
          throw new HttpError(400, "Question text is required");
        }
        if (text.length > QUESTION_TEXT_LIMIT) {
          throw new HttpError(400, `Questions must be at most ${QUESTION_TEXT_LIMIT} characters`);
        }
        const { result, questions: all } = await store.add(text);
        hub.updateQuestions(all);
        sendJson(ctx, { ok: true, question: result });
      },
    },

    [ROUTES.api.questionsVote]: {
      async POST(ctx) {
        const store = requireQuestions();
        const token = questionToken(ctx);
        if (!token) {
          throw new HttpError(400, "Missing voting token");
        }
        const { result, questions: all } = await store.vote(questionId(await readJsonObject(ctx)), token);
        if (!result) {
          throw new HttpError(404, "Question not found");
        }
        if (result.voted) {
          hub.updateQuestions(all);
        }
        sendJson(ctx, { ok: true, ...result });
      },
    },

    [ROUTES.api.questionsAnswer]: {
      async POST(ctx) {
        requirePresenter(ctx);
        const payload = await readJsonObject(ctx);
        const { result, questions: all } = await requireQuestions().setAnswered(
          questionId(payload),
          payload.answered === true,
        );
        if (!result) {
          throw new HttpError(404, "Question not found");
        }
        hub.updateQuestions(all);
        sendJson(ctx, { ok: true, question: result });
      },
    },

    [ROUTES.api.questionsDelete]: {
      async POST(ctx) {
        requirePresenter(ctx);
        const { result, questions: all } = await requireQuestions().remove(questionId(await readJsonObject(ctx)));
        if (!result) {
          throw new HttpError(404, "Question not found");
        }
        hub.updateQuestions(all);
        sendJson(ctx, { ok: true });
      },
    },

    [ROUTES.api.questionsQr]: {
      GET(ctx) {
        requireQuestions();
        const url = new URL(ROUTES.questions, publicBaseUrl(ctx)).toString();
        sendBody(ctx, renderQrSvg(url), "image/svg+xml", { cache: "no-store" });
      },
    },

    [ROUTES.api.export]: {
      async GET(ctx) {
        requirePresenter(ctx);
        if ((ctx.url.searchParams.get("format") ?? "pdf") !== "pdf") {
          throw new HttpError(400, "Unsupported export format");
        }
        if (exportRunning) {
          throw new HttpError(409, "An export is already running");
        }
        exportRunning = true;
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-presenter-export-"));
        try {
          const outputPath = path.join(tempDir, "presentation.pdf");
          const { exportPresentation } = await import("../export/export.ts");
          await exportPresentation({
            rootDir: source.rootDir,
            rootUrl: source.kind === "remote" ? source.label : null,
            outputPath,
            format: "pdf",
          });
          ctx.res.setHeader("Content-Disposition", 'attachment; filename="presentation.pdf"');
          sendBody(ctx, await fs.readFile(outputPath), "application/pdf", { cache: "no-store" });
        } catch (error) {
          console.error("Export failed:", error);
          throw new HttpError(500, `Export failed: ${(error as Error).message}`);
        } finally {
          exportRunning = false;
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      },
    },
  };

  async function handleClientAsset(ctx: RequestContext) {
    const filePath = resolveInside(clientDir, ctx.pathname.slice(ROUTES.client.length));
    if (!filePath || filePath.endsWith(".html")) {
      throw new HttpError(404, "Not found");
    }
    try {
      await serveFile(ctx, filePath, { inject: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new HttpError(404, "Not found");
      }
      throw error;
    }
  }

  async function handle(ctx: RequestContext): Promise<void> {
    const { method, pathname } = ctx;
    const isWrite = method !== "GET" && method !== "HEAD";
    if (isWrite && !isSameOrigin(ctx.req)) {
      throw new HttpError(403, "Cross-origin request rejected");
    }

    const routePath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const route = routes[routePath];
    if (route) {
      const handler = route[method] ?? (method === "HEAD" ? route.GET : undefined);
      if (!handler) {
        ctx.res.setHeader("Allow", Object.keys(route).join(", "));
        throw new HttpError(405, "Method not allowed");
      }
      await handler(ctx);
      return;
    }

    if (isWrite) {
      throw new HttpError(405, "Method not allowed");
    }
    if (pathname.startsWith(ROUTES.client)) {
      await handleClientAsset(ctx);
      return;
    }
    if (pathname.startsWith("/_/")) {
      throw new HttpError(404, "Not found");
    }
    await source.serve(ctx);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.statusCode = 400;
      res.end("Bad request\n");
      return;
    }
    const ctx: RequestContext = { req, res, url, pathname, method: req.method ?? "GET" };
    handle(ctx).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendText(ctx, error.status, error.message);
        return;
      }
      console.error(error);
      sendText(ctx, 500, "Internal server error");
    });
  });

  hub.attach(server, auth);

  const watcher =
    options.watch && source.rootDir
      ? watchDeck(source.rootDir, (kinds) => {
          if (kinds.has("config")) {
            void loadConfig().then((next) => {
              config = next;
              hub.updateConfig(config);
            });
          }
          if (kinds.has("notes")) {
            hub.notifyNotesChanged();
          }
          if (kinds.has("deck")) {
            hub.reloadDisplays(true);
          }
        })
      : null;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const host = options.host ?? "127.0.0.1";
  if (host === "0.0.0.0" || host === "::") {
    const lan = lanAddresses()[0];
    session.lanUrl = lan ? `http://${lan}:${port}` : null;
  }

  return {
    server,
    port,
    source,
    setExternalUrl(url) {
      session.externalUrl = url?.trim() || null;
      hub.updateConfig(config, session);
    },
    close() {
      watcher?.close();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
