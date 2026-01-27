import { WebSocket, WebSocketServer } from "ws";

class Hub {
  constructor(wss, config) {
    this.wss = wss;
    this.displays = new Set();
    this.presenters = new Set();
    this.currentState = null;
    this.config = config ?? null;

    this.wss.on("connection", (ws) => {
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
      this.registerClient(ws, message.role);
      return;
    }

    if (message.type === "state" && ws.role === "display") {
      this.currentState = { ...message };
      this.broadcast(this.presenters, {
        ...message,
        displays: this.displays.size,
      });
      return;
    }

    if (message.type === "command" && ws.role === "presenter") {
      this.handleCommand(message);
    }
  }

  registerClient(ws, role) {
    if (ws.role === "display") {
      this.displays.delete(ws);
    }
    if (ws.role === "presenter") {
      this.presenters.delete(ws);
    }

    if (role === "display") {
      ws.role = "display";
      this.displays.add(ws);
    } else if (role === "presenter") {
      ws.role = "presenter";
      this.presenters.add(ws);
      this.send(ws, { type: "config", config: this.config ?? {} });
      if (this.currentState) {
        this.send(ws, {
          ...this.currentState,
          displays: this.displays.size,
        });
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
    this.sendSync();
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

  broadcast(targets, message) {
    const payload = JSON.stringify(message);
    for (const ws of targets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export function createWebSocketHub(server, config) {
  const wss = new WebSocketServer({ noServer: true });
  const hub = new Hub(wss, config);

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
