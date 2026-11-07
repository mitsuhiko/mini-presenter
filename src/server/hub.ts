// WebSocket hub relaying state between displays and presenters.

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { PresenterConfig } from "../shared/config.ts";
import {
  isNavAction,
  isRecord,
  ROUTES,
  type ClientMessage,
  type Question,
  type Role,
  type ServerMessage,
  type SessionInfo,
  type SlideState,
} from "../shared/protocol.ts";
import { isSameOrigin, type PresenterAuth } from "./auth.ts";

interface Client {
  socket: WebSocket;
  authorized: boolean;
  role: Role | null;
}

const MAX_MESSAGE_BYTES = 1024 * 1024;

export class Hub {
  private readonly clients = new Map<WebSocket, Client>();
  private state: SlideState | null = null;
  private config: PresenterConfig;
  private session: SessionInfo;
  private questions: Question[] | null = null;

  constructor(config: PresenterConfig, session: SessionInfo) {
    this.config = config;
    this.session = session;
  }

  attach(server: Server, auth: PresenterAuth): void {
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname !== ROUTES.ws || !isSameOrigin(req)) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, auth.isAuthorized(req)));
    });
    server.on("close", () => {
      for (const client of this.clients.keys()) {
        client.terminate();
      }
      wss.close();
    });
  }

  private accept(socket: WebSocket, authorized: boolean): void {
    const client: Client = { socket, authorized, role: null };
    this.clients.set(socket, client);
    socket.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (isRecord(message)) {
        this.handle(client, message as ClientMessage);
      }
    });
    socket.on("close", () => {
      this.clients.delete(socket);
      if (client.role === "display" || client.role === "presenter") {
        this.sendSync();
      }
    });
    socket.on("error", () => socket.terminate());
  }

  private handle(client: Client, message: ClientMessage): void {
    switch (message.type) {
      case "register":
        this.register(client, message.role, message.sessionId);
        return;
      case "state":
        if (client.role === "display") {
          this.handleState(client, message);
        }
        return;
      case "command":
        if (client.role !== "presenter") {
          return;
        }
        if (message.action === "goto") {
          if (typeof message.hash === "string") {
            this.broadcast("display", { type: "goto", hash: message.hash });
          }
        } else if (isNavAction(message.action)) {
          this.broadcast("display", { type: "navigate", action: message.action });
        }
        return;
      case "draw":
        if (client.role === "presenter") {
          this.broadcast("display", message);
        }
        return;
      case "reload":
        if (client.role === "presenter") {
          this.reloadDisplays(true);
        }
        return;
    }
  }

  private register(client: Client, role: Role, sessionId: string | undefined): void {
    if (role === "presenter" && !client.authorized) {
      client.socket.close(4001, "Unauthorized");
      return;
    }
    if (role !== "display" && role !== "presenter" && role !== "questions") {
      return;
    }
    client.role = role;
    if (role === "display" && sessionId && sessionId !== this.session.sessionId) {
      // The display was loaded from a previous server run: refresh its script.
      this.send(client, { type: "reload", preserveHash: true });
      return;
    }
    if (role !== "questions") {
      this.send(client, { type: "config", config: this.config, session: this.session });
    }
    if (role === "presenter" && this.state) {
      this.send(client, { type: "state", ...this.state, displays: this.count("display") });
    }
    if (role !== "display" && this.questions) {
      this.send(client, { type: "questions", questions: this.questions });
    }
    if (role !== "questions") {
      this.sendSync();
    }
  }

  private handleState(client: Client, message: SlideState & { sessionId?: string }): void {
    if (message.sessionId && message.sessionId !== this.session.sessionId) {
      this.send(client, { type: "reload", preserveHash: true });
      return;
    }
    if (typeof message.slideId !== "string" || typeof message.hash !== "string") {
      return;
    }
    const state: SlideState = { slideId: message.slideId, hash: message.hash };
    if (message.notes === null || typeof message.notes === "string") state.notes = message.notes;
    if (isRecord(message.viewport)) state.viewport = message.viewport;
    if (Array.isArray(message.slideOrder)) {
      state.slideOrder = message.slideOrder.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof message.title === "string") state.title = message.title;
    this.state = state;
    this.broadcast("presenter", { type: "state", ...state, displays: this.count("display") });
  }

  private count(role: Role): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.role === role) count += 1;
    }
    return count;
  }

  private send(client: Client, message: ServerMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  private broadcast(roles: Role | Role[], message: ServerMessage): void {
    const targets = Array.isArray(roles) ? roles : [roles];
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.role && targets.includes(client.role) && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  private sendSync(): void {
    this.broadcast(["display", "presenter"], {
      type: "sync",
      displays: this.count("display"),
      presenters: this.count("presenter"),
    });
  }

  updateConfig(config: PresenterConfig, session: SessionInfo = this.session): void {
    this.config = config;
    this.session = session;
    this.broadcast(["display", "presenter"], { type: "config", config, session });
  }

  updateQuestions(questions: Question[]): void {
    this.questions = questions;
    this.broadcast(["presenter", "questions"], { type: "questions", questions });
  }

  reloadDisplays(preserveHash: boolean): void {
    this.broadcast("display", { type: "reload", preserveHash });
  }

  notifyNotesChanged(): void {
    this.broadcast("presenter", { type: "notesChanged" });
  }
}
