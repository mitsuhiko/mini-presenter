import { WebSocket, WebSocketServer } from "ws";
import { isLocalRequest } from "./request.js";

class Hub {
  constructor(wss, { config, presenterKey } = {}) {
    this.wss = wss;
    this.displays = new Set();
    this.presenters = new Set();
    this.questionListeners = new Set();
    this.currentState = null;
    this.config = config ?? null;
    this.sessionId = config?.sessionId ?? null;
    this.presenterKey = presenterKey ?? null;
    this.questions = null;

    this.wss.on("connection", (ws, req) => {
      ws.isLocal = isLocalRequest(req);
      ws.on("message", (data) => {
        this.handleMessage(ws, data);
      });
      ws.on("close", () => {
        this.handleClose(ws);
      });
    });
  }

  handleMessage(ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (message.type === "register") {
      this.registerClient(ws, message.role, message.key);
      return;
    }

    if (message.type === "state" && ws.role === "display") {
      if (this.sessionId && message.sessionId && message.sessionId !== this.sessionId) {
        this.broadcastReload({ preserveHash: false });
        return;
      }
      this.currentState = { ...message };
      this.broadcast(this.presenters, {
        ...message,
        displays: this.displays.size,
      });
      return;
    }

    if (message.type === "command" && ws.role === "presenter") {
      this.handleCommand(message);
      return;
    }

    if (message.type === "draw" && ws.role === "presenter") {
      this.broadcast(this.displays, message);
      return;
    }

    if (message.type === "reload" && ws.role === "presenter") {
      this.broadcastReload({ preserveHash: false });
    }
  }

  registerClient(ws, role, key) {
    if (ws.role === "display") {
      this.displays.delete(ws);
    }
    if (ws.role === "presenter") {
      this.presenters.delete(ws);
    }
    if (ws.role === "questions") {
      this.questionListeners.delete(ws);
    }

    if (role === "display") {
      ws.role = "display";
      this.displays.add(ws);
      this.send(ws, { type: "config", config: this.config ?? {} });
    } else if (role === "presenter") {
      if (this.presenterKey && !ws.isLocal && key !== this.presenterKey) {
        ws.close(4001, "Unauthorized");
        return;
      }
      ws.role = "presenter";
      this.presenters.add(ws);
      this.send(ws, { type: "config", config: this.config ?? {} });
      if (this.currentState) {
        this.send(ws, {
          ...this.currentState,
          displays: this.displays.size,
        });
      }
      if (this.questions) {
        this.send(ws, { type: "questions", questions: this.questions });
      }
    } else if (role === "questions") {
      ws.role = "questions";
      this.questionListeners.add(ws);
      if (this.questions) {
        this.send(ws, { type: "questions", questions: this.questions });
      }
    }

    this.sendSync();
  }

  handleCommand(message) {
    const { action, hash } = message;
    if (action === "goto" && hash) {
      this.broadcast(this.displays, { type: "goto", hash });
      return;
    }

    if (["next", "prev", "first", "last"].includes(action)) {
      this.broadcast(this.displays, { type: "navigate", action });
    }
  }

  handleClose(ws) {
    if (ws.role === "display") {
      this.displays.delete(ws);
    }
    if (ws.role === "presenter") {
      this.presenters.delete(ws);
    }
    if (ws.role === "questions") {
      this.questionListeners.delete(ws);
    }
    this.sendSync();
  }

  updateConfig(config) {
    this.config = config ?? {};
    if (typeof config?.sessionId === "string") {
      this.sessionId = config.sessionId;
    }
    this.broadcast(new Set([...this.presenters, ...this.displays]), {
      type: "config",
      config: this.config ?? {},
    });
  }

  sendSync() {
    const message = {
      type: "sync",
      displays: this.displays.size,
      presenters: this.presenters.size,
    };
    this.broadcast(new Set([...this.displays, ...this.presenters]), message);
  }

  send(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(message));
  }

  broadcastReload({ preserveHash = true } = {}) {
    this.broadcast(this.displays, { type: "reload", preserveHash });
  }

  broadcastQuestions(questions) {
    this.questions = questions ?? [];
    this.broadcast(new Set([...this.presenters, ...this.questionListeners]), {
      type: "questions",
      questions: this.questions,
    });
  }

  broadcast(targets, message) {
    const payload = JSON.stringify(message);
    for (const ws of targets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export function createWebSocketHub(server, options) {
  const wss = new WebSocketServer({ noServer: true });
  const hub = new Hub(wss, options);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname !== "/_/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return hub;
}
