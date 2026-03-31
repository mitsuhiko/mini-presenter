(function initMiniPresenterTransport(globalScope) {
  const root = globalScope || (typeof window !== "undefined" ? window : globalThis);
  const namespace = root.miniPresenterTransports || (root.miniPresenterTransports = {});

  /**
   * mini-presenter wire protocol (current WebSocket contract)
   *
   * Roles:
   * - display
   * - presenter
   * - questions
   *
   * Core message types:
   * - register { role, key? }
   * - state { slideId, hash, notes?, viewport?, sessionId? }
   * - command { action: next|prev|first|last|goto, hash? }
   * - draw { action, ...payload }
   * - sync { displays, presenters }
   * - config { config }
   * - questions { questions }
   * - reload { preserveHash? }
   */

  function safeInvoke(callback, ...args) {
    if (typeof callback !== "function") {
      return;
    }
    callback(...args);
  }

  function createWebSocketTransport({
    url,
    onOpen = null,
    onMessage = null,
    onClose = null,
    onError = null,
  } = {}) {
    if (!url || typeof url !== "string") {
      throw new Error("WebSocket transport requires a URL");
    }

    let socket = null;

    const handlers = {
      open: onOpen,
      message: onMessage,
      close: onClose,
      error: onError,
    };

    function bindSocket(nextSocket) {
      nextSocket.addEventListener("open", (event) => {
        if (socket !== nextSocket) {
          return;
        }
        safeInvoke(handlers.open, event);
      });

      nextSocket.addEventListener("message", (event) => {
        if (socket !== nextSocket) {
          return;
        }
        safeInvoke(handlers.message, event);
      });

      nextSocket.addEventListener("close", (event) => {
        if (socket === nextSocket) {
          socket = null;
        }
        safeInvoke(handlers.close, event);
      });

      nextSocket.addEventListener("error", (event) => {
        if (socket !== nextSocket) {
          return;
        }
        safeInvoke(handlers.error, event);
      });
    }

    return {
      connect() {
        if (socket) {
          const previousSocket = socket;
          socket = null;
          try {
            previousSocket.close();
          } catch (error) {
            // ignore close failures
          }
        }

        const nextSocket = new WebSocket(url);
        socket = nextSocket;
        bindSocket(nextSocket);
        return nextSocket;
      },

      close() {
        if (!socket) {
          return;
        }
        const activeSocket = socket;
        socket = null;
        try {
          activeSocket.close();
        } catch (error) {
          // ignore close failures
        }
      },

      send(message) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return false;
        }
        socket.send(JSON.stringify(message));
        return true;
      },

      isOpen() {
        return Boolean(socket && socket.readyState === WebSocket.OPEN);
      },

      setHandlers(nextHandlers = {}) {
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onOpen")) {
          handlers.open = nextHandlers.onOpen;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onMessage")) {
          handlers.message = nextHandlers.onMessage;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onClose")) {
          handlers.close = nextHandlers.onClose;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onError")) {
          handlers.error = nextHandlers.onError;
        }
      },
    };
  }

  function createLocalId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createMessageEvent(payload) {
    return {
      data: JSON.stringify(payload),
    };
  }

  function isLocalPacket(value) {
    return (
      Boolean(value) &&
      typeof value === "object" &&
      value.__miniPresenterLocal === true &&
      typeof value.sessionId === "string" &&
      typeof value.id === "string" &&
      typeof value.clientId === "string"
    );
  }

  function createLocalTransport({
    role = "display",
    sessionId,
    getConfig = null,
    onOpen = null,
    onMessage = null,
    onClose = null,
    onError = null,
    useBroadcastChannel = true,
  } = {}) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Local transport requires a sessionId");
    }

    const normalizedRole =
      role === "presenter" || role === "questions" ? role : "display";
    const clientId = createLocalId();
    const channelName = `mini-presenter:${sessionId}`;

    let channel = null;
    let connected = false;
    let windowListener = null;

    let lastState = null;
    const presenterClients = new Set();

    const messagePorts = new Set();
    const seenMessageIds = [];
    const seenMessageSet = new Set();
    const MAX_SEEN_IDS = 512;

    const handlers = {
      open: onOpen,
      message: onMessage,
      close: onClose,
      error: onError,
    };

    function rememberMessageId(id) {
      if (!id || seenMessageSet.has(id)) {
        return;
      }
      seenMessageSet.add(id);
      seenMessageIds.push(id);
      if (seenMessageIds.length > MAX_SEEN_IDS) {
        const removed = seenMessageIds.shift();
        if (removed) {
          seenMessageSet.delete(removed);
        }
      }
    }

    function hasSeenMessage(id) {
      return Boolean(id && seenMessageSet.has(id));
    }

    function emitMessage(payload) {
      safeInvoke(handlers.message, createMessageEvent(payload));
    }

    function sendPacket(payload, { targetClientId = null } = {}) {
      const packet = {
        __miniPresenterLocal: true,
        sessionId,
        id: createLocalId(),
        clientId,
        role: normalizedRole,
        targetClientId,
        payload,
      };

      rememberMessageId(packet.id);

      if (channel) {
        channel.postMessage(packet);
      }

      for (const port of messagePorts) {
        try {
          port.postMessage(packet);
        } catch (error) {
          // ignore stale ports
        }
      }
    }

    function sendConfigSnapshot(targetClientId) {
      const config = typeof getConfig === "function" ? getConfig() : null;
      if (!config || typeof config !== "object") {
        return;
      }
      sendPacket(
        {
          type: "config",
          config,
        },
        { targetClientId }
      );
    }

    function sendSyncSnapshot(targetClientId) {
      sendPacket(
        {
          type: "sync",
          displays: 1,
          presenters: presenterClients.size,
        },
        { targetClientId }
      );
    }

    function sendStateSnapshot(targetClientId) {
      if (!lastState) {
        return;
      }
      sendPacket({ ...lastState, displays: 1 }, { targetClientId });
    }

    function handleIncomingForDisplay(packet) {
      const payload = packet.payload;
      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "register" && payload.role === "presenter") {
        presenterClients.add(packet.clientId);
        sendConfigSnapshot(packet.clientId);
        sendSyncSnapshot(packet.clientId);
        sendStateSnapshot(packet.clientId);
        sendSyncSnapshot(null);
        return;
      }

      if (payload.type === "command") {
        if (payload.action === "goto" && typeof payload.hash === "string") {
          emitMessage({ type: "goto", hash: payload.hash });
          return;
        }
        if (["next", "prev", "first", "last"].includes(payload.action)) {
          emitMessage({ type: "navigate", action: payload.action });
        }
        return;
      }

      if (payload.type === "draw" || payload.type === "reload") {
        emitMessage(payload);
      }
    }

    function handleIncomingForPeer(packet) {
      const payload = packet.payload;
      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "state") {
        const statePayload =
          typeof payload.displays === "number" ? payload : { ...payload, displays: 1 };
        emitMessage(statePayload);
        return;
      }

      if (
        payload.type === "config" ||
        payload.type === "sync" ||
        payload.type === "questions" ||
        payload.type === "reload"
      ) {
        emitMessage(payload);
      }
    }

    function handlePacket(packet) {
      if (!isLocalPacket(packet)) {
        return;
      }
      if (packet.sessionId !== sessionId) {
        return;
      }
      if (packet.clientId === clientId) {
        return;
      }
      if (packet.targetClientId && packet.targetClientId !== clientId) {
        return;
      }
      if (hasSeenMessage(packet.id)) {
        return;
      }

      rememberMessageId(packet.id);

      if (normalizedRole === "display") {
        handleIncomingForDisplay(packet);
      } else {
        handleIncomingForPeer(packet);
      }
    }

    function attachMessagePort(port) {
      if (!port || messagePorts.has(port)) {
        return;
      }
      messagePorts.add(port);
      const handlePortMessage = (event) => {
        const payload = event?.data;
        if (payload?.type === "miniPresenterLocalAck") {
          return;
        }
        handlePacket(payload);
      };

      if (typeof port.addEventListener === "function") {
        port.addEventListener("message", handlePortMessage);
        port.start?.();
      } else {
        port.onmessage = handlePortMessage;
      }
    }

    function setupWindowHandshake() {
      if (!root || typeof root.addEventListener !== "function") {
        return;
      }

      if (normalizedRole === "display") {
        windowListener = (event) => {
          const payload = event?.data;
          if (!payload || payload.type !== "miniPresenterLocalHandshake") {
            return;
          }
          if (payload.sessionId !== sessionId) {
            return;
          }
          const port = event.ports?.[0];
          if (!port) {
            return;
          }
          attachMessagePort(port);
          try {
            port.postMessage({
              type: "miniPresenterLocalAck",
              sessionId,
            });
          } catch (error) {
            // ignore handshake ack failures
          }
        };
        root.addEventListener("message", windowListener);
        return;
      }

      if (normalizedRole === "presenter" && root.opener && typeof MessageChannel !== "undefined") {
        try {
          const handshakeChannel = new MessageChannel();
          attachMessagePort(handshakeChannel.port1);
          root.opener.postMessage(
            {
              type: "miniPresenterLocalHandshake",
              sessionId,
              role: normalizedRole,
            },
            "*",
            [handshakeChannel.port2]
          );
        } catch (error) {
          safeInvoke(handlers.error, error);
        }
      }
    }

    function setupBroadcastChannel() {
      if (!useBroadcastChannel || typeof BroadcastChannel === "undefined") {
        return;
      }

      try {
        channel = new BroadcastChannel(channelName);
        channel.addEventListener("message", (event) => {
          handlePacket(event.data);
        });
      } catch (error) {
        channel = null;
      }
    }

    function handleOutgoingDisplayMessage(message) {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === "state") {
        lastState = { ...message };
        sendPacket({ ...message, displays: 1 });
        return true;
      }

      sendPacket(message);
      return true;
    }

    function handleOutgoingPeerMessage(message) {
      if (!message || typeof message !== "object") {
        return false;
      }
      sendPacket(message);
      return true;
    }

    function cleanup() {
      if (windowListener && root && typeof root.removeEventListener === "function") {
        root.removeEventListener("message", windowListener);
      }
      windowListener = null;

      if (channel) {
        try {
          channel.close();
        } catch (error) {
          // ignore close failures
        }
      }
      channel = null;

      for (const port of messagePorts) {
        try {
          port.close?.();
        } catch (error) {
          // ignore close failures
        }
      }
      messagePorts.clear();
    }

    return {
      connect() {
        cleanup();
        setupBroadcastChannel();
        setupWindowHandshake();
        connected = true;
        safeInvoke(handlers.open, { type: "open" });
      },

      close() {
        if (!connected) {
          cleanup();
          return;
        }
        connected = false;
        cleanup();
        safeInvoke(handlers.close, { type: "close" });
      },

      send(message) {
        if (!connected) {
          return false;
        }

        if (normalizedRole === "display") {
          return handleOutgoingDisplayMessage(message);
        }
        return handleOutgoingPeerMessage(message);
      },

      isOpen() {
        return connected;
      },

      setHandlers(nextHandlers = {}) {
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onOpen")) {
          handlers.open = nextHandlers.onOpen;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onMessage")) {
          handlers.message = nextHandlers.onMessage;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onClose")) {
          handlers.close = nextHandlers.onClose;
        }
        if (Object.prototype.hasOwnProperty.call(nextHandlers, "onError")) {
          handlers.error = nextHandlers.onError;
        }
      },
    };
  }

  namespace.createWebSocketTransport = createWebSocketTransport;
  namespace.createLocalTransport = createLocalTransport;
})(typeof window !== "undefined" ? window : globalThis);
