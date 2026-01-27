const timerDisplay = document.querySelector("#timer");
const currentSlideDisplay = document.querySelector("#current-slide");
const displayCountDisplay = document.querySelector("#display-count");
const connectionStatus = document.querySelector("#connection-status");
const previewPlaceholder = document.querySelector("#preview-placeholder");
const previewSection = document.querySelector(".presenter__preview");
const previewFrame = document.querySelector("#preview-frame");
const timerToggleButton = document.querySelector("#timer-toggle");
const timerResetButton = document.querySelector("#timer-reset");
const actionButtons = document.querySelectorAll("[data-action]");
const brandDisplay = document.querySelector(".presenter__brand");
const notesStatus = document.querySelector("#notes-status");
const notesContent = document.querySelector("#notes-content");

const RECONNECT_DELAY_MS = 1000;
const TIMER_INTERVAL_MS = 250;
const PREVIEW_QUERY = "_presenter_preview=1";
const NOTES_LOADING_TEXT = "Loading notes…";
const NOTES_EMPTY_TEXT = "No notes for this slide.";
const NOTES_DISABLED_TEXT = "Speaker notes disabled.";

const DEFAULT_KEYBOARD = {
  next: ["ArrowRight", "PageDown", " ", "Spacebar"],
  prev: ["ArrowLeft", "PageUp"],
  first: ["Home"],
  last: ["End"],
};

let ws = null;
let reconnectTimer = null;
let timerInterval = null;
let timerRunning = false;
let timerStarted = false;
let timerElapsed = 0;
let lastTick = 0;
let lastSlideId = null;
let lastKnownHash = "#";
let previewHash = null;
let keyboardMap = new Map();
let notesSource = "auto";
let lastNotesKey = null;
let notesLoadingKey = null;
const notesCache = new Map();

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

function applyConfig(config) {
  const title = typeof config?.title === "string" ? config.title : null;
  if (title && brandDisplay) {
    brandDisplay.textContent = title;
    document.title = title;
  }

  const keyboardConfig = normalizeKeyboardConfig(config?.keyboard);
  keyboardMap = buildKeyboardMap(keyboardConfig);

  const source = config?.notes?.source;
  if (source === "api" || source === "files" || source === "none") {
    notesSource = source;
  } else {
    notesSource = "auto";
  }

  if (lastSlideId || lastKnownHash !== "#") {
    updateNotes({ slideId: lastSlideId, hash: lastKnownHash });
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

function updateTimerDisplay() {
  timerDisplay.textContent = formatDuration(timerElapsed);
}

function startTimer() {
  if (timerRunning) {
    return;
  }
  timerRunning = true;
  lastTick = Date.now();
  timerToggleButton.textContent = "⏱ Pause";
}

function pauseTimer() {
  if (!timerRunning) {
    return;
  }
  timerRunning = false;
  timerToggleButton.textContent = "⏱ Resume";
}

function toggleTimer() {
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
}

function tickTimer() {
  if (!timerRunning) {
    return;
  }
  const now = Date.now();
  timerElapsed += now - lastTick;
  lastTick = now;
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

function setPreviewActive(active) {
  if (!previewSection) {
    return;
  }
  previewSection.classList.toggle("presenter__preview--active", active);
}

function updatePreview(hash) {
  if (!previewFrame) {
    return;
  }

  const previewUrl = `${location.origin}/?${PREVIEW_QUERY}`;
  const nextHash = hash || "#";

  if (previewHash === nextHash && previewFrame.src) {
    return;
  }
  previewHash = nextHash;

  try {
    const frameLocation = previewFrame.contentWindow?.location;
    if (frameLocation && frameLocation.origin === location.origin) {
      frameLocation.hash = nextHash;
      return;
    }
  } catch (error) {
    // ignore cross-origin/frame not ready
  }

  previewFrame.src = `${previewUrl}${nextHash}`;
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

async function fetchNotesForKey(notesKey) {
  if (!notesContent || !notesStatus) {
    return;
  }
  notesLoadingKey = notesKey;
  setNotesDisplay(NOTES_LOADING_TEXT, "Loading");

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

function updateSlideState({ slideId, hash, displays, notes }) {
  const stateKey = slideId || hash || "—";
  currentSlideDisplay.textContent = stateKey;

  const nextHash = hash || slideId || "#";
  lastKnownHash = nextHash;
  updatePreview(nextHash);
  updateNotes({ slideId, hash: nextHash, notes });

  if (typeof displays === "number") {
    displayCountDisplay.textContent = displays;
    previewPlaceholder.textContent =
      displays > 0
        ? "Display connected. Presenter controls are active."
        : "Waiting for display connection…";
    setPreviewActive(displays > 0);
  }

  if (stateKey !== lastSlideId) {
    lastSlideId = stateKey;
    if (!timerStarted) {
      timerStarted = true;
      startTimer();
      ensureTimerInterval();
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
    displayCountDisplay.textContent = message.displays;
    previewPlaceholder.textContent =
      message.displays > 0
        ? "Display connected. Presenter controls are active."
        : "Waiting for display connection…";
    setPreviewActive(message.displays > 0);
    updatePreview(lastKnownHash);
    updateNotes({ slideId: lastSlideId, hash: lastKnownHash });
  }
}

function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.textContent = "Connected";
    connectionStatus.style.color = "#34d399";
  } else {
    connectionStatus.textContent = "Disconnected";
    connectionStatus.style.color = "#fbbf24";
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
    sendMessage({ type: "register", role: "presenter" });
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

timerToggleButton.addEventListener("click", toggleTimer);

timerResetButton.addEventListener("click", () => {
  resetTimer();
});

document.addEventListener("keydown", handleKeyboard);

updateTimerDisplay();
updateConnectionStatus(false);
ensureTimerInterval();
setPreviewActive(false);
updatePreview(lastKnownHash);
setNotesDisplay("Waiting for slide updates…", "Idle");
connect();

window.addEventListener("beforeunload", () => {
  stopTimerInterval();
  if (ws) {
    ws.close();
  }
});
