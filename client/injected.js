(function () {
  const params = new URLSearchParams(location.search);
  if (params.has("_presenter_preview")) {
    return;
  }

  const RECONNECT_DELAY_MS = 1000;
  const STATE_POLL_INTERVAL_MS = 250;

  let ws = null;
  let reconnectTimer = null;
  let statePoller = null;
  let lastReported = { slideId: null, hash: null, notes: null };

  function getWebSocketUrl() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/_/ws`;
  }

  function sendMessage(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(message));
  }

  function getSlideId() {
    if (window.miniPresenter && typeof window.miniPresenter.getCurrentSlide === "function") {
      return window.miniPresenter.getCurrentSlide();
    }
    return location.hash || "#";
  }

  function getNotes(slideId) {
    if (window.miniPresenter && typeof window.miniPresenter.getNotes === "function") {
      try {
        const notes = window.miniPresenter.getNotes(slideId);
        return typeof notes === "string" ? notes : null;
      } catch (error) {
        return null;
      }
    }
    return undefined;
  }

  function reportState() {
    const slideId = getSlideId();
    const hash = location.hash || "#";
    const notes = getNotes(slideId);
    if (
      slideId === lastReported.slideId &&
      hash === lastReported.hash &&
      notes === lastReported.notes
    ) {
      return;
    }
    lastReported = { slideId, hash, notes };
    const message = { type: "state", slideId, hash };
    if (notes !== undefined) {
      message.notes = notes;
    }
    sendMessage(message);
  }

  function dispatchKey(key) {
    const target = document.body || document.documentElement || document;
    if (!target || typeof target.dispatchEvent !== "function") {
      return;
    }
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  function navigateWithApi(action) {
    if (!window.miniPresenter) {
      return false;
    }
    const apiAction = window.miniPresenter[action];
    if (typeof apiAction === "function") {
      apiAction();
      return true;
    }
    return false;
  }

  function handleNavigate(action) {
    if (navigateWithApi(action)) {
      return;
    }
    const keyMap = {
      next: "ArrowRight",
      prev: "ArrowLeft",
      first: "Home",
      last: "End",
    };
    const key = keyMap[action] || action;
    dispatchKey(key);
  }

  function handleGoto(hash) {
    if (window.miniPresenter && typeof window.miniPresenter.goto === "function") {
      window.miniPresenter.goto(hash);
      return;
    }
    if (hash) {
      location.hash = hash;
    }
  }

  function handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.type === "navigate") {
      handleNavigate(message.action);
    } else if (message.type === "goto") {
      handleGoto(message.hash);
    } else if (message.type === "reload") {
      if (message.preserveHash) {
        location.reload();
      } else {
        location.href = "/";
      }
    }
  }

  function startStatePolling() {
    if (statePoller) {
      return;
    }
    statePoller = setInterval(reportState, STATE_POLL_INTERVAL_MS);
  }

  function stopStatePolling() {
    if (statePoller) {
      clearInterval(statePoller);
      statePoller = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function patchHistory(methodName) {
    const original = history[methodName];
    if (typeof original !== "function") {
      return;
    }
    history[methodName] = function (...args) {
      const result = original.apply(this, args);
      reportState();
      return result;
    };
  }

  function connect() {
    if (ws) {
      ws.close();
    }

    ws = new WebSocket(getWebSocketUrl());
    ws.addEventListener("open", () => {
      sendMessage({ type: "register", role: "display" });
      reportState();
      startStatePolling();
    });

    ws.addEventListener("message", handleMessage);

    ws.addEventListener("close", () => {
      stopStatePolling();
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      stopStatePolling();
      scheduleReconnect();
    });
  }

  patchHistory("replaceState");
  patchHistory("pushState");

  window.addEventListener("hashchange", reportState);
  window.addEventListener("popstate", reportState);

  connect();
})();
