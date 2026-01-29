const timerDisplay = document.querySelector("#timer");
const currentSlideDisplay = document.querySelector("#current-slide");
const displayCountDisplay = document.querySelector("#display-count");
const connectionStatus = document.querySelector("#connection-status");
const previewPlaceholder = document.querySelector("#preview-placeholder");
const previewSection = document.querySelector(".presenter__preview--current");
const previewFrame = document.querySelector("#preview-frame");
const previewStage = previewSection?.querySelector(".presenter__preview-stage");
const drawCanvas = document.querySelector("#preview-draw-canvas");
const laserCanvas = document.querySelector("#preview-laser-canvas");
const nextPreviewPlaceholder = document.querySelector("#next-preview-placeholder");
const nextPreviewSection = document.querySelector(".presenter__preview--next");
const nextPreviewFrame = document.querySelector("#next-preview-frame");
const timerToggleButton = document.querySelector("#timer-toggle");
const timerResetButton = document.querySelector("#timer-reset");
const actionButtons = document.querySelectorAll("[data-action]");
const toolButtons = document.querySelectorAll("[data-tool]");
const colorButtons = document.querySelectorAll(".presenter__color[data-color]");
const colorPickerInput = document.querySelector("#draw-color-picker");
const clearToggleButton = document.querySelector("#clear-toggle");
const clearConfirmButton = document.querySelector("#clear-confirm");
const clearCancelButton = document.querySelector("#clear-cancel");
const clearPopover = document.querySelector("#clear-popover");
const resetToggleButton = document.querySelector("#reset-toggle");
const resetConfirmButton = document.querySelector("#reset-confirm");
const resetCancelButton = document.querySelector("#reset-cancel");
const resetPopover = document.querySelector("#reset-popover");
const brandDisplay = document.querySelector(".presenter__brand");
const notesStatus = document.querySelector("#notes-status");
const notesContent = document.querySelector("#notes-content");

const RECONNECT_DELAY_MS = 1000;
const TIMER_INTERVAL_MS = 250;
const PREVIEW_QUERY = "_presenter_preview=1";
const NOTES_LOADING_TEXT = "Loading notes…";
const NOTES_EMPTY_TEXT = "No notes for this slide.";
const NOTES_DISABLED_TEXT = "Speaker notes disabled.";
const NEXT_PREVIEW_WAITING_TEXT = "Waiting for display connection…";
const NEXT_PREVIEW_UNAVAILABLE_TEXT = "Next slide preview unavailable.";
const NEXT_PREVIEW_LAST_TEXT = "End of deck.";

const DRAW_COLOR = "#ff4d4d";
const DRAW_LINE_WIDTH_RATIO = 0.004;
const LASER_COLOR = "#ffdd4d";
const LASER_RADIUS_RATIO = 0.012;
const LASER_FADE_MS = 180;
const LASER_SEND_THROTTLE_MS = 25;
const DRAW_SEND_THROTTLE_MS = 16;

const presenterKey = getPresenterKey();

const DEFAULT_KEYBOARD = {
  next: ["ArrowRight", "PageDown", " ", "Spacebar"],
  prev: ["ArrowLeft", "PageUp"],
  first: ["Home"],
  last: ["End"],
};

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getPresenterKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("key");
  if (urlKey) {
    return urlKey.trim();
  }

  if (isLocalHostname(window.location.hostname)) {
    return null;
  }

  const storedKey = window.sessionStorage.getItem("miniPresenterKey");
  if (storedKey) {
    return storedKey;
  }

  const enteredKey = window.prompt("Enter presenter code");
  if (!enteredKey) {
    return null;
  }

  const trimmedKey = enteredKey.trim();
  if (!trimmedKey) {
    return null;
  }

  window.sessionStorage.setItem("miniPresenterKey", trimmedKey);
  params.set("key", trimmedKey);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
  return trimmedKey;
}

let ws = null;
let reconnectTimer = null;
let timerInterval = null;
let timerRunning = false;
let timerStarted = false;
let timerElapsed = 0;
let lastTick = 0;
let timerMode = "countup";
let countdownDuration = 0;
let countdownStartSlide = null;
let sessionId = null;
let lastSlideId = null;
let lastKnownHash = "#";
let previewHash = null;
let previewReady = false;
let nextPreviewReady = false;
let keyboardMap = new Map();
let notesSource = "auto";
let lastNotesKey = null;
let notesLoadingKey = null;
const notesCache = new Map();
let apiSlideOrder = null;
let relativeHashPreview = false;
let nextPreviewHash = null;
let lastDisplayCount = 0;
let configTitle = null;
let pendingNextPreviewHash = null;
let relativeNextPreviewTimer = null;
let relativeNextPreviewAttempts = 0;
let relativeNextPreviewEndHash = null;
let previewAspectRatio = null;
let activeTool = "none";
let activeDrawColor = DRAW_COLOR;
let drawingActive = false;
let laserActive = false;
let drawContext = null;
let laserContext = null;
let currentStroke = null;
let drawHistory = [];
let activeHistoryStroke = null;
let lastLaserSent = 0;
let lastDrawSent = 0;
let laserFadeTimer = null;
let previewResizeObserver = null;

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

function sendCommand(action, hash) {
  sendMessage({ type: "command", action, hash });
}

function normalizeKeyboardConfig(config) {
  const nextConfig = { ...DEFAULT_KEYBOARD };
  if (!config || typeof config !== "object") {
    return nextConfig;
  }
  for (const [action, keys] of Object.entries(config)) {
    if (!Array.isArray(keys)) {
      continue;
    }
    const normalized = keys.filter((key) => typeof key === "string");
    if (normalized.length > 0) {
      nextConfig[action] = normalized;
    }
  }
  return nextConfig;
}

function buildKeyboardMap(config) {
  const map = new Map();
  for (const [action, keys] of Object.entries(config)) {
    keys.forEach((key) => {
      if (!key) {
        return;
      }
      map.set(key, action);
      if (key.length === 1) {
        map.set(key.toLowerCase(), action);
        map.set(key.toUpperCase(), action);
      }
    });
  }
  return map;
}

function resolveCountdownDuration(timerConfig) {
  if (!timerConfig || typeof timerConfig !== "object") {
    return 0;
  }
  const minutes = Number(timerConfig.durationMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes * 60 * 1000;
  }
  const seconds = Number(timerConfig.durationSeconds ?? timerConfig.duration);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return 0;
}

function applyConfig(config) {
  const title = typeof config?.title === "string" ? config.title : null;
  configTitle = title;
  if (title && brandDisplay) {
    brandDisplay.textContent = title;
    document.title = title;
  } else {
    syncTitleFromPreview();
  }

  const keyboardConfig = normalizeKeyboardConfig(config?.keyboard);
  keyboardMap = buildKeyboardMap(keyboardConfig);

  const source = config?.notes?.source;
  if (source === "api" || source === "files" || source === "none") {
    notesSource = source;
  } else {
    notesSource = "auto";
  }

  const previewConfig = config?.preview ?? config?.previews ?? {};
  relativeHashPreview = previewConfig?.relativeHash === true;

  sessionId = typeof config?.sessionId === "string" ? config.sessionId : null;

  const timerConfig = config?.timer ?? {};
  timerMode = timerConfig?.mode === "countdown" ? "countdown" : "countup";
  countdownDuration = resolveCountdownDuration(timerConfig);
  countdownStartSlide = null;
  timerElapsed = 0;
  timerRunning = false;
  timerStarted = false;
  updateTimerDisplay();
  updateTimerToggleLabel();

  if (lastSlideId || lastKnownHash !== "#") {
    updateNotes({ slideId: lastSlideId, hash: lastKnownHash });
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
  }
}

keyboardMap = buildKeyboardMap(DEFAULT_KEYBOARD);

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getTimerDisplayValue() {
  if (timerMode === "countdown" && countdownDuration > 0) {
    return Math.max(0, countdownDuration - timerElapsed);
  }
  return timerElapsed;
}

function updateTimerToggleLabel() {
  if (!timerToggleButton) {
    return;
  }
  if (!timerStarted && timerMode === "countdown") {
    timerToggleButton.textContent = "Start";
    return;
  }
  timerToggleButton.textContent = timerRunning ? "Pause" : "Resume";
}

function updateTimerDisplay() {
  timerDisplay.textContent = formatDuration(getTimerDisplayValue());
}

function formatSlideDisplay(slideId) {
  const total = apiSlideOrder?.length;
  const rawValue = slideId && slideId !== "—" ? slideId : "—";
  const value = rawValue === "—" ? rawValue : rawValue.replace(/^#/, "");
  if (value !== "—" && total) {
    return `${value}/${total}`;
  }
  return value;
}

function updateSlideIndicator(slideId) {
  if (!currentSlideDisplay) {
    return;
  }
  currentSlideDisplay.textContent = formatSlideDisplay(slideId);
}

function requestHardReload() {
  sendMessage({ type: "reload" });
  window.location.reload();
}

function startTimer() {
  if (timerRunning) {
    return;
  }
  timerRunning = true;
  lastTick = Date.now();
  updateTimerToggleLabel();
}

function pauseTimer() {
  if (!timerRunning) {
    return;
  }
  timerRunning = false;
  updateTimerToggleLabel();
}

function toggleTimer() {
  if (!timerStarted && timerMode === "countdown") {
    timerStarted = true;
    startTimer();
    ensureTimerInterval();
    return;
  }
  if (!timerStarted) {
    timerStarted = true;
    ensureTimerInterval();
  }
  if (timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function resetTimer() {
  timerElapsed = 0;
  lastTick = Date.now();
  updateTimerDisplay();
  updateTimerToggleLabel();
}

function tickTimer() {
  if (!timerRunning) {
    return;
  }
  const now = Date.now();
  timerElapsed += now - lastTick;
  lastTick = now;
  if (timerMode === "countdown" && countdownDuration > 0 && timerElapsed >= countdownDuration) {
    timerElapsed = countdownDuration;
    pauseTimer();
  }
  updateTimerDisplay();
}

function ensureTimerInterval() {
  if (!timerInterval) {
    timerInterval = setInterval(tickTimer, TIMER_INTERVAL_MS);
  }
}

function stopTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setPreviewActive(section, active) {
  if (!section) {
    return;
  }
  section.classList.toggle("presenter__preview--active", active);
}

function sendPreviewNavigation(frame, hash) {
  if (!frame || !frame.contentWindow) {
    return false;
  }
  frame.contentWindow.postMessage(
    { type: "miniPresenterPreview", action: "goto", hash },
    "*"
  );
  return true;
}

function setPreviewFrameSrc(frame, hash, isNext) {
  if (!frame) {
    return;
  }
  const previewUrl = `${location.origin}/?${PREVIEW_QUERY}`;
  frame.src = `${previewUrl}${hash}`;
  if (isNext) {
    nextPreviewReady = false;
  } else {
    previewReady = false;
  }
}

function updatePreview(hash) {
  if (!previewFrame) {
    return;
  }

  const nextHash = hash || "#";

  if (previewHash === nextHash && previewFrame.src) {
    return;
  }
  previewHash = nextHash;

  if (!previewFrame.src) {
    setPreviewFrameSrc(previewFrame, nextHash, false);
    return;
  }

  if (previewReady && sendPreviewNavigation(previewFrame, nextHash)) {
    return;
  }

  try {
    const frameLocation = previewFrame.contentWindow?.location;
    if (frameLocation && frameLocation.origin === location.origin) {
      frameLocation.hash = nextHash;
      return;
    }
  } catch (error) {
    // ignore cross-origin/frame not ready
  }

  setPreviewFrameSrc(previewFrame, nextHash, false);
}

function updateNextPreviewFrame(hash) {
  if (!nextPreviewFrame) {
    return;
  }

  const nextHash = hash || "#";

  if (nextPreviewHash === nextHash && nextPreviewFrame.src) {
    return;
  }
  nextPreviewHash = nextHash;

  if (!nextPreviewFrame.src) {
    setPreviewFrameSrc(nextPreviewFrame, nextHash, true);
    return;
  }

  if (nextPreviewReady && sendPreviewNavigation(nextPreviewFrame, nextHash)) {
    scheduleRelativeNextPreviewCheck();
    return;
  }

  try {
    const frameLocation = nextPreviewFrame.contentWindow?.location;
    if (frameLocation && frameLocation.origin === location.origin) {
      frameLocation.hash = nextHash;
      scheduleRelativeNextPreviewCheck();
      return;
    }
  } catch (error) {
    // ignore cross-origin/frame not ready
  }

  setPreviewFrameSrc(nextPreviewFrame, nextHash, true);
}

function setNextPreviewPlaceholder(text) {
  if (nextPreviewPlaceholder) {
    nextPreviewPlaceholder.textContent = text;
  }
}

function setNextPreviewEnd(active) {
  if (!nextPreviewSection) {
    return;
  }
  nextPreviewSection.classList.toggle("presenter__preview--end", active);
}

function normalizePreviewHash(hash) {
  if (!hash) {
    return "";
  }
  const cleaned = hash.replace(/^#/, "").replace(/~(next|prev)$/u, "");
  return cleaned;
}

function handleRelativeNextPreviewLoad() {
  if (!relativeHashPreview || !pendingNextPreviewHash) {
    return;
  }
  if (!nextPreviewFrame || !nextPreviewSection) {
    return;
  }
  let frameHash = null;
  try {
    frameHash = nextPreviewFrame.contentWindow?.location?.hash || null;
  } catch (error) {
    return;
  }
  if (!frameHash) {
    return;
  }
  if (/~(next|prev)$/u.test(frameHash)) {
    if (relativeNextPreviewAttempts < 10) {
      relativeNextPreviewAttempts += 1;
      scheduleRelativeNextPreviewCheck();
    }
    return;
  }

  const resolvedFrameHash = normalizePreviewHash(frameHash);
  const resolvedPendingHash = normalizePreviewHash(pendingNextPreviewHash);
  if (resolvedFrameHash === resolvedPendingHash) {
    setPreviewActive(nextPreviewSection, false);
    setNextPreviewEnd(true);
    setNextPreviewPlaceholder(NEXT_PREVIEW_LAST_TEXT);
    pendingNextPreviewHash = null;
    relativeNextPreviewEndHash = resolvedFrameHash || resolvedPendingHash;
  } else {
    setNextPreviewEnd(false);
  }
}

function scheduleRelativeNextPreviewCheck() {
  if (!relativeHashPreview || !pendingNextPreviewHash) {
    return;
  }
  if (relativeNextPreviewTimer) {
    clearTimeout(relativeNextPreviewTimer);
  }
  relativeNextPreviewTimer = setTimeout(() => {
    relativeNextPreviewTimer = null;
    handleRelativeNextPreviewLoad();
  }, 120);
}

function stripRelativeSuffix(hash) {
  if (!hash) {
    return hash;
  }
  return hash.replace(/~(next|prev)$/u, "");
}

function findSlideIndex(order, hash) {
  if (!Array.isArray(order) || !hash) {
    return -1;
  }
  const baseHash = stripRelativeSuffix(hash);
  const exactIndex = order.findIndex(
    (entry) => typeof entry === "string" && entry === baseHash
  );
  if (exactIndex !== -1) {
    return exactIndex;
  }
  return order.findIndex((entry) => {
    if (typeof entry !== "string") {
      return false;
    }
    return baseHash.startsWith(`${entry}.`);
  });
}

function syncTitleFromPreview() {
  if (configTitle || !previewFrame || !brandDisplay) {
    return;
  }
  try {
    const title = previewFrame.contentDocument?.title;
    if (title) {
      brandDisplay.textContent = title;
      document.title = title;
    }
  } catch (error) {
    // ignore cross-origin/frame not ready
  }
}

function getSlideOrderFromPreview() {
  if (apiSlideOrder || !previewFrame) {
    return apiSlideOrder;
  }
  try {
    const api = previewFrame.contentWindow?.miniPresenter;
    if (api && typeof api.getSlideList === "function") {
      const list = api.getSlideList();
      if (Array.isArray(list)) {
        const filtered = list.filter((entry) => typeof entry === "string");
        apiSlideOrder = filtered.length > 0 ? filtered : null;
        updateSlideIndicator(lastSlideId);
      }
    }
  } catch (error) {
    return apiSlideOrder;
  }
  return apiSlideOrder;
}

function resolveNextPreviewInfo({ slideId, hash }) {
  const baseHash = stripRelativeSuffix(hash || slideId || "#");
  if (!baseHash) {
    return { hash: null, reason: "unavailable" };
  }

  const order = getSlideOrderFromPreview();

  if (relativeHashPreview) {
    if (order) {
      const index = findSlideIndex(order, baseHash);
      if (index !== -1 && index >= order.length - 1) {
        return { hash: null, reason: "last" };
      }
    }
    return { hash: `${baseHash}~next`, reason: null };
  }

  if (!order) {
    return { hash: null, reason: "unavailable" };
  }

  const index = findSlideIndex(order, baseHash);
  if (index === -1) {
    return { hash: null, reason: "unavailable" };
  }
  if (index >= order.length - 1) {
    return { hash: null, reason: "last" };
  }
  return { hash: order[index + 1], reason: null };
}

function updateNextPreview({ slideId, hash }) {
  if (!nextPreviewFrame || !nextPreviewPlaceholder || !nextPreviewSection) {
    return;
  }

  if (lastDisplayCount <= 0) {
    setNextPreviewPlaceholder(NEXT_PREVIEW_WAITING_TEXT);
    setPreviewActive(nextPreviewSection, false);
    setNextPreviewEnd(false);
    pendingNextPreviewHash = null;
    relativeNextPreviewAttempts = 0;
    return;
  }

  const normalizedHash = normalizePreviewHash(hash || slideId || "#");
  if (relativeNextPreviewEndHash && normalizedHash !== relativeNextPreviewEndHash) {
    relativeNextPreviewEndHash = null;
  }

  if (relativeHashPreview && relativeNextPreviewEndHash && normalizedHash) {
    setPreviewActive(nextPreviewSection, false);
    pendingNextPreviewHash = null;
    relativeNextPreviewAttempts = 0;
    setNextPreviewEnd(true);
    setNextPreviewPlaceholder(NEXT_PREVIEW_LAST_TEXT);
    return;
  }

  const { hash: nextHash, reason } = resolveNextPreviewInfo({ slideId, hash });
  if (!nextHash) {
    setPreviewActive(nextPreviewSection, false);
    pendingNextPreviewHash = null;
    relativeNextPreviewAttempts = 0;
    if (reason === "last") {
      setNextPreviewEnd(true);
      setNextPreviewPlaceholder(NEXT_PREVIEW_LAST_TEXT);
      if (relativeHashPreview && normalizedHash) {
        relativeNextPreviewEndHash = normalizedHash;
      }
    } else {
      setNextPreviewEnd(false);
      setNextPreviewPlaceholder(NEXT_PREVIEW_UNAVAILABLE_TEXT);
    }
    return;
  }

  setNextPreviewEnd(false);
  setPreviewActive(nextPreviewSection, true);
  setNextPreviewPlaceholder(NEXT_PREVIEW_UNAVAILABLE_TEXT);
  pendingNextPreviewHash = relativeHashPreview ? hash || slideId || "#" : null;
  relativeNextPreviewAttempts = 0;
  updateNextPreviewFrame(nextHash);
}

function updatePreviewAspectRatio(viewport) {
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return;
  }
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return;
  }
  if (previewAspectRatio && Math.abs(ratio - previewAspectRatio) < 0.002) {
    return;
  }
  previewAspectRatio = ratio;
  document.documentElement.style.setProperty("--presenter-preview-aspect", ratio.toFixed(5));
  resizePreviewCanvases();
}

function resizeCanvas(canvas, context, { preserve = false } = {}) {
  if (!canvas || !context) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);
  const needsResize = canvas.width !== width || canvas.height !== height;
  let snapshot = null;
  if (preserve && needsResize && canvas.width && canvas.height) {
    snapshot = document.createElement("canvas");
    snapshot.width = rect.width;
    snapshot.height = rect.height;
    const snapshotContext = snapshot.getContext("2d");
    if (snapshotContext) {
      snapshotContext.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        0,
        0,
        rect.width,
        rect.height
      );
    }
  }
  if (needsResize) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (snapshot) {
    context.save();
    context.drawImage(snapshot, 0, 0, rect.width, rect.height);
    context.restore();
  }
}

function resizePreviewCanvases() {
  if (!drawCanvas || !laserCanvas) {
    return;
  }
  if (!drawContext) {
    drawContext = drawCanvas.getContext("2d");
  }
  if (!laserContext) {
    laserContext = laserCanvas.getContext("2d");
  }
  if (!drawContext || !laserContext) {
    return;
  }
  resizeCanvas(drawCanvas, drawContext);
  resizeCanvas(laserCanvas, laserContext);
  redrawDrawHistory();
}

function clearLaserCanvas() {
  if (!laserContext || !laserCanvas) {
    return;
  }
  const rect = laserCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  laserContext.clearRect(0, 0, rect.width, rect.height);
}

function clearDrawings({ send = false } = {}) {
  if (drawContext && drawCanvas) {
    const rect = drawCanvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      drawContext.clearRect(0, 0, rect.width, rect.height);
    }
  }
  clearLaserCanvas();
  currentStroke = null;
  activeHistoryStroke = null;
  drawHistory = [];
  drawingActive = false;
  laserActive = false;
  if (send) {
    sendMessage({ type: "draw", action: "clear" });
  }
}

function getCanvasPoint(event) {
  if (!drawCanvas) {
    return null;
  }
  const rect = drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return {
    x,
    y,
    normalizedX: x / rect.width,
    normalizedY: y / rect.height,
  };
}

function renderLaserPoint({ x, y, radius, color }) {
  if (!laserContext || !laserCanvas) {
    return;
  }
  const rect = laserCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const cx = x * rect.width;
  const cy = y * rect.height;
  const size = (radius ?? LASER_RADIUS_RATIO) * rect.width;
  laserContext.clearRect(0, 0, rect.width, rect.height);
  laserContext.save();
  laserContext.fillStyle = color ?? LASER_COLOR;
  laserContext.shadowColor = color ?? LASER_COLOR;
  laserContext.shadowBlur = size * 1.1;
  laserContext.beginPath();
  laserContext.arc(cx, cy, size, 0, Math.PI * 2);
  laserContext.fill();
  laserContext.restore();
  if (laserFadeTimer) {
    clearTimeout(laserFadeTimer);
  }
  laserFadeTimer = setTimeout(() => {
    laserFadeTimer = null;
    clearLaserCanvas();
  }, LASER_FADE_MS);
}

function recordDrawHistory(message) {
  if (message.action === "clear") {
    drawHistory = [];
    activeHistoryStroke = null;
    return;
  }
  if (message.action === "laser") {
    return;
  }
  const point = { x: message.x, y: message.y };
  if (message.action === "start") {
    const stroke = {
      color: message.color ?? DRAW_COLOR,
      size: message.size ?? DRAW_LINE_WIDTH_RATIO,
      points: [point],
    };
    drawHistory.push(stroke);
    activeHistoryStroke = stroke;
    return;
  }
  if (!activeHistoryStroke) {
    return;
  }
  activeHistoryStroke.points.push(point);
  if (message.action === "end") {
    activeHistoryStroke = null;
  }
}

function redrawDrawHistory() {
  if (!drawContext || !drawCanvas) {
    return;
  }
  const rect = drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  drawContext.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of drawHistory) {
    if (!stroke.points.length) {
      continue;
    }
    const size = stroke.size * rect.width;
    const color = stroke.color;
    const [first, ...rest] = stroke.points;
    const startX = first.x * rect.width;
    const startY = first.y * rect.height;
    drawContext.fillStyle = color;
    drawContext.beginPath();
    drawContext.arc(startX, startY, size / 2, 0, Math.PI * 2);
    drawContext.fill();
    if (!rest.length) {
      continue;
    }
    drawContext.strokeStyle = color;
    drawContext.lineWidth = size;
    drawContext.beginPath();
    drawContext.moveTo(startX, startY);
    for (const point of rest) {
      drawContext.lineTo(point.x * rect.width, point.y * rect.height);
    }
    drawContext.stroke();
  }
}

function renderDrawMessage(message) {
  if (!drawContext || !drawCanvas) {
    return;
  }
  if (message.action === "laser") {
    renderLaserPoint(message);
    return;
  }
  recordDrawHistory(message);
  if (message.action === "clear") {
    clearDrawings({ send: false });
    return;
  }
  const rect = drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const x = message.x * rect.width;
  const y = message.y * rect.height;
  const size = (message.size ?? DRAW_LINE_WIDTH_RATIO) * rect.width;
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
}

function setDrawColor(color, { fromPicker = false } = {}) {
  if (!color || typeof color !== "string") {
    return;
  }
  activeDrawColor = color;
  if (colorPickerInput && colorPickerInput.value !== color) {
    colorPickerInput.value = color;
  }
  colorButtons.forEach((button) => {
    const isActive = button.dataset.color === color && !fromPicker;
    button.classList.toggle("presenter__color--active", isActive);
  });
  if (fromPicker) {
    colorButtons.forEach((button) => {
      button.classList.remove("presenter__color--active");
    });
  }
}

function setActiveTool(tool) {
  activeTool = activeTool === tool ? "none" : tool;
  if (previewSection) {
    previewSection.classList.toggle("presenter__preview--drawing", activeTool !== "none");
  }
  toolButtons.forEach((button) => {
    const isActive = button.dataset.tool === activeTool;
    button.classList.toggle("presenter__button--active", isActive);
  });
  if (activeTool === "none") {
    drawingActive = false;
    laserActive = false;
  }
}

function setClearPopoverOpen(open) {
  if (!clearPopover || !clearToggleButton) {
    return;
  }
  clearPopover.dataset.open = open ? "true" : "false";
  clearPopover.setAttribute("aria-hidden", open ? "false" : "true");
  clearToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeClearPopover() {
  setClearPopoverOpen(false);
}

function setResetPopoverOpen(open) {
  if (!resetPopover || !resetToggleButton) {
    return;
  }
  resetPopover.dataset.open = open ? "true" : "false";
  resetPopover.setAttribute("aria-hidden", open ? "false" : "true");
  resetToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeResetPopover() {
  setResetPopoverOpen(false);
}

function sendDrawMessage(payload) {
  sendMessage({ type: "draw", ...payload });
}

function handleDrawPointerDown(event) {
  if (activeTool === "draw") {
    if (event.button !== 0) {
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    drawingActive = true;
    drawCanvas?.setPointerCapture(event.pointerId);
    const message = {
      action: "start",
      x: point.normalizedX,
      y: point.normalizedY,
      color: activeDrawColor,
      size: DRAW_LINE_WIDTH_RATIO,
    };
    renderDrawMessage(message);
    sendDrawMessage(message);
    return;
  }

  if (activeTool === "laser") {
    laserActive = true;
    drawCanvas?.setPointerCapture(event.pointerId);
    handleLaserMove(event, true);
  }
}

function handleLaserMove(event, forceSend = false) {
  const point = getCanvasPoint(event);
  if (!point) {
    return;
  }
  const now = performance.now();
  if (!forceSend && now - lastLaserSent < LASER_SEND_THROTTLE_MS) {
    return;
  }
  lastLaserSent = now;
  const message = {
    action: "laser",
    x: point.normalizedX,
    y: point.normalizedY,
    color: LASER_COLOR,
    radius: LASER_RADIUS_RATIO,
  };
  renderLaserPoint(message);
  sendDrawMessage(message);
}

function handleDrawPointerMove(event) {
  if (activeTool === "draw" && drawingActive) {
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    const now = performance.now();
    if (now - lastDrawSent < DRAW_SEND_THROTTLE_MS) {
      return;
    }
    lastDrawSent = now;
    const message = { action: "move", x: point.normalizedX, y: point.normalizedY };
    renderDrawMessage(message);
    sendDrawMessage(message);
    return;
  }

  if (activeTool === "laser" && laserActive) {
    handleLaserMove(event);
  }
}

function handleDrawPointerUp(event) {
  if (activeTool === "draw" && drawingActive) {
    const point = getCanvasPoint(event);
    drawingActive = false;
    drawCanvas?.releasePointerCapture(event.pointerId);
    if (!point) {
      currentStroke = null;
      return;
    }
    const message = { action: "end", x: point.normalizedX, y: point.normalizedY };
    renderDrawMessage(message);
    sendDrawMessage(message);
    return;
  }

  if (activeTool === "laser" && laserActive) {
    laserActive = false;
    drawCanvas?.releasePointerCapture(event.pointerId);
  }
}

function attachDrawingHandlers() {
  if (!drawCanvas || !previewStage) {
    return;
  }
  resizePreviewCanvases();
  if (previewResizeObserver) {
    previewResizeObserver.disconnect();
  }
  if (typeof ResizeObserver !== "undefined") {
    previewResizeObserver = new ResizeObserver(() => {
      resizePreviewCanvases();
    });
    previewResizeObserver.observe(previewStage);
  } else {
    window.addEventListener("resize", resizePreviewCanvases);
  }
  drawCanvas.addEventListener("pointerdown", handleDrawPointerDown);
  drawCanvas.addEventListener("pointermove", handleDrawPointerMove);
  drawCanvas.addEventListener("pointerup", handleDrawPointerUp);
  drawCanvas.addEventListener("pointercancel", handleDrawPointerUp);
  drawCanvas.addEventListener("pointerleave", handleDrawPointerUp);
}

function setNotesDisplay(content, status) {
  if (notesContent) {
    notesContent.textContent = content;
  }
  if (notesStatus) {
    notesStatus.textContent = status;
  }
}

function resolveNotesKey(slideId, hash) {
  return hash || slideId || "#";
}

function hasVisibleNotes() {
  if (!notesContent) {
    return false;
  }
  const content = notesContent.textContent;
  return (
    content &&
    content !== NOTES_LOADING_TEXT &&
    content !== NOTES_EMPTY_TEXT &&
    content !== NOTES_DISABLED_TEXT &&
    content !== "Waiting for slide updates…" &&
    content !== "Unable to load notes."
  );
}

async function fetchNotesForKey(notesKey) {
  if (!notesContent || !notesStatus) {
    return;
  }
  notesLoadingKey = notesKey;
  if (!hasVisibleNotes()) {
    setNotesDisplay(NOTES_LOADING_TEXT, "Loading");
  }

  try {
    const url = new URL("/_/api/notes", location.origin);
    url.searchParams.set("hash", notesKey);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load notes (${response.status})`);
    }
    const data = await response.json();
    const notes = typeof data?.notes === "string" ? data.notes : null;
    notesCache.set(notesKey, notes);

    if (notesLoadingKey !== notesKey || notesSource === "none") {
      return;
    }

    if (notes) {
      setNotesDisplay(notes, "Notes file");
    } else {
      setNotesDisplay(NOTES_EMPTY_TEXT, "No notes");
    }
  } catch (error) {
    if (notesLoadingKey !== notesKey) {
      return;
    }
    setNotesDisplay("Unable to load notes.", "Error");
  }
}

function updateNotes({ slideId, hash, notes }) {
  if (!notesContent || !notesStatus) {
    return;
  }

  const notesKey = resolveNotesKey(slideId, hash);
  if (!notesKey) {
    return;
  }
  lastNotesKey = notesKey;

  if (notesSource === "none") {
    setNotesDisplay(NOTES_DISABLED_TEXT, "Disabled");
    return;
  }

  const apiNotes = typeof notes === "string" ? notes : null;

  if (notesSource !== "files" && apiNotes) {
    notesCache.set(notesKey, apiNotes);
    setNotesDisplay(apiNotes, "Presentation");
    return;
  }

  if (notesSource === "api") {
    if (apiNotes) {
      setNotesDisplay(apiNotes, "Presentation");
    } else {
      setNotesDisplay(NOTES_EMPTY_TEXT, "No notes");
    }
    return;
  }

  if (notesCache.has(notesKey)) {
    const cachedNotes = notesCache.get(notesKey);
    if (cachedNotes) {
      setNotesDisplay(cachedNotes, "Notes file");
    } else {
      setNotesDisplay(NOTES_EMPTY_TEXT, "No notes");
    }
    return;
  }

  fetchNotesForKey(notesKey);
}

function updateSlideState({
  slideId,
  hash,
  displays,
  notes,
  viewport,
  sessionId: incomingSessionId,
}) {
  if (sessionId && incomingSessionId && incomingSessionId !== sessionId) {
    requestHardReload();
    return;
  }

  updatePreviewAspectRatio(viewport);

  const stateKey = slideId || hash || "—";
  updateSlideIndicator(stateKey);

  const previousHash = lastKnownHash;
  const nextHash = hash || slideId || "#";
  lastKnownHash = nextHash;
  updatePreview(nextHash);
  updateNotes({ slideId, hash: nextHash, notes });
  updateNextPreview({ slideId, hash: nextHash });

  if (typeof displays === "number") {
    lastDisplayCount = displays;
    displayCountDisplay.textContent = displays;
    previewPlaceholder.textContent =
      displays > 0
        ? "Display connected. Presenter controls are active."
        : "Waiting for display connection…";
    setPreviewActive(previewSection, displays > 0);
    setPreviewActive(nextPreviewSection, displays > 0);
  }

  if (stateKey !== lastSlideId || nextHash !== previousHash) {
    const previousSlideId = lastSlideId;
    lastSlideId = stateKey;
    clearDrawings({ send: true });
    if (!timerStarted) {
      if (timerMode === "countdown") {
        if (!countdownStartSlide) {
          countdownStartSlide = stateKey;
          updateTimerToggleLabel();
          return;
        }
        if (previousSlideId === countdownStartSlide) {
          timerStarted = true;
          startTimer();
          ensureTimerInterval();
        }
      } else {
        timerStarted = true;
        startTimer();
        ensureTimerInterval();
      }
    }
  }
}

function handleMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return;
  }

  if (message.type === "config") {
    applyConfig(message.config ?? {});
    return;
  }

  if (message.type === "state") {
    updateSlideState(message);
    return;
  }

  if (message.type === "sync") {
    lastDisplayCount = message.displays;
    displayCountDisplay.textContent = message.displays;
    previewPlaceholder.textContent =
      message.displays > 0
        ? "Display connected. Presenter controls are active."
        : "Waiting for display connection…";
    setPreviewActive(previewSection, message.displays > 0);
    setPreviewActive(nextPreviewSection, message.displays > 0);
    updatePreview(lastKnownHash);
    updateNotes({ slideId: lastSlideId, hash: lastKnownHash });
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
    return;
  }

  if (message.type === "reload") {
    window.location.reload();
  }
}

function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.textContent = "Connected";
    connectionStatus.style.color = "var(--presenter-connection-ok)";
  } else {
    connectionStatus.textContent = "Disconnected";
    connectionStatus.style.color = "var(--presenter-connection-warn)";
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

function connect() {
  if (ws) {
    ws.close();
  }

  ws = new WebSocket(getWebSocketUrl());
  ws.addEventListener("open", () => {
    updateConnectionStatus(true);
    const registerMessage = { type: "register", role: "presenter" };
    if (presenterKey) {
      registerMessage.key = presenterKey;
    }
    sendMessage(registerMessage);
  });

  ws.addEventListener("message", handleMessage);

  ws.addEventListener("close", () => {
    updateConnectionStatus(false);
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    updateConnectionStatus(false);
    scheduleReconnect();
  });
}

function handleKeyboard(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }

  const action =
    keyboardMap.get(event.key) ||
    keyboardMap.get(event.key.toLowerCase()) ||
    keyboardMap.get(event.key.toUpperCase());

  if (action) {
    event.preventDefault();
    sendCommand(action);
    return;
  }

  switch (event.key) {
    case "t":
    case "T":
      event.preventDefault();
      toggleTimer();
      break;
    case "r":
    case "R":
      event.preventDefault();
      resetTimer();
      break;
    default:
      break;
  }
}

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action) {
      sendCommand(action);
    }
  });
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.tool;
    if (tool) {
      setActiveTool(tool);
    }
  });
});

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.color;
    if (color) {
      setDrawColor(color);
      if (activeTool !== "draw") {
        setActiveTool("draw");
      }
    }
  });
});

if (colorPickerInput) {
  colorPickerInput.addEventListener("input", () => {
    setDrawColor(colorPickerInput.value, { fromPicker: true });
    if (activeTool !== "draw") {
      setActiveTool("draw");
    }
  });
}

if (clearToggleButton) {
  clearToggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = clearPopover?.dataset.open === "true";
    setClearPopoverOpen(!isOpen);
  });
}

clearConfirmButton?.addEventListener("click", () => {
  clearDrawings({ send: true });
  closeClearPopover();
});

clearCancelButton?.addEventListener("click", () => {
  closeClearPopover();
});

if (resetToggleButton) {
  resetToggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = resetPopover?.dataset.open === "true";
    setResetPopoverOpen(!isOpen);
  });
}

resetConfirmButton?.addEventListener("click", () => {
  resetTimer();
  closeResetPopover();
});

resetCancelButton?.addEventListener("click", () => {
  closeResetPopover();
});

document.addEventListener("click", (event) => {
  if (clearPopover?.dataset.open === "true") {
    if (!clearPopover.contains(event.target) && !clearToggleButton?.contains(event.target)) {
      closeClearPopover();
    }
  }
  if (resetPopover?.dataset.open === "true") {
    if (!resetPopover.contains(event.target) && !resetToggleButton?.contains(event.target)) {
      closeResetPopover();
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeClearPopover();
    closeResetPopover();
  }
});

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload || payload.type !== "miniPresenterPreviewReady") {
    return;
  }
  if (previewFrame && event.source === previewFrame.contentWindow) {
    previewReady = true;
  }
  if (nextPreviewFrame && event.source === nextPreviewFrame.contentWindow) {
    nextPreviewReady = true;
  }
});

if (previewFrame) {
  previewFrame.addEventListener("load", () => {
    previewReady = false;
    syncTitleFromPreview();
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
  });
}

if (nextPreviewFrame) {
  nextPreviewFrame.addEventListener("load", () => {
    nextPreviewReady = false;
    handleRelativeNextPreviewLoad();
  });
}

timerToggleButton.addEventListener("click", toggleTimer);

if (timerResetButton) {
  timerResetButton.addEventListener("click", () => {
    resetTimer();
  });
}

document.addEventListener("keydown", handleKeyboard);

updateTimerDisplay();
updateConnectionStatus(false);
ensureTimerInterval();
setPreviewActive(previewSection, false);
setPreviewActive(nextPreviewSection, false);
updatePreview(lastKnownHash);
setNotesDisplay("Waiting for slide updates…", "Idle");
setNextPreviewPlaceholder(NEXT_PREVIEW_WAITING_TEXT);
attachDrawingHandlers();
setDrawColor(DRAW_COLOR);
setActiveTool("none");
connect();

window.addEventListener("beforeunload", () => {
  stopTimerInterval();
  if (ws) {
    ws.close();
  }
});
