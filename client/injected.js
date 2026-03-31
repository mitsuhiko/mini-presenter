(function () {
  window.__miniPresenterDisplayInjected = true;

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
  const DEFAULT_SHORTCUTS = {
    fullscreen: ["f"],
    presenter: ["p"],
    questions: ["q"],
  };

  let transport = null;
  let reconnectTimer = null;
  let statePoller = null;
  let sessionId = null;
  let lastReported = { slideId: null, hash: null, notes: null, viewport: null, slideOrderKey: null };
  let shortcutConfig = { ...DEFAULT_SHORTCUTS };
  let drawingOverlay = null;
  let questionsOverlay = null;

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
    const observedElements = new WeakSet();

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
      try {
        element.autoplay = false;
      } catch (error) {
        // ignore
      }
      if (typeof element.setAttribute === "function") {
        element.setAttribute("muted", "");
        element.removeAttribute("autoplay");
      }
    };

    const observeElement = (element) => {
      if (!element || observedElements.has(element)) {
        return;
      }
      observedElements.add(element);
      const reapplyMute = () => muteElement(element);
      element.addEventListener("volumechange", reapplyMute);
      element.addEventListener("playing", reapplyMute);
      element.addEventListener("play", reapplyMute);
      element.addEventListener("loadedmetadata", reapplyMute);
    };

    const muteAll = () => {
      document.querySelectorAll("audio, video").forEach((element) => {
        muteElement(element);
        observeElement(element);
      });
    };

    muteAll();

    document.addEventListener(
      "play",
      (event) => {
        if (event.target instanceof HTMLMediaElement) {
          muteElement(event.target);
          observeElement(event.target);
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

  function getRuntimeHelpers() {
    return window.miniPresenterRuntime ?? null;
  }

  function applyRuntimeConfig(config) {
    const runtime = getRuntimeHelpers();
    if (runtime && typeof runtime.applyConfig === "function") {
      runtime.applyConfig(config);
    }
  }

  function getWebSocketUrl() {
    const runtime = getRuntimeHelpers();
    const runtimeUrl = runtime?.getWebSocketUrl?.(location);
    if (typeof runtimeUrl === "string" && runtimeUrl) {
      return runtimeUrl;
    }
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/_/ws`;
  }

  function getWebSocketTransportFactory() {
    const factory = window.miniPresenterTransports?.createWebSocketTransport;
    return typeof factory === "function" ? factory : null;
  }

  function getLocalTransportFactory() {
    const factory = window.miniPresenterTransports?.createLocalTransport;
    return typeof factory === "function" ? factory : null;
  }

  function getRuntimeUrl(name, fallbackPath) {
    const runtime = getRuntimeHelpers();
    const url = runtime?.getUrl?.(name, location.origin);
    if (typeof url === "string" && url) {
      return url;
    }
    return new URL(fallbackPath, location.origin).toString();
  }

  function getRuntimeApiUrl(name, fallbackPath) {
    const runtime = getRuntimeHelpers();
    const url = runtime?.getApiUrl?.(name, location.origin);
    if (typeof url === "string" && url) {
      return url;
    }
    return new URL(fallbackPath, location.origin).toString();
  }

  function getRuntimeSnapshot() {
    const runtime = getRuntimeHelpers();
    const value = runtime?.getRuntime?.();
    return value && typeof value === "object" ? value : {};
  }

  function isLocalMode() {
    const runtime = getRuntimeHelpers();
    return runtime?.getMode?.() === "local";
  }

  function hasRuntimeCapability(name) {
    const capabilities = getRuntimeSnapshot().capabilities;
    if (!capabilities || typeof capabilities !== "object") {
      return true;
    }
    return capabilities[name] !== false;
  }

  function generateSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getDeckUrlForLocalMode() {
    const url = new URL(location.href);
    url.searchParams.delete("_presenter_preview");
    url.searchParams.delete("mp_mode");
    url.searchParams.delete("mp_session");
    url.searchParams.delete("mp_deck");
    return url.toString();
  }

  function ensureLocalSessionId() {
    const runtime = getRuntimeHelpers();
    const params = new URLSearchParams(location.search);
    const snapshot = getRuntimeSnapshot();
    const currentLocal = snapshot.local && typeof snapshot.local === "object" ? snapshot.local : {};
    const fromUrl = params.get("mp_session");

    let id =
      typeof currentLocal.sessionId === "string" && currentLocal.sessionId
        ? currentLocal.sessionId
        : typeof fromUrl === "string" && fromUrl
          ? fromUrl
          : null;

    if (!id) {
      id = generateSessionId();
    }

    const deckUrl =
      typeof currentLocal.deckUrl === "string" && currentLocal.deckUrl
        ? currentLocal.deckUrl
        : getDeckUrlForLocalMode();

    runtime?.setRuntime?.({
      local: {
        ...currentLocal,
        sessionId: id,
        deckUrl,
      },
    });

    return id;
  }

  function buildLocalConfig() {
    return {
      sessionId,
      _runtime: getRuntimeSnapshot(),
    };
  }

  function sendMessage(message) {
    transport?.send(message);
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

  function getSlideOrder() {
    if (window.miniPresenter && typeof window.miniPresenter.getSlideList === "function") {
      try {
        const list = window.miniPresenter.getSlideList();
        if (!Array.isArray(list)) {
          return undefined;
        }
        const filtered = list.filter((entry) => typeof entry === "string");
        return filtered.length > 0 ? filtered : undefined;
      } catch (error) {
        return undefined;
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
    const slideOrder = getSlideOrder();
    const slideOrderKey = Array.isArray(slideOrder) ? slideOrder.join("\u001f") : null;
    const viewport = getViewportMetrics();
    if (
      slideId === lastReported.slideId &&
      hash === lastReported.hash &&
      notes === lastReported.notes &&
      slideOrderKey === lastReported.slideOrderKey &&
      viewport.width === lastReported.viewport?.width &&
      viewport.height === lastReported.viewport?.height
    ) {
      return;
    }
    lastReported = { slideId, hash, notes, viewport, slideOrderKey };
    const message = { type: "state", slideId, hash, viewport };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    if (notes !== undefined) {
      message.notes = notes;
    }
    if (slideOrder) {
      message.slideOrder = slideOrder;
    }
    sendMessage(message);
  }

  function normalizeShortcutList(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const normalized = value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  }

  function applyShortcutConfig(config) {
    const shortcuts = config?.shortcuts ?? {};
    shortcutConfig = {
      fullscreen: normalizeShortcutList(shortcuts.fullscreen, DEFAULT_SHORTCUTS.fullscreen),
      presenter: normalizeShortcutList(shortcuts.presenter, DEFAULT_SHORTCUTS.presenter),
      questions: normalizeShortcutList(shortcuts.questions, DEFAULT_SHORTCUTS.questions),
    };
  }

  function normalizeKeyToken(token) {
    const lower = token.toLowerCase();
    if (lower === "space" || lower === "spacebar") {
      return " ";
    }
    if (lower === "cmd" || lower === "command") {
      return "meta";
    }
    if (lower === "ctrl") {
      return "control";
    }
    if (lower === "option") {
      return "alt";
    }
    return token;
  }

  function parseShortcut(shortcut) {
    const tokens = shortcut
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean)
      .map(normalizeKeyToken);

    const required = { meta: false, control: false, alt: false, shift: false };
    let keyToken = null;

    tokens.forEach((token) => {
      const lower = token.toLowerCase();
      if (lower === "meta") {
        required.meta = true;
        return;
      }
      if (lower === "control") {
        required.control = true;
        return;
      }
      if (lower === "alt") {
        required.alt = true;
        return;
      }
      if (lower === "shift") {
        required.shift = true;
        return;
      }
      keyToken = token;
    });

    return { keyToken, required };
  }

  function matchesShortcut(event, shortcut) {
    if (!shortcut) {
      return false;
    }
    const { keyToken, required } = parseShortcut(shortcut);
    if (!keyToken) {
      return false;
    }

    if (event.metaKey !== required.meta) {
      return false;
    }
    if (event.ctrlKey !== required.control) {
      return false;
    }
    if (event.altKey !== required.alt) {
      return false;
    }
    if (event.shiftKey !== required.shift) {
      return false;
    }

    const normalizedToken = normalizeKeyToken(keyToken);
    const key = event.key;

    if (normalizedToken === " ") {
      return key === " " || key === "Spacebar";
    }

    if (normalizedToken.length === 1) {
      return key.toLowerCase() === normalizedToken.toLowerCase();
    }

    return key === normalizedToken;
  }

  function resolveShortcutAction(event) {
    for (const shortcut of shortcutConfig.fullscreen ?? []) {
      if (matchesShortcut(event, shortcut)) {
        return "fullscreen";
      }
    }
    for (const shortcut of shortcutConfig.presenter ?? []) {
      if (matchesShortcut(event, shortcut)) {
        return "presenter";
      }
    }
    for (const shortcut of shortcutConfig.questions ?? []) {
      if (matchesShortcut(event, shortcut)) {
        return "questions";
      }
    }
    return null;
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
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    const action = resolveShortcutAction(event);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "fullscreen") {
      toggleFullscreen();
      return;
    }
    if (action === "presenter") {
      openPresenterView();
      return;
    }
    if (action === "questions") {
      if (!hasRuntimeCapability("questions")) {
        return;
      }
      questionsOverlay?.toggle();
    }
  }

  function openPresenterView() {
    const presenterUrl = new URL(getRuntimeUrl("presenter", "/_/presenter"), location.origin);

    if (isLocalMode()) {
      const localSessionId = sessionId || ensureLocalSessionId();
      sessionId = localSessionId;
      const runtime = getRuntimeHelpers();
      const snapshot = getRuntimeSnapshot();
      const local = snapshot.local && typeof snapshot.local === "object" ? snapshot.local : {};
      const deckUrl =
        typeof local.deckUrl === "string" && local.deckUrl
          ? local.deckUrl
          : getDeckUrlForLocalMode();

      runtime?.setRuntime?.({
        local: {
          ...local,
          sessionId: localSessionId,
          deckUrl,
        },
      });

      presenterUrl.searchParams.set("mp_mode", "local");
      presenterUrl.searchParams.set("mp_session", localSessionId);
      presenterUrl.searchParams.set("mp_deck", deckUrl);
    }

    window.open(presenterUrl.toString(), "miniPresenterView", "width=1000,height=700");
  }

  function createQuestionsOverlay() {
    const questionsUrl = getRuntimeUrl("questions", "/_/questions");

    const overlay = document.createElement("div");
    overlay.id = "mini-presenter-questions";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: rgba(0, 0, 0, 0.65);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.92);
      color: #1b1b1b;
      border-radius: 20px;
      padding: 2.5rem 3rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      max-width: min(90vw, 640px);
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
      text-align: center;
    `;

    const title = document.createElement("div");
    title.textContent = "Ask a question";
    title.style.cssText = "font-size: 2rem; font-weight: 700;";

    const img = document.createElement("img");
    img.src = getRuntimeApiUrl("questionsQr", "/_/api/questions/qr");
    img.alt = "QR code for questions";
    img.style.cssText = "width: min(60vw, 280px); height: auto; border-radius: 16px; border: 4px solid #f3f3f3; background: #fff; padding: 12px;";

    const link = document.createElement("div");
    link.textContent = questionsUrl;
    link.style.cssText = "font-size: 1.1rem; font-weight: 600; word-break: break-all; max-width: 100%;";

    card.appendChild(title);
    card.appendChild(img);
    card.appendChild(link);
    overlay.appendChild(card);

    const setOpen = (open) => {
      overlay.style.opacity = open ? "1" : "0";
      overlay.style.pointerEvents = open ? "auto" : "none";
      overlay.dataset.open = open ? "true" : "false";
    };

    const toggle = () => {
      const open = overlay.dataset.open === "true";
      setOpen(!open);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        setOpen(false);
      }
    });

    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(overlay);
      });
    }

    setOpen(false);

    return { toggle, close: () => setOpen(false) };
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
    } else if (message.type === "config") {
      if (message.config) {
        applyRuntimeConfig(message.config);
        applyShortcutConfig(message.config);
        if (typeof message.config.sessionId === "string") {
          sessionId = message.config.sessionId;
        }
      }
    } else if (message.type === "reload") {
      if (message.preserveHash) {
        location.reload();
      } else {
        location.href = "/";
      }
    }
  }

  async function loadSessionId() {
    if (isLocalMode()) {
      sessionId = ensureLocalSessionId();
      return;
    }

    try {
      const response = await fetch(getRuntimeApiUrl("config", "/_/api/config"));
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data) {
        applyRuntimeConfig(data);
        if (typeof data.sessionId === "string") {
          sessionId = data.sessionId;
        }
        applyShortcutConfig(data);
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
    const useLocalTransport = isLocalMode();
    const createTransport = useLocalTransport
      ? getLocalTransportFactory()
      : getWebSocketTransportFactory();

    if (!createTransport) {
      stopStatePolling();
      return;
    }

    if (!transport) {
      const baseOptions = useLocalTransport
        ? {
            role: "display",
            sessionId: sessionId || ensureLocalSessionId(),
            getConfig: buildLocalConfig,
          }
        : {
            url: getWebSocketUrl(),
          };

      transport = createTransport({
        ...baseOptions,
        onOpen: () => {
          const registerMessage = { type: "register", role: "display" };
          if (sessionId) {
            registerMessage.sessionId = sessionId;
          }
          sendMessage(registerMessage);
          reportState();
          startStatePolling();
        },
        onMessage: handleMessage,
        onClose: () => {
          stopStatePolling();
          scheduleReconnect();
        },
        onError: () => {
          stopStatePolling();
          scheduleReconnect();
        },
      });
    }

    transport.connect();
  }

  patchHistory("replaceState");
  patchHistory("pushState");

  window.addEventListener("hashchange", reportState);
  window.addEventListener("popstate", reportState);
  window.addEventListener("resize", reportState);

  document.addEventListener("keydown", handleKeydown);

  loadSessionId().finally(() => {
    drawingOverlay = createDrawingOverlay();
    questionsOverlay = hasRuntimeCapability("questions") ? createQuestionsOverlay() : null;
    connect();
    createControlOverlay();
  });
})();
