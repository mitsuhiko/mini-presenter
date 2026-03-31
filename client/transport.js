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

  namespace.createWebSocketTransport = createWebSocketTransport;
})(typeof window !== "undefined" ? window : globalThis);
