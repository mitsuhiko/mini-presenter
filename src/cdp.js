import WebSocket from "ws";

export async function connectToChrome({ port = 9222, timeout = 5000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(`http://localhost:${port}/json/version`, {
      signal: controller.signal,
    });
    const { webSocketDebuggerUrl } = await resp.json();
    clearTimeout(timeoutId);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error("Chrome WebSocket connect timeout"));
      }, timeout);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        resolve(new CDP(ws));
      });
      ws.on("error", (error) => {
        clearTimeout(connectTimeout);
        reject(error);
      });
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(
        "Connection timeout - is Chrome running with --remote-debugging-port?"
      );
    }
    throw error;
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.callbacks = new Map();
    this.sessions = new Map();
    this.eventHandlers = new Map();

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
        return;
      }

      if (msg.method) {
        this.emit(msg.method, msg.params || {}, msg.sessionId || null);
      }
    });
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, new Set());
    }
    this.eventHandlers.get(method).add(handler);
    return () => this.off(method, handler);
  }

  off(method, handler) {
    const handlers = this.eventHandlers.get(method);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.eventHandlers.delete(method);
    }
  }

  emit(method, params, sessionId) {
    const handlers = this.eventHandlers.get(method);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        handler(params, sessionId);
      } catch {
        // Ignore handler errors to keep CDP session alive.
      }
    }
  }

  send(method, params = {}, sessionId = null, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const msgId = ++this.id;
      const msg = { id: msgId, method, params };
      if (sessionId) msg.sessionId = sessionId;

      const timeoutId = setTimeout(() => {
        this.callbacks.delete(msgId);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);

      this.callbacks.set(msgId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify(msg));
    });
  }

  waitForEvent(method, sessionId = null, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`CDP timeout waiting for ${method}`));
      }, timeout);

      const handler = (params, eventSessionId) => {
        if (sessionId && eventSessionId !== sessionId) {
          return;
        }
        cleanup();
        resolve(params);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off(method, handler);
      };

      this.on(method, handler);
    });
  }

  close() {
    this.ws.close();
  }
}
