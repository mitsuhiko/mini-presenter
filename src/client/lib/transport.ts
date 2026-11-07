// Transports carry protocol messages between displays and presenters.
//
// - WebSocket: server mode, relayed by the hub.
// - Local: standalone mode without a server. The display tab acts as the hub
//   and talks to presenter windows over BroadcastChannel (same origin) or a
//   MessagePort handshake via `window.opener` (cross origin).

import type { PresenterConfig } from "../../shared/config.ts";
import {
  isNavAction,
  isRecord,
  type ClientMessage,
  type Role,
  type ServerMessage,
  type SessionInfo,
  type SlideState,
} from "../../shared/protocol.ts";

export type ConnectionStatus = "connecting" | "open" | "closed" | "unauthorized";

export interface TransportHandlers {
  onMessage(message: ServerMessage): void;
  onStatus?(status: ConnectionStatus): void;
}

export interface Transport {
  start(): void;
  stop(): void;
  send(message: ClientMessage): boolean;
}

/** WebSocket transport with automatic reconnect and exponential backoff. */
export function createWebSocketTransport(
  url: string,
  role: Role,
  handlers: TransportHandlers,
  register: () => ClientMessage = () => ({ type: "register", role }),
): Transport {
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let attempts = 0;
  let stopped = true;

  const connect = () => {
    if (stopped) return;
    handlers.onStatus?.("connecting");
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => {
      attempts = 0;
      ws.send(JSON.stringify(register()));
      handlers.onStatus?.("open");
    });
    ws.addEventListener("message", (event) => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (isRecord(message) && typeof message.type === "string") {
          handlers.onMessage(message as ServerMessage);
        }
      } catch {
        // ignore malformed messages
      }
    });
    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      if (event.code === 4001) {
        handlers.onStatus?.("unauthorized");
        return;
      }
      handlers.onStatus?.("closed");
      scheduleReconnect();
    });
  };

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== null) return;
    const delay = Math.min(5000, 250 * 2 ** attempts);
    attempts += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  // Reconnect immediately when the tab comes back or the network returns.
  const wake = () => {
    if (!stopped && !socket) {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      attempts = 0;
      connect();
    }
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      window.addEventListener("online", wake);
      document.addEventListener("visibilitychange", wake);
      connect();
    },
    stop() {
      stopped = true;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      socket?.close();
      socket = null;
    },
    send(message) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
  };
}

export function webSocketUrl(path: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${path}`;
}

// --- Local transport -------------------------------------------------------

interface LocalPacket {
  __miniPresenterLocal: 1;
  sessionId: string;
  id: string;
  from: string;
  role: Role;
  to: string | null;
  payload: ClientMessage | ServerMessage;
}

const HANDSHAKE = "miniPresenterLocalHandshake";

export function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPacket(value: unknown, sessionId: string): value is LocalPacket {
  return (
    isRecord(value) &&
    value.__miniPresenterLocal === 1 &&
    value.sessionId === sessionId &&
    typeof value.id === "string" &&
    typeof value.from === "string" &&
    isRecord(value.payload)
  );
}

/** Shared plumbing: dedupes packets that arrive on more than one channel. */
function createLocalBus(sessionId: string, role: Role, onPacket: (packet: LocalPacket) => void) {
  const clientId = createId();
  const ports = new Set<MessagePort>();
  const seen = new Set<string>();
  let channel: BroadcastChannel | null = null;

  const receive = (data: unknown) => {
    if (!isPacket(data, sessionId) || data.from === clientId || seen.has(data.id)) return;
    if (data.to && data.to !== clientId) return;
    seen.add(data.id);
    if (seen.size > 1000) seen.delete(seen.values().next().value!);
    onPacket(data);
  };

  const addPort = (port: MessagePort) => {
    ports.add(port);
    port.addEventListener("message", (event) => receive(event.data));
    port.start();
  };

  return {
    clientId,
    addPort,
    open() {
      try {
        channel = new BroadcastChannel(`mini-presenter:${sessionId}`);
        channel.addEventListener("message", (event) => receive(event.data));
      } catch {
        channel = null;
      }
    },
    close() {
      channel?.close();
      channel = null;
      for (const port of ports) port.close();
      ports.clear();
    },
    post(payload: ClientMessage | ServerMessage, to: string | null = null) {
      const packet: LocalPacket = { __miniPresenterLocal: 1, sessionId, id: createId(), from: clientId, role, to, payload };
      channel?.postMessage(packet);
      for (const port of ports) {
        try {
          port.postMessage(packet);
        } catch {
          ports.delete(port);
        }
      }
    },
  };
}

export interface LocalDisplayOptions {
  sessionId: string;
  getConfig(): { config: PresenterConfig; session: SessionInfo };
  /** Messages from presenters, translated into what the server would send. */
  onMessage(message: ServerMessage): void;
}

/** The display side of the local transport. It plays the role of the hub. */
export function createLocalDisplayTransport(options: LocalDisplayOptions): Transport & { broadcastConfig(): void } {
  const presenters = new Set<string>();
  let lastState: SlideState | null = null;

  const bus = createLocalBus(options.sessionId, "display", (packet) => {
    const message = packet.payload as ClientMessage;
    switch (message.type) {
      case "register":
        if (message.role !== "presenter") return;
        presenters.add(packet.from);
        bus.post({ type: "config", ...options.getConfig() }, packet.from);
        if (lastState) bus.post({ type: "state", ...lastState, displays: 1 }, packet.from);
        bus.post({ type: "sync", displays: 1, presenters: presenters.size });
        return;
      case "command":
        if (message.action === "goto") {
          options.onMessage({ type: "goto", hash: message.hash });
        } else if (isNavAction(message.action)) {
          options.onMessage({ type: "navigate", action: message.action });
        }
        return;
      case "draw":
        options.onMessage(message);
        return;
      case "reload":
        options.onMessage({ type: "reload", preserveHash: true });
        return;
    }
  });

  const onWindowMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (isRecord(data) && data.type === HANDSHAKE && data.sessionId === options.sessionId && event.ports[0]) {
      bus.addPort(event.ports[0]);
    }
  };

  return {
    start() {
      bus.open();
      window.addEventListener("message", onWindowMessage);
      // Announce ourselves so presenters that opened first re-register.
      bus.post({ type: "sync", displays: 1, presenters: presenters.size });
    },
    stop() {
      window.removeEventListener("message", onWindowMessage);
      bus.close();
    },
    send(message) {
      if (message.type === "state") {
        const { type: _type, sessionId: _sessionId, ...state } = message;
        lastState = state;
        bus.post({ type: "state", ...state, displays: 1 });
      }
      return true;
    },
    broadcastConfig() {
      bus.post({ type: "config", ...options.getConfig() });
    },
  };
}

/** The presenter side of the local transport. */
export function createLocalPresenterTransport(sessionId: string, handlers: TransportHandlers): Transport {
  const bus = createLocalBus(sessionId, "presenter", (packet) => {
    const message = packet.payload as ServerMessage;
    // A display (re)appeared and does not know any presenter yet: register again.
    if (message.type === "sync" && packet.to === null && message.presenters === 0) {
      register();
    }
    handlers.onMessage(message);
  });

  const register = () => bus.post({ type: "register", role: "presenter" });

  return {
    start() {
      bus.open();
      if (window.opener) {
        try {
          const channel = new MessageChannel();
          bus.addPort(channel.port1);
          (window.opener as Window).postMessage({ type: HANDSHAKE, sessionId }, "*", [channel.port2]);
        } catch {
          // opener is gone or not reachable
        }
      }
      handlers.onStatus?.("open");
      register();
    },
    stop() {
      bus.close();
      handlers.onStatus?.("closed");
    },
    send(message) {
      bus.post(message);
      return true;
    },
  };
}
