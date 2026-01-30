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
  const DRAW_COLOR = "#ff4d4d";
  const DRAW_LINE_WIDTH_RATIO = 0.004;
  const LASER_COLOR = "#ffdd4d";
  const LASER_RADIUS_RATIO = 0.012;
  const LASER_FADE_MS = 180;

  let ws = null;
  let reconnectTimer = null;
  let statePoller = null;
  let sessionId = null;
  let lastReported = { slideId: null, hash: null, notes: null, viewport: null };
  let drawingOverlay = null;

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

  function getViewportMetrics() {
    return {
      width: Math.round(window.innerWidth || 0),
      height: Math.round(window.innerHeight || 0),
    };
  }

  function reportState() {
    const slideId = getSlideId();
    const hash = location.hash || "#";
    const notes = getNotes(slideId);
    const viewport = getViewportMetrics();
    if (
      slideId === lastReported.slideId &&
      hash === lastReported.hash &&
      notes === lastReported.notes &&
      viewport.width === lastReported.viewport?.width &&
      viewport.height === lastReported.viewport?.height
    ) {
      return;
    }
    lastReported = { slideId, hash, notes, viewport };
    const message = { type: "state", slideId, hash, viewport };
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
      flex-direction: column;
      align-items: stretch;
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
      border: 2px solid #8f653c;
      background: #c08a57;
      color: #fdf6ee;
      padding: 10px 16px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.01em;
      flex: 1;
      min-width: 120px;
      text-align: center;
      box-shadow: 0 4px 0 #704f2d, 0 8px 12px rgba(0, 0, 0, 0.25);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    `;

    const primaryRow = document.createElement("div");
    primaryRow.style.cssText = "display: flex; gap: 8px; width: 100%;";

    const navRow = document.createElement("div");
    navRow.style.cssText = "display: flex; gap: 8px; width: 100%;";

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.textContent = "Fullscreen";
    fullscreenBtn.style.cssText = buttonStyle;
    fullscreenBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    fullscreenBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    fullscreenBtn.addEventListener("click", toggleFullscreen);

    const presenterBtn = document.createElement("button");
    presenterBtn.textContent = "Presenter";
    presenterBtn.style.cssText = buttonStyle;
    presenterBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    presenterBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    presenterBtn.addEventListener("click", openPresenterView);

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "◀ Prev";
    prevBtn.style.cssText = buttonStyle;
    prevBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    prevBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    prevBtn.addEventListener("click", () => handleNavigate("prev"));

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ▶";
    nextBtn.style.cssText = buttonStyle;
    nextBtn.addEventListener("mouseenter", () => { isHoveringButton = true; });
    nextBtn.addEventListener("mouseleave", () => { isHoveringButton = false; scheduleHide(); });
    nextBtn.addEventListener("click", () => handleNavigate("next"));

    const applyButtonState = (button, state) => {
      if (state === "active") {
        button.style.background = "#b17845";
        button.style.transform = "translateY(3px)";
        button.style.boxShadow = "0 2px 0 #704f2d, 0 6px 10px rgba(0, 0, 0, 0.22)";
        return;
      }
      if (state === "hover") {
        button.style.background = "#b17845";
        button.style.transform = "translateY(-1px)";
        button.style.boxShadow = "0 5px 0 #704f2d, 0 10px 14px rgba(0, 0, 0, 0.26)";
        return;
      }
      button.style.background = "#c08a57";
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 4px 0 #704f2d, 0 8px 12px rgba(0, 0, 0, 0.25)";
    };

    const wireButtonEffects = (button) => {
      button.addEventListener("mouseenter", () => applyButtonState(button, "hover"));
      button.addEventListener("mouseleave", () => applyButtonState(button, "base"));
      button.addEventListener("mousedown", () => applyButtonState(button, "active"));
      button.addEventListener("mouseup", () => applyButtonState(button, "hover"));
      button.addEventListener("blur", () => applyButtonState(button, "base"));
      applyButtonState(button, "base");
    };

    wireButtonEffects(fullscreenBtn);
    wireButtonEffects(presenterBtn);
    wireButtonEffects(prevBtn);
    wireButtonEffects(nextBtn);

    primaryRow.appendChild(fullscreenBtn);
    primaryRow.appendChild(presenterBtn);
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    overlay.appendChild(primaryRow);
    overlay.appendChild(navRow);

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

  function createDrawingOverlay() {
    const drawCanvas = document.createElement("canvas");
    const laserCanvas = document.createElement("canvas");
    const drawContext = drawCanvas.getContext("2d");
    const laserContext = laserCanvas.getContext("2d");
    let currentStroke = null;
    let laserTimer = null;
    let viewportWidth = window.innerWidth || 0;
    let viewportHeight = window.innerHeight || 0;

    if (!drawContext || !laserContext) {
      return {
        renderDrawMessage: () => {},
      };
    }

    drawCanvas.id = "mini-presenter-draw-canvas";
    laserCanvas.id = "mini-presenter-laser-canvas";

    const baseStyle = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483645;
    `;

    drawCanvas.style.cssText = baseStyle;
    laserCanvas.style.cssText = `${baseStyle} z-index: 2147483646;`;

    const resize = () => {
      viewportWidth = Math.max(1, Math.round(window.innerWidth || 0));
      viewportHeight = Math.max(1, Math.round(window.innerHeight || 0));
      const pixelRatio = window.devicePixelRatio || 1;
      drawCanvas.width = Math.round(viewportWidth * pixelRatio);
      drawCanvas.height = Math.round(viewportHeight * pixelRatio);
      laserCanvas.width = Math.round(viewportWidth * pixelRatio);
      laserCanvas.height = Math.round(viewportHeight * pixelRatio);
      drawContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      laserContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawContext.lineCap = "round";
      drawContext.lineJoin = "round";
    };

    const clearLaser = () => {
      laserContext.clearRect(0, 0, viewportWidth, viewportHeight);
    };

    const clearAll = () => {
      drawContext.clearRect(0, 0, viewportWidth, viewportHeight);
      clearLaser();
      currentStroke = null;
    };

    const renderLaserPoint = ({ x, y, radius, color }) => {
      const cx = x * viewportWidth;
      const cy = y * viewportHeight;
      const size = (radius ?? LASER_RADIUS_RATIO) * viewportWidth;
      clearLaser();
      laserContext.save();
      laserContext.fillStyle = color ?? LASER_COLOR;
      laserContext.shadowColor = color ?? LASER_COLOR;
      laserContext.shadowBlur = size * 1.1;
      laserContext.beginPath();
      laserContext.arc(cx, cy, size, 0, Math.PI * 2);
      laserContext.fill();
      laserContext.restore();
      if (laserTimer) {
        clearTimeout(laserTimer);
      }
      laserTimer = setTimeout(() => {
        laserTimer = null;
        clearLaser();
      }, LASER_FADE_MS);
    };

    const renderDrawMessage = (message) => {
      if (message.action === "clear") {
        clearAll();
        return;
      }
      if (message.action === "laser") {
        renderLaserPoint(message);
        return;
      }
      const x = message.x * viewportWidth;
      const y = message.y * viewportHeight;
      const size = (message.size ?? DRAW_LINE_WIDTH_RATIO) * viewportWidth;
      const color = message.color ?? DRAW_COLOR;

      if (message.action === "start") {
        drawContext.fillStyle = color;
        drawContext.beginPath();
        drawContext.arc(x, y, size / 2, 0, Math.PI * 2);
        drawContext.fill();
        currentStroke = { x, y, size, color };
        return;
      }

      if (!currentStroke) {
        return;
      }

      drawContext.strokeStyle = currentStroke.color;
      drawContext.lineWidth = currentStroke.size;
      drawContext.beginPath();
      drawContext.moveTo(currentStroke.x, currentStroke.y);
      drawContext.lineTo(x, y);
      drawContext.stroke();
      currentStroke = { x, y, size: currentStroke.size, color: currentStroke.color };

      if (message.action === "end") {
        currentStroke = null;
      }
    };

    const appendCanvases = () => {
      document.body.appendChild(drawCanvas);
      document.body.appendChild(laserCanvas);
    };

    if (document.body) {
      appendCanvases();
    } else {
      document.addEventListener("DOMContentLoaded", appendCanvases, { once: true });
    }

    resize();
    window.addEventListener("resize", resize);

    return { renderDrawMessage };
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
    } else if (message.type === "draw") {
      drawingOverlay?.renderDrawMessage(message);
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
  window.addEventListener("resize", reportState);

  document.addEventListener("keydown", handleKeydown);

  loadSessionId().finally(() => {
    drawingOverlay = createDrawingOverlay();
    connect();
    createControlOverlay();
  });
})();
