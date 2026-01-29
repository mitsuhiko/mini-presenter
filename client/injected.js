(function () {
  const params = new URLSearchParams(location.search);
  const isPresenterPreview = params.has("_presenter_preview");

  if (isPresenterPreview) {
    markPresenterPreview();
    mutePresenterPreviewAudio();
    enablePresenterPreviewMessaging();
    return;
  }

  const RECONNECT_DELAY_MS = 1000;
  const STATE_POLL_INTERVAL_MS = 250;

  let ws = null;
  let reconnectTimer = null;
  let statePoller = null;
  let sessionId = null;
  let lastReported = { slideId: null, hash: null, notes: null };

  function markPresenterPreview() {
    if (!window.miniPresenter ||
      (typeof window.miniPresenter !== "object" && typeof window.miniPresenter !== "function")) {
      window.miniPresenter = {};
    }
    try {
      window.miniPresenter.isPresenterPreview = true;
    } catch (error) {
      // ignore read-only globals
    }
    if (document.documentElement) {
      document.documentElement.dataset.presenterPreview = "true";
    }
  }

  function mutePresenterPreviewAudio() {
    const muteElement = (element) => {
      if (!element) {
        return;
      }
      try {
        element.muted = true;
      } catch (error) {
        // ignore
      }
      try {
        element.volume = 0;
      } catch (error) {
        // ignore
      }
      if (typeof element.setAttribute === "function") {
        element.setAttribute("muted", "");
      }
    };

    const muteAll = () => {
      document.querySelectorAll("audio, video").forEach(muteElement);
    };

    muteAll();

    document.addEventListener(
      "play",
      (event) => {
        if (event.target instanceof HTMLMediaElement) {
          muteElement(event.target);
        }
      },
      true
    );

    if (document.documentElement) {
      const observer = new MutationObserver(() => {
        muteAll();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function enablePresenterPreviewMessaging() {
    const sendReady = () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "miniPresenterPreviewReady" }, "*");
      }
    };

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) {
        return;
      }
      const payload = event.data;
      if (!payload || payload.type !== "miniPresenterPreview" || payload.action !== "goto") {
        return;
      }
      if (typeof payload.hash === "string" && location.hash !== payload.hash) {
        location.hash = payload.hash;
      }
    });

    if (document.readyState === "complete") {
      sendReady();
    } else {
      window.addEventListener("load", sendReady, { once: true });
    }
  }

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
    if (sessionId) {
      message.sessionId = sessionId;
    }
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

  function toggleFullscreen() {
    const elem = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      elem.requestFullscreen().catch(() => {});
    }
  }

  function handleKeydown(event) {
    if (event.key === "f" || event.key === "F") {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      event.preventDefault();
      toggleFullscreen();
    }
  }

  function openPresenterView() {
    const url = new URL("/_/presenter", location.origin);
    window.open(url.href, "miniPresenterView", "width=1000,height=700");
  }

  function createControlOverlay() {
    const HIDE_DELAY_MS = 2000;
    const TRIGGER_SIZE = 100;

    let hideTimer = null;
    let isVisible = false;
    let isHoveringButton = false;

    const overlay = document.createElement("div");
    overlay.id = "mini-presenter-overlay";
    overlay.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      z-index: 2147483647;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const buttonStyle = `
      border: none;
      background: rgba(255, 255, 255, 0.9);
      color: #333;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.15s ease;
    `;

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.textContent = "⛶ Fullscreen";
    fullscreenBtn.style.cssText = buttonStyle;
    fullscreenBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    fullscreenBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    fullscreenBtn.addEventListener("click", toggleFullscreen);

    const presenterBtn = document.createElement("button");
    presenterBtn.textContent = "🎤 Presenter";
    presenterBtn.style.cssText = buttonStyle;
    presenterBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    presenterBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    presenterBtn.addEventListener("click", openPresenterView);

    overlay.appendChild(fullscreenBtn);
    overlay.appendChild(presenterBtn);

    function show() {
      if (isVisible) {
        return;
      }
      isVisible = true;
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "auto";
    }

    function hide() {
      if (!isVisible) {
        return;
      }
      isVisible = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }

    function cancelHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function scheduleHide() {
      cancelHide();
      hideTimer = setTimeout(() => {
        if (!isHoveringButton) {
          hide();
        }
      }, HIDE_DELAY_MS);
    }

    function isInTriggerZone(event) {
      const x = window.innerWidth - event.clientX;
      const y = window.innerHeight - event.clientY;
      return x <= TRIGGER_SIZE && y <= TRIGGER_SIZE;
    }

    document.addEventListener("mousemove", (event) => {
      if (isInTriggerZone(event)) {
        show();
        scheduleHide();
      }
    });

    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(overlay);
      });
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

  async function loadSessionId() {
    try {
      const response = await fetch("/_/api/config");
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data && typeof data.sessionId === "string") {
        sessionId = data.sessionId;
      }
    } catch (error) {
      // ignore config fetch failures
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
      const registerMessage = { type: "register", role: "display" };
      if (sessionId) {
        registerMessage.sessionId = sessionId;
      }
      sendMessage(registerMessage);
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

  document.addEventListener("keydown", handleKeydown);

  loadSessionId().finally(() => {
    connect();
    createControlOverlay();
  });
})();
