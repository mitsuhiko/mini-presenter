const presenterRoot = document.querySelector(".presenter");
const presenterMain = document.querySelector(".presenter__main");
const timerDisplay = document.querySelector("#timer");
const timerSecondaryDisplay = document.querySelector("#timer-secondary");
const timerPaceDisplay = document.querySelector("#timer-pace");
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
const nextPreviewSpeakers = document.querySelector("#next-preview-speakers");
const timerToggleButton = document.querySelector("#timer-toggle");
const timerResetButton = document.querySelector("#timer-reset");
const actionButtons = document.querySelectorAll("[data-action]");
const toolButtons = document.querySelectorAll("[data-tool]");
const colorButtons = document.querySelectorAll(".presenter__color[data-color]");
const colorPickerInput = document.querySelector("#draw-color-picker");
const sizeSlider = document.querySelector("#draw-size-slider");
const clearToggleButton = document.querySelector("#clear-toggle");
const clearConfirmButton = document.querySelector("#clear-confirm");
const clearCancelButton = document.querySelector("#clear-cancel");
const clearPopover = document.querySelector("#clear-popover");
const resetToggleButton = document.querySelector("#reset-toggle");
const resetConfirmButton = document.querySelector("#reset-confirm");
const resetCancelButton = document.querySelector("#reset-cancel");
const resetPopover = document.querySelector("#reset-popover");
const exportButton = document.querySelector("#export-pdf");
const recordingToggleButton = document.querySelector("#recording-toggle");
const recordingPlayButton = document.querySelector("#recording-play");
const recordingConfirmPopover = document.querySelector("#recording-confirm-popover");
const recordingConfirmButton = document.querySelector("#recording-confirm");
const recordingCancelButton = document.querySelector("#recording-cancel");
const settingsButton = document.querySelector("#settings-toggle");
const settingsOverlay = document.querySelector("#settings-overlay");
const settingsPanel = document.querySelector("#settings-panel");
const settingsCloseButton = document.querySelector("#settings-close");
const settingsSaveButton = document.querySelector("#settings-save");
const settingsFileLabel = document.querySelector("#settings-file");
const settingsDirtyIndicator = document.querySelector("#settings-dirty");
const settingsStatus = document.querySelector("#settings-status");
const settingsJsonToggle = document.querySelector("#settings-json-toggle");
const settingsViews = document.querySelectorAll("[data-settings-view]");
const settingsTitleInput = document.querySelector("#settings-title-input");
const settingsKeyNext = document.querySelector("#settings-key-next");
const settingsKeyPrev = document.querySelector("#settings-key-prev");
const settingsKeyFirst = document.querySelector("#settings-key-first");
const settingsKeyLast = document.querySelector("#settings-key-last");
const settingsKeyFullscreen = document.querySelector("#settings-key-fullscreen");
const settingsKeyPresenter = document.querySelector("#settings-key-presenter");
const settingsKeyQuestions = document.querySelector("#settings-key-questions");
const hotkeyCaptureButtons = document.querySelectorAll("[data-hotkey-capture]");
const settingsNotesSource = document.querySelector("#settings-notes-source");
const settingsPreviewRelative = document.querySelector("#settings-preview-relative");
const settingsTimerMode = document.querySelector("#settings-timer-mode");
const settingsTimerMinutes = document.querySelector("#settings-timer-minutes");
const settingsTimerSeconds = document.querySelector("#settings-timer-seconds");
const settingsRecordingToggle = document.querySelector("#settings-recording-toggle");
const settingsRecordingStatus = document.querySelector("#settings-recording-status");
const settingsRecordingConfirmPopover = document.querySelector("#settings-recording-confirm-popover");
const settingsRecordingConfirmButton = document.querySelector("#settings-recording-confirm");
const settingsRecordingCancelButton = document.querySelector("#settings-recording-cancel");
const settingsKeyRecording = document.querySelector("#settings-key-recording");
const settingsRecordingDevice = document.querySelector("#settings-recording-device");
const settingsJson = document.querySelector("#settings-json");
const settingsJsonStatus = document.querySelector("#settings-json-status");
let faviconLink = document.querySelector("#presenter-favicon");
const brandDisplay = document.querySelector(".presenter__brand");
const notesStatus = document.querySelector("#notes-status");
const notesSpeakers = document.querySelector("#notes-speakers");
const notesContent = document.querySelector("#notes-content");
const mainSplitter = document.querySelector("#presenter-main-splitter");
const notesSplitter = document.querySelector("#presenter-notes-splitter");
const questionsToggleButton = document.querySelector("#questions-toggle");
const questionsCountBadge = document.querySelector("#questions-count");
const questionsOverlay = document.querySelector("#questions-overlay");
const questionsCloseButton = document.querySelector("#questions-close");
const questionsRefreshButton = document.querySelector("#questions-refresh");
const questionsOpenQrButton = document.querySelector("#questions-open-qr");
const questionsList = document.querySelector("#questions-list");
const questionsStatus = document.querySelector("#questions-status");
const questionsConfirmOverlay = document.querySelector("#questions-confirm");
const questionsConfirmDelete = document.querySelector("#questions-confirm-delete");
const questionsConfirmCancel = document.querySelector("#questions-confirm-cancel");

const RECONNECT_DELAY_MS = 1000;
const TIMER_INTERVAL_MS = 250;
const PREVIEW_QUERY = "_presenter_preview";
const NOTES_LOADING_TEXT = "Loading notes…";
const NOTES_EMPTY_TEXT = "No notes for this slide.";
const NOTES_DISABLED_TEXT = "Speaker notes disabled.";
const NEXT_PREVIEW_WAITING_TEXT = "Waiting for display connection…";
const NEXT_PREVIEW_UNAVAILABLE_TEXT = "Next slide preview unavailable.";
const NEXT_PREVIEW_LAST_TEXT = "End of deck.";
const NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT = "No speaker assigned.";
const SPEAKER_MARKER_PATTERN = /^\s*@([^:\n]+?)\s*:\s*(.*)$/u;

const DRAW_COLOR = "#ff4d4d";
const DRAW_LINE_WIDTH_RATIO = 0.004;
const LASER_COLOR = "#ffdd4d";
const LASER_RADIUS_RATIO = 0.012;
const LASER_FADE_MS = 180;
const LASER_SEND_THROTTLE_MS = 25;
const DRAW_SEND_THROTTLE_MS = 16;
const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm"];
const RECORD_SYMBOL = "●";
const PLAY_SYMBOL = "▶";
const STOP_SYMBOL = "■";

const presenterKey = getPresenterKey();

function getRuntimeHelpers() {
  return window.miniPresenterRuntime ?? null;
}

function applyRuntimeConfig(config) {
  const runtime = getRuntimeHelpers();
  if (runtime && typeof runtime.applyConfig === "function") {
    runtime.applyConfig(config);
  }
}

function getRuntimeUrl(name, fallbackPath) {
  const runtime = getRuntimeHelpers();
  const url = runtime?.getUrl?.(name, window.location.origin);
  if (typeof url === "string" && url) {
    return url;
  }
  return new URL(fallbackPath, window.location.origin).toString();
}

function getRuntimeApiUrl(name, fallbackPath) {
  const runtime = getRuntimeHelpers();
  const url = runtime?.getApiUrl?.(name, window.location.origin);
  if (typeof url === "string" && url) {
    return url;
  }
  return new URL(fallbackPath, window.location.origin).toString();
}

function getRuntimeSnapshot() {
  const runtime = getRuntimeHelpers();
  const value = runtime?.getRuntime?.();
  return value && typeof value === "object" ? value : {};
}

function isLocalMode() {
  const runtime = getRuntimeHelpers();
  if (runtime?.getMode?.() === "local") {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("mp_mode") === "local";
}

function getLocalSessionIdHint() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("mp_session");
  if (typeof fromUrl === "string" && fromUrl) {
    return fromUrl;
  }
  const runtimeSnapshot = getRuntimeSnapshot();
  if (typeof runtimeSnapshot.local?.sessionId === "string" && runtimeSnapshot.local.sessionId) {
    return runtimeSnapshot.local.sessionId;
  }
  return null;
}

function getPreviewDeckUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("mp_deck");
  if (typeof fromQuery === "string" && fromQuery) {
    return fromQuery;
  }
  const runtimeSnapshot = getRuntimeSnapshot();
  if (typeof runtimeSnapshot.local?.deckUrl === "string" && runtimeSnapshot.local.deckUrl) {
    return runtimeSnapshot.local.deckUrl;
  }
  return `${window.location.origin}/`;
}

function initializeLocalRuntimeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mp_mode") !== "local") {
    return;
  }

  const runtime = getRuntimeHelpers();
  if (!runtime || typeof runtime.setRuntime !== "function") {
    return;
  }

  const snapshot = getRuntimeSnapshot();
  const local = snapshot.local && typeof snapshot.local === "object" ? snapshot.local : {};
  const sessionFromQuery = params.get("mp_session");
  const deckFromQuery = params.get("mp_deck");

  runtime.setRuntime({
    mode: "local",
    local: {
      ...local,
      ...(sessionFromQuery ? { sessionId: sessionFromQuery } : {}),
      ...(deckFromQuery ? { deckUrl: deckFromQuery } : {}),
    },
    capabilities: {
      questions: false,
      export: false,
      recordingPersistence: false,
      configSave: false,
    },
  });
}

initializeLocalRuntimeFromQuery();

function addPresenterKey(urlString) {
  const url = new URL(urlString, window.location.origin);
  if (presenterKey) {
    url.searchParams.set("key", presenterKey);
  }
  return url;
}

function buildExportUrl(format) {
  const url = addPresenterKey(getRuntimeApiUrl("export", "/_/api/export"));
  if (format) {
    url.searchParams.set("format", format);
  }
  return url.toString();
}

function buildConfigUrl() {
  return addPresenterKey(getRuntimeApiUrl("config", "/_/api/config")).toString();
}

function buildRecordingUrl(pathname = "") {
  const suffix = pathname.startsWith("/") ? pathname : pathname ? `/${pathname}` : "";
  const url = addPresenterKey(getRuntimeApiUrl("recording", "/_/api/recording"));
  if (suffix) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}${suffix}`;
  }
  return url.toString();
}

const DEFAULT_KEYBOARD = {
  next: ["ArrowRight", "PageDown", " ", "Spacebar"],
  prev: ["ArrowLeft", "PageUp"],
  first: ["Home"],
  last: ["End"],
};

const DEFAULT_SHORTCUTS = {
  fullscreen: ["f"],
  presenter: ["p"],
  questions: ["q"],
  recording: ["Shift+R"],
};

const QUESTIONS_POLL_INTERVAL_MS = 6000;
const COMPACT_LAYOUT_MEDIA_QUERY = "(max-width: 720px)";
const MAIN_SPLIT_STORAGE_KEY = "miniPresenter.layout.mainSplitRatio";
const NOTES_SPLIT_STORAGE_KEY = "miniPresenter.layout.notesSplitRatio";
const DEFAULT_MAIN_SPLIT_RATIO = 2.3 / 3.3;
const DEFAULT_NOTES_SPLIT_RATIO = 0.22;
const MIN_MAIN_SPLIT_RATIO = 0.45;
const MAX_MAIN_SPLIT_RATIO = 0.82;
const MIN_NOTES_SPLIT_RATIO = 0;
const MIN_NOTES_SPLIT_PX = 24;
const MAX_NOTES_SPLIT_RATIO = 0.45;
const SPLITTER_KEYBOARD_STEP = 0.02;
const compactLayoutMedia = window.matchMedia(COMPACT_LAYOUT_MEDIA_QUERY);
const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

const KEY_MODIFIER_OPTIONS = ["Meta", "Control", "Alt", "Shift"];
const KEY_AUTOCOMPLETE_OPTIONS = [
  "ArrowRight",
  "ArrowLeft",
  "ArrowUp",
  "ArrowDown",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  "Space",
  "Spacebar",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  ...KEY_MODIFIER_OPTIONS,
  ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)),
  ...Array.from({ length: 10 }, (_, index) => String(index)),
];

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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredRatio(key, fallback, min, max) {
  try {
    const value = Number.parseFloat(window.localStorage.getItem(key) ?? "");
    if (Number.isFinite(value)) {
      return clampNumber(value, min, max);
    }
  } catch {
    // Ignore storage access failures.
  }
  return fallback;
}

function writeStoredRatio(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage access failures.
  }
}

function isCompactPresenterLayout() {
  return compactLayoutMedia.matches;
}

function getPresenterUsableHeight() {
  if (!presenterRoot) {
    return 0;
  }
  const rect = presenterRoot.getBoundingClientRect();
  const styles = window.getComputedStyle(presenterRoot);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, rect.height - paddingTop - paddingBottom);
}

function getMinNotesSplitRatio() {
  const usableHeight = getPresenterUsableHeight();
  if (!usableHeight) {
    return MIN_NOTES_SPLIT_RATIO;
  }
  return clampNumber(MIN_NOTES_SPLIT_PX / usableHeight, MIN_NOTES_SPLIT_RATIO, MAX_NOTES_SPLIT_RATIO);
}

function updateSplitterAria() {
  if (mainSplitter) {
    const percent = Math.round(mainSplitRatio * 100);
    mainSplitter.setAttribute("aria-valuemin", String(Math.round(MIN_MAIN_SPLIT_RATIO * 100)));
    mainSplitter.setAttribute("aria-valuemax", String(Math.round(MAX_MAIN_SPLIT_RATIO * 100)));
    mainSplitter.setAttribute("aria-valuenow", String(percent));
    mainSplitter.setAttribute("aria-valuetext", `Current slide ${percent}%, sidebar ${100 - percent}%`);
  }
  if (notesSplitter) {
    const minNotesSplitRatio = getMinNotesSplitRatio();
    const percent = Math.round(notesSplitRatio * 100);
    notesSplitter.setAttribute("aria-valuemin", String(Math.round(minNotesSplitRatio * 100)));
    notesSplitter.setAttribute("aria-valuemax", String(Math.round(MAX_NOTES_SPLIT_RATIO * 100)));
    notesSplitter.setAttribute("aria-valuenow", String(percent));
    notesSplitter.setAttribute("aria-valuetext", `Speaker notes ${percent}%, main area ${100 - percent}%`);
  }
}

function applyPresenterLayout() {
  const minNotesSplitRatio = getMinNotesSplitRatio();
  mainSplitRatio = clampNumber(mainSplitRatio, MIN_MAIN_SPLIT_RATIO, MAX_MAIN_SPLIT_RATIO);
  notesSplitRatio = clampNumber(notesSplitRatio, minNotesSplitRatio, MAX_NOTES_SPLIT_RATIO);

  if (!presenterRoot || !presenterMain) {
    updateSplitterAria();
    return;
  }

  if (isCompactPresenterLayout()) {
    presenterRoot.style.gridTemplateRows = "";
    presenterMain.style.gridTemplateColumns = "";
    updateSplitterAria();
    return;
  }

  presenterRoot.style.gridTemplateRows = `minmax(0, ${(1 - notesSplitRatio) * 100}fr) var(--presenter-splitter-size) minmax(0, ${notesSplitRatio * 100}fr)`;
  presenterMain.style.gridTemplateColumns = `minmax(0, ${mainSplitRatio * 100}fr) var(--presenter-splitter-size) minmax(18rem, ${(1 - mainSplitRatio) * 100}fr)`;
  updateSplitterAria();
  resizePreviewCanvases();
}

function persistPresenterLayout() {
  writeStoredRatio(MAIN_SPLIT_STORAGE_KEY, mainSplitRatio);
  writeStoredRatio(NOTES_SPLIT_STORAGE_KEY, notesSplitRatio);
}

function updateMainSplitFromPointer(event) {
  if (!presenterMain) {
    return;
  }
  const rect = presenterMain.getBoundingClientRect();
  if (!rect.width) {
    return;
  }
  const offset = clampNumber(
    event.clientX - rect.left,
    rect.width * MIN_MAIN_SPLIT_RATIO,
    rect.width * MAX_MAIN_SPLIT_RATIO
  );
  mainSplitRatio = clampNumber(offset / rect.width, MIN_MAIN_SPLIT_RATIO, MAX_MAIN_SPLIT_RATIO);
}

function updateNotesSplitFromPointer(event) {
  if (!presenterRoot) {
    return;
  }
  const rect = presenterRoot.getBoundingClientRect();
  const styles = window.getComputedStyle(presenterRoot);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const usableHeight = getPresenterUsableHeight();
  const minNotesSplitRatio = getMinNotesSplitRatio();
  if (!usableHeight) {
    return;
  }
  const topOffset = clampNumber(
    event.clientY - rect.top - paddingTop,
    usableHeight * (1 - MAX_NOTES_SPLIT_RATIO),
    usableHeight * (1 - minNotesSplitRatio)
  );
  notesSplitRatio = clampNumber(1 - topOffset / usableHeight, minNotesSplitRatio, MAX_NOTES_SPLIT_RATIO);
}

function stopSplitterDrag() {
  if (!activeSplitterDrag) {
    return;
  }
  const { element, pointerId } = activeSplitterDrag;
  element?.removeAttribute("data-dragging");
  if (document.body) {
    delete document.body.dataset.resizing;
  }
  if (element && pointerId != null && typeof element.releasePointerCapture === "function") {
    try {
      if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore pointer capture cleanup failures.
    }
  }
  document.removeEventListener("pointermove", handleSplitterPointerMove);
  document.removeEventListener("pointerup", handleSplitterPointerUp);
  document.removeEventListener("pointercancel", handleSplitterPointerUp);
  activeSplitterDrag = null;
  persistPresenterLayout();
}

function handleSplitterPointerMove(event) {
  if (!activeSplitterDrag) {
    return;
  }
  if (activeSplitterDrag.type === "main") {
    updateMainSplitFromPointer(event);
  } else {
    updateNotesSplitFromPointer(event);
  }
  applyPresenterLayout();
}

function handleSplitterPointerUp(event) {
  if (!activeSplitterDrag) {
    return;
  }
  if (event.pointerId !== activeSplitterDrag.pointerId) {
    return;
  }
  stopSplitterDrag();
}

function startSplitterDrag(event, type, element) {
  if (!element || isCompactPresenterLayout()) {
    return;
  }
  event.preventDefault();
  stopSplitterDrag();
  activeSplitterDrag = { type, element, pointerId: event.pointerId };
  element.dataset.dragging = "true";
  if (document.body) {
    document.body.dataset.resizing = type === "main" ? "vertical" : "horizontal";
  }
  if (typeof element.setPointerCapture === "function") {
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures.
    }
  }
  document.addEventListener("pointermove", handleSplitterPointerMove);
  document.addEventListener("pointerup", handleSplitterPointerUp);
  document.addEventListener("pointercancel", handleSplitterPointerUp);
  handleSplitterPointerMove(event);
}

function nudgeSplitter(type, delta) {
  if (isCompactPresenterLayout()) {
    return;
  }
  if (type === "main") {
    mainSplitRatio = clampNumber(mainSplitRatio + delta, MIN_MAIN_SPLIT_RATIO, MAX_MAIN_SPLIT_RATIO);
  } else {
    const minNotesSplitRatio = getMinNotesSplitRatio();
    notesSplitRatio = clampNumber(notesSplitRatio + delta, minNotesSplitRatio, MAX_NOTES_SPLIT_RATIO);
  }
  applyPresenterLayout();
  persistPresenterLayout();
}

function handleSplitterKeyDown(event) {
  if (event.target === mainSplitter) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeSplitter("main", -SPLITTER_KEYBOARD_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeSplitter("main", SPLITTER_KEYBOARD_STEP);
      return;
    }
  }

  if (event.target === notesSplitter) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeSplitter("notes", SPLITTER_KEYBOARD_STEP);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeSplitter("notes", -SPLITTER_KEYBOARD_STEP);
    }
  }
}

function setupPresenterLayout() {
  mainSplitRatio = readStoredRatio(
    MAIN_SPLIT_STORAGE_KEY,
    DEFAULT_MAIN_SPLIT_RATIO,
    MIN_MAIN_SPLIT_RATIO,
    MAX_MAIN_SPLIT_RATIO
  );
  notesSplitRatio = readStoredRatio(
    NOTES_SPLIT_STORAGE_KEY,
    DEFAULT_NOTES_SPLIT_RATIO,
    MIN_NOTES_SPLIT_RATIO,
    MAX_NOTES_SPLIT_RATIO
  );
  applyPresenterLayout();
  mainSplitter?.addEventListener("pointerdown", (event) => {
    startSplitterDrag(event, "main", mainSplitter);
  });
  notesSplitter?.addEventListener("pointerdown", (event) => {
    startSplitterDrag(event, "notes", notesSplitter);
  });
  mainSplitter?.addEventListener("keydown", handleSplitterKeyDown);
  notesSplitter?.addEventListener("keydown", handleSplitterKeyDown);
  if (typeof compactLayoutMedia.addEventListener === "function") {
    compactLayoutMedia.addEventListener("change", applyPresenterLayout);
  } else if (typeof compactLayoutMedia.addListener === "function") {
    compactLayoutMedia.addListener(applyPresenterLayout);
  }
  window.addEventListener("resize", applyPresenterLayout);
}

function applyShortcutConfig(config) {
  const shortcuts = config?.shortcuts ?? {};
  shortcutConfig = {
    fullscreen: normalizeShortcutList(shortcuts.fullscreen, DEFAULT_SHORTCUTS.fullscreen),
    presenter: normalizeShortcutList(shortcuts.presenter, DEFAULT_SHORTCUTS.presenter),
    questions: normalizeShortcutList(shortcuts.questions, DEFAULT_SHORTCUTS.questions),
    recording: normalizeShortcutList(shortcuts.recording, DEFAULT_SHORTCUTS.recording),
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
  for (const shortcut of shortcutConfig.recording ?? []) {
    if (matchesShortcut(event, shortcut)) {
      return "recording";
    }
  }
  for (const shortcut of shortcutConfig.questions ?? []) {
    if (matchesShortcut(event, shortcut)) {
      return "questions";
    }
  }
  return null;
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getPresenterKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("key");
  if (urlKey) {
    return urlKey.trim();
  }

  if (params.get("mp_mode") === "local") {
    return null;
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

function cloneConfig(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function sanitizeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  const {
    sessionId: _sessionId,
    _runtime: _runtime,
    runtime: _legacyRuntime,
    ...rest
  } = config;
  return cloneConfig(rest);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function configsEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function parseKeyList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.toLowerCase() === "space" ? " " : item));
}

function formatKeyList(keys) {
  if (!Array.isArray(keys)) {
    return "";
  }
  return keys
    .map((item) => (item === " " ? "Space" : item))
    .join(", ");
}

function applyKeySuggestion(value, suggestion) {
  const parts = value.split(",");
  const tokens = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
  const lastPart = parts[parts.length - 1] ?? "";
  const rawSegments = lastPart.split("+").map((part) => part.trim());
  const prefixSegments = rawSegments.slice(0, -1).filter(Boolean);
  let nextToken = "";

  if (suggestion.endsWith("+")) {
    const modifier = suggestion.slice(0, -1);
    nextToken = [...prefixSegments, modifier, ""].join("+");
  } else {
    nextToken = [...prefixSegments, suggestion].join("+");
  }

  if (nextToken) {
    tokens.push(nextToken);
  }

  return tokens.join(", ");
}

function buildKeySuggestions(rawValue) {
  const parts = rawValue.split(",");
  const lastPart = parts[parts.length - 1] ?? "";
  const trimmed = lastPart.trim();
  const segments = trimmed.split("+").map((part) => part.trim());
  const prefixSegments = segments.slice(0, -1).filter(Boolean);
  const rawQuery = segments[segments.length - 1] ?? "";
  const query = rawQuery.toLowerCase();
  const usedModifiers = new Set(
    prefixSegments.map((segment) => segment.toLowerCase())
  );

  const modifierMatches = KEY_MODIFIER_OPTIONS.filter((modifier) => {
    const lower = modifier.toLowerCase();
    if (usedModifiers.has(lower)) {
      return false;
    }
    return query ? lower.startsWith(query) : true;
  }).map((modifier) => `${modifier}+`);

  const keyMatches = KEY_AUTOCOMPLETE_OPTIONS.filter((option) => {
    const lower = option.toLowerCase();
    if (KEY_MODIFIER_OPTIONS.map((item) => item.toLowerCase()).includes(lower)) {
      return false;
    }
    return query ? lower.startsWith(query) : true;
  });

  return [...modifierMatches, ...keyMatches];
}

function setupKeyAutocomplete(input) {
  if (!input || !input.parentElement) {
    return;
  }

  const container = document.createElement("div");
  container.className = "presenter__key-suggestions";
  container.dataset.open = "false";
  container.setAttribute("role", "listbox");
  input.parentElement.appendChild(container);

  const hide = () => {
    container.dataset.open = "false";
    container.innerHTML = "";
  };

  const render = (matches) => {
    container.innerHTML = "";
    matches.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "presenter__key-suggestion";
      button.textContent = option;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        input.value = applyKeySuggestion(input.value, option);
        hide();
        input.focus();
      });
      container.appendChild(button);
    });
    container.dataset.open = matches.length > 0 ? "true" : "false";
  };

  const update = () => {
    const matches = buildKeySuggestions(input.value);
    if (matches.length === 0) {
      hide();
      return;
    }
    render(matches);
  };

  let blurTimer = null;

  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
    }
  });
  input.addEventListener("blur", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
    }
    blurTimer = setTimeout(hide, 120);
  });
}

const HOTKEY_MODIFIER_KEYS = new Set(KEY_MODIFIER_OPTIONS);
let activeHotkeyCapture = null;

function normalizeCapturedKey(key) {
  if (key === " " || key === "Spacebar") {
    return "Space";
  }
  if (key === "Unidentified" || key === "Dead") {
    return null;
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

function buildCapturedShortcut(event) {
  const keyToken = normalizeCapturedKey(event.key);
  if (!keyToken || HOTKEY_MODIFIER_KEYS.has(keyToken)) {
    return null;
  }
  const parts = [];
  if (event.metaKey) {
    parts.push("Meta");
  }
  if (event.ctrlKey) {
    parts.push("Control");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  parts.push(keyToken);
  return parts.join("+");
}

function appendCapturedShortcut(value, shortcut) {
  const trimmed = value.trim();
  if (!trimmed) {
    return shortcut;
  }
  const normalized = trimmed.replace(/,\s*$/, "");
  return `${normalized}, ${shortcut}`;
}

function stopHotkeyCapture() {
  if (!activeHotkeyCapture) {
    return;
  }
  const { button } = activeHotkeyCapture;
  button.dataset.active = "false";
  button.textContent = "⌨︎";
  activeHotkeyCapture = null;
}

function startHotkeyCapture(input, button) {
  if (activeHotkeyCapture) {
    stopHotkeyCapture();
  }
  activeHotkeyCapture = { input, button };
  button.dataset.active = "true";
  button.textContent = "⌨︎";
  input.focus();
}

function setupHotkeyCapture(button) {
  if (!button) {
    return;
  }
  const targetId = button.dataset.hotkeyCapture;
  if (!targetId) {
    return;
  }
  const input = document.getElementById(targetId);
  if (!input) {
    return;
  }
  button.addEventListener("click", () => {
    if (activeHotkeyCapture?.button === button) {
      stopHotkeyCapture();
      return;
    }
    startHotkeyCapture(input, button);
  });
}

document.addEventListener(
  "keydown",
  (event) => {
    if (!activeHotkeyCapture) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      stopHotkeyCapture();
      return;
    }
    const shortcut = buildCapturedShortcut(event);
    if (!shortcut) {
      return;
    }
    const { input } = activeHotkeyCapture;
    input.value = appendCapturedShortcut(input.value, shortcut);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    stopHotkeyCapture();
  },
  true
);

document.addEventListener(
  "click",
  (event) => {
    if (!activeHotkeyCapture) {
      return;
    }
    const { button, input } = activeHotkeyCapture;
    if (button.contains(event.target) || input.contains(event.target)) {
      return;
    }
    stopHotkeyCapture();
  },
  true
);

let transport = null;
let reconnectTimer = null;
const TIMER_MODE_COUNTUP = "countup";
const TIMER_MODE_COUNTDOWN_TOTAL = "countdown-total";
const TIMER_MODE_COUNTDOWN_SLIDE = "countdown-slide";

let timerInterval = null;
let timerRunning = false;
let timerStarted = false;
let timerElapsed = 0;
let lastTick = 0;
let timerMode = TIMER_MODE_COUNTUP;
let countdownStartSlide = null;
let timerSlideDurations = new Map();
let timerSlideDurationsFromDom = new Map();
let timerDefaultSlideDuration = 0;
let timerTransitionDuration = 2000;
let timerExplicitTotalDuration = 0;
let currentSlideCountdownDuration = 0;
let currentSlideCountdownStartElapsed = 0;
let completedSlideTiming = [];
let sessionId = null;
let lastSlideId = null;
let lastKnownHash = "#";
let previewHash = null;
let previewReady = false;
let nextPreviewReady = false;
let keyboardMap = new Map();
let notesSource = "auto";
let notesLoadingKey = null;
const notesCache = new Map();
let currentSpeaker = null;
let nextPreviewSpeakersKey = null;
let nextPreviewSpeakerRequestId = 0;
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
let activeDrawSize = DRAW_LINE_WIDTH_RATIO;
let activeLaserColor = LASER_COLOR;
let activeLaserSize = LASER_RADIUS_RATIO;
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
let mainSplitRatio = DEFAULT_MAIN_SPLIT_RATIO;
let notesSplitRatio = DEFAULT_NOTES_SPLIT_RATIO;
let activeSplitterDrag = null;
let savedConfig = {};
let draftConfig = {};
let settingsDirty = false;
let settingsView = "ui";
let jsonIsValid = true;
let jsonEditing = false;
let settingsPanelHeight = null;
let shortcutConfig = { ...DEFAULT_SHORTCUTS };
let questionsPollingTimer = null;
let questionsAvailable = true;
let pendingDeleteQuestionId = null;
let recordingActive = false;
let recordingSaving = false;
let recordingPlaybackActive = false;
let recordingAvailable = false;
let recordingStartTime = 0;
let recordingEvents = [];
let recordingAudioChunks = [];
let recordingRecorder = null;
let recordingStream = null;
let recordingAudioMimeType = null;
let recordingDeviceId = null;
let playbackAudio = null;
let playbackEvents = [];
let playbackIndex = 0;
let playbackFrame = null;
let playbackStopRequested = false;
let cachedRecordingData = null;
let recordingStatusTimer = null;

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

function sendMessage(message) {
  transport?.send(message);
}

function sendCommand(action, hash) {
  sendMessage({ type: "command", action, hash });
}

function pickRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of RECORDING_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getRecordingTimestamp() {
  if (!recordingStartTime) {
    return 0;
  }
  return Math.max(0, performance.now() - recordingStartTime);
}

function recordEvent(payload) {
  if (!recordingActive || recordingPlaybackActive) {
    return;
  }
  recordingEvents.push({ time: Math.round(getRecordingTimestamp()), ...payload });
}

function recordSlideState({ slideId, hash }) {
  recordEvent({ type: "state", slideId: slideId ?? null, hash: hash ?? null });
}

function setRecordingStatus(message = "", { level = "info", timeout = 0 } = {}) {
  if (recordingStatusTimer) {
    clearTimeout(recordingStatusTimer);
    recordingStatusTimer = null;
  }
  if (settingsRecordingStatus) {
    settingsRecordingStatus.textContent = message;
    settingsRecordingStatus.dataset.level = level === "error" ? "error" : "info";
  }
  if (message && timeout) {
    recordingStatusTimer = setTimeout(() => {
      if (settingsRecordingStatus) {
        settingsRecordingStatus.textContent = "";
        settingsRecordingStatus.dataset.level = "info";
      }
      recordingStatusTimer = null;
    }, timeout);
  }
}

function setRecordingAvailability(available, data = null) {
  recordingAvailable = available;
  if (available && data) {
    cachedRecordingData = data;
  }
  updateRecordingControls();
}

function updateRecordingControls() {
  const isBusy = recordingSaving || recordingPlaybackActive;
  if (recordingToggleButton) {
    recordingToggleButton.textContent = recordingActive ? STOP_SYMBOL : RECORD_SYMBOL;
    recordingToggleButton.disabled = isBusy;
    recordingToggleButton.dataset.active = recordingActive ? "true" : "false";
    recordingToggleButton.setAttribute("aria-label", recordingActive ? "Stop recording" : "Record");
    recordingToggleButton.setAttribute("title", recordingActive ? "Stop recording" : "Record");
  }
  if (settingsRecordingToggle) {
    settingsRecordingToggle.textContent = recordingActive ? STOP_SYMBOL : RECORD_SYMBOL;
    settingsRecordingToggle.disabled = isBusy;
    settingsRecordingToggle.dataset.active = recordingActive ? "true" : "false";
    settingsRecordingToggle.setAttribute("aria-label", recordingActive ? "Stop recording" : "Record");
    settingsRecordingToggle.setAttribute("title", recordingActive ? "Stop recording" : "Record");
  }
  if (recordingPlayButton) {
    recordingPlayButton.textContent = recordingPlaybackActive ? STOP_SYMBOL : PLAY_SYMBOL;
    recordingPlayButton.disabled = !recordingAvailable || recordingActive || recordingSaving;
    recordingPlayButton.dataset.visible = recordingAvailable ? "true" : "false";
    recordingPlayButton.setAttribute(
      "aria-label",
      recordingPlaybackActive ? "Stop playback" : "Play recording"
    );
    recordingPlayButton.setAttribute(
      "title",
      recordingPlaybackActive ? "Stop playback" : "Play recording"
    );
  }
}

function stopRecordingStream() {
  if (recordingStream) {
    recordingStream.getTracks().forEach((track) => track.stop());
    recordingStream = null;
  }
}

function setRecordingConfirmOpen(popover, toggleButton, open) {
  if (!popover || !toggleButton) {
    return;
  }
  popover.dataset.open = open ? "true" : "false";
  popover.setAttribute("aria-hidden", open ? "false" : "true");
  toggleButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeRecordingConfirmPopovers() {
  setRecordingConfirmOpen(recordingConfirmPopover, recordingToggleButton, false);
  setRecordingConfirmOpen(settingsRecordingConfirmPopover, settingsRecordingToggle, false);
}

function shouldConfirmRecording() {
  return recordingAvailable && !recordingActive && !recordingSaving && !recordingPlaybackActive;
}

function requestRecordingStart(source) {
  if (recordingActive) {
    stopRecording();
    return;
  }
  if (shouldConfirmRecording()) {
    if (source === "settings") {
      setRecordingConfirmOpen(settingsRecordingConfirmPopover, settingsRecordingToggle, true);
    } else {
      setRecordingConfirmOpen(recordingConfirmPopover, recordingToggleButton, true);
    }
    return;
  }
  startRecording();
}

async function saveRecordingSession({ audioBlob, durationMs }) {
  const mimeType = recordingAudioMimeType || "audio/webm";
  const audioResponse = await fetch(buildRecordingUrl("audio"), {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: audioBlob,
  });
  if (!audioResponse.ok) {
    const message = await audioResponse.text().catch(() => "");
    throw new Error(message || `Audio save failed (${audioResponse.status})`);
  }

  const payload = {
    durationMs,
    audioMimeType: mimeType,
    events: recordingEvents,
  };

  const response = await fetch(buildRecordingUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Recording save failed (${response.status})`);
  }
  const data = await response.json().catch(() => null);
  if (data?.recording) {
    const recording = {
      ...data.recording,
      audioUrl: data.recording.audioUrl ?? buildRecordingUrl("audio"),
    };
    setRecordingAvailability(true, recording);
  } else {
    setRecordingAvailability(true, { ...payload, audioUrl: buildRecordingUrl("audio") });
  }
}

async function startRecording() {
  if (recordingActive || recordingSaving || recordingPlaybackActive) {
    return;
  }
  closeRecordingConfirmPopovers();
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setRecordingStatus("Recording is not supported in this browser.", { level: "error", timeout: 3000 });
    return;
  }

  const constraints = recordingDeviceId
    ? { audio: { deviceId: { exact: recordingDeviceId } } }
    : { audio: true };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    setRecordingStatus("Microphone access was denied.", { level: "error", timeout: 3000 });
    return;
  }

  const mimeType = pickRecordingMimeType();
  if (!mimeType) {
    setRecordingStatus("Recording format is not supported.", { level: "error", timeout: 3000 });
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  recordingAudioChunks = [];
  recordingRecorder = new MediaRecorder(stream, { mimeType });
  recordingStream = stream;
  recordingAudioMimeType = recordingRecorder.mimeType || mimeType;

  recordingRecorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      recordingAudioChunks.push(event.data);
    }
  });

  recordingRecorder.addEventListener("stop", async () => {
    const audioBlob = new Blob(recordingAudioChunks, { type: recordingAudioMimeType || mimeType });
    const durationMs = performance.now() - recordingStartTime;
    recordingSaving = true;
    updateRecordingControls();
    setRecordingStatus("Saving…");
    try {
      await saveRecordingSession({ audioBlob, durationMs: Math.max(0, durationMs) });
      setRecordingStatus("Recording saved.", { timeout: 2500 });
    } catch (error) {
      setRecordingStatus(error.message || "Failed to save recording.", { level: "error", timeout: 4000 });
    } finally {
      recordingSaving = false;
      recordingAudioChunks = [];
      recordingEvents = [];
      recordingRecorder = null;
      recordingAudioMimeType = null;
      stopRecordingStream();
      updateRecordingControls();
    }
  });

  recordingRecorder.start(250);
  recordingEvents = [];
  recordingStartTime = performance.now();
  recordingActive = true;
  recordSlideState({ slideId: lastSlideId, hash: lastKnownHash });
  clearDrawings({ send: true });
  updateRecordingControls();
  setRecordingStatus("Recording…");
}

async function stopRecording() {
  if (!recordingActive) {
    return;
  }
  recordingActive = false;
  updateRecordingControls();
  setRecordingStatus("Stopping…");
  if (recordingRecorder && recordingRecorder.state !== "inactive") {
    recordingRecorder.stop();
  } else {
    stopRecordingStream();
  }
}

function toggleRecording() {
  if (recordingActive) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function fetchRecordingData({ force = false } = {}) {
  if (!force && cachedRecordingData) {
    return cachedRecordingData;
  }
  try {
    const response = await fetch(buildRecordingUrl());
    if (!response.ok) {
      throw new Error();
    }
    const payload = await response.json().catch(() => null);
    if (!payload?.available || !payload.recording) {
      setRecordingAvailability(false);
      return null;
    }
    setRecordingAvailability(true, payload.recording);
    return payload.recording;
  } catch (error) {
    setRecordingAvailability(false);
    return null;
  }
}

function stopPlayback() {
  if (!recordingPlaybackActive) {
    return;
  }
  recordingPlaybackActive = false;
  playbackStopRequested = true;
  if (playbackFrame) {
    cancelAnimationFrame(playbackFrame);
    playbackFrame = null;
  }
  if (playbackAudio) {
    playbackAudio.pause();
    playbackAudio.currentTime = 0;
    playbackAudio = null;
  }
  playbackEvents = [];
  playbackIndex = 0;
  updateRecordingControls();
}

function dispatchPlaybackEvent(event) {
  if (event.type === "state") {
    const nextHash = event.hash || event.slideId || "#";
    if (nextHash) {
      sendCommand("goto", nextHash);
    }
    return;
  }
  if (event.type === "draw") {
    const { type: _type, time: _time, ...drawPayload } = event;
    renderDrawMessage(drawPayload);
    sendDrawMessage(drawPayload, { record: false });
  }
}

function playbackTick() {
  if (!recordingPlaybackActive || !playbackAudio) {
    return;
  }
  const nowMs = playbackAudio.currentTime * 1000;
  while (playbackIndex < playbackEvents.length && playbackEvents[playbackIndex].time <= nowMs) {
    const event = playbackEvents[playbackIndex];
    playbackIndex += 1;
    dispatchPlaybackEvent(event);
  }
  if (playbackAudio.ended || playbackIndex >= playbackEvents.length) {
    stopPlayback();
    return;
  }
  playbackFrame = requestAnimationFrame(playbackTick);
}

async function startPlayback() {
  if (recordingPlaybackActive || recordingActive || recordingSaving) {
    return;
  }
  const recording = await fetchRecordingData({ force: true });
  if (!recording || !Array.isArray(recording.events)) {
    return;
  }
  const audioUrl = recording.audioUrl;
  if (!audioUrl) {
    setRecordingStatus("Recording audio is missing.", { level: "error", timeout: 3000 });
    return;
  }

  playbackEvents = recording.events.slice().sort((a, b) => (a.time || 0) - (b.time || 0));
  playbackIndex = 0;
  playbackStopRequested = false;
  recordingPlaybackActive = true;
  clearDrawings({ send: true });
  updateRecordingControls();

  playbackAudio = new Audio(audioUrl);
  playbackAudio.addEventListener("ended", () => {
    if (!playbackStopRequested) {
      stopPlayback();
    }
  });
  try {
    await playbackAudio.play();
  } catch (error) {
    stopPlayback();
    setRecordingStatus("Unable to start playback.", { level: "error", timeout: 3000 });
    return;
  }

  playbackFrame = requestAnimationFrame(playbackTick);
}

function togglePlayback() {
  if (recordingPlaybackActive) {
    stopPlayback();
  } else {
    startPlayback();
  }
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

function resolveTimerMode(timerConfig) {
  const mode = timerConfig?.mode;
  if (mode === "countdown") {
    return TIMER_MODE_COUNTDOWN_TOTAL;
  }
  if (mode === TIMER_MODE_COUNTDOWN_TOTAL || mode === TIMER_MODE_COUNTDOWN_SLIDE) {
    return mode;
  }
  return TIMER_MODE_COUNTUP;
}

function normalizeTimerSlideKey(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function resolveTimerSlideDurations(timerConfig) {
  const map = new Map();
  const raw = timerConfig?.slides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return map;
  }
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeTimerSlideKey(key);
    const seconds = Number(value);
    if (!normalizedKey || !Number.isFinite(seconds) || seconds <= 0) {
      continue;
    }
    map.set(normalizedKey, Math.round(seconds * 1000));
  }
  return map;
}

function parseSlideTimeToMilliseconds(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return seconds > 0 ? Math.round(seconds * 1000) : null;
}

function refreshSlideDurationsFromPreview() {
  if (!previewFrame) {
    return;
  }
  const nextMap = new Map();
  try {
    const doc = previewFrame.contentDocument;
    if (!doc) {
      return;
    }
    const nodes = doc.querySelectorAll("[data-slide-time]");
    nodes.forEach((node) => {
      const durationMs = parseSlideTimeToMilliseconds(node.getAttribute("data-slide-time"));
      if (!durationMs) {
        return;
      }

      const candidates = [
        node.getAttribute("data-slide-hash"),
        node.getAttribute("data-slide-id"),
        node.getAttribute("data-slide"),
        node.getAttribute("id"),
      ];

      candidates.forEach((candidate) => {
        const normalized = normalizeTimerSlideKey(candidate ?? "");
        if (normalized) {
          nextMap.set(normalized, durationMs);
        }
      });
    });
  } catch {
    return;
  }

  timerSlideDurationsFromDom = nextMap;
  updateTimerDisplay();
}

function resolveTimerSlideDurationByHash(hash) {
  const normalizedHash = normalizeTimerSlideKey(stripRelativeSuffix(hash || ""));
  if (!normalizedHash) {
    return timerDefaultSlideDuration;
  }

  const candidates = [normalizedHash];
  const dotIndex = normalizedHash.indexOf(".");
  if (dotIndex > 1) {
    candidates.push(normalizedHash.slice(0, dotIndex));
  }

  for (const candidate of candidates) {
    const direct = timerSlideDurations.get(candidate);
    if (typeof direct === "number") {
      return direct;
    }
    const domDirect = timerSlideDurationsFromDom.get(candidate);
    if (typeof domDirect === "number") {
      return domDirect;
    }
    const withoutHash = candidate.slice(1);
    const bare = timerSlideDurations.get(withoutHash);
    if (typeof bare === "number") {
      return bare;
    }
    const domBare = timerSlideDurationsFromDom.get(withoutHash);
    if (typeof domBare === "number") {
      return domBare;
    }
  }
  return timerDefaultSlideDuration;
}

function resolveDerivedTotalCountdownDuration() {
  const order = apiSlideOrder;
  if (Array.isArray(order) && order.length > 0) {
    const slidesDuration = order.reduce(
      (total, hash) => total + resolveTimerSlideDurationByHash(hash),
      0
    );
    return slidesDuration + Math.max(0, order.length - 1) * timerTransitionDuration;
  }

  if (timerSlideDurations.size > 0) {
    const slidesDuration = Array.from(timerSlideDurations.values()).reduce((total, value) => total + value, 0);
    return slidesDuration + Math.max(0, timerSlideDurations.size - 1) * timerTransitionDuration;
  }

  if (timerSlideDurationsFromDom.size > 0) {
    const slidesDuration = Array.from(timerSlideDurationsFromDom.values()).reduce(
      (total, value) => total + value,
      0
    );
    return slidesDuration + Math.max(0, timerSlideDurationsFromDom.size - 1) * timerTransitionDuration;
  }

  return 0;
}

function getTotalCountdownDuration() {
  if (timerExplicitTotalDuration > 0) {
    return timerExplicitTotalDuration;
  }
  return resolveDerivedTotalCountdownDuration();
}

function getSlideCountdownRemaining() {
  if (currentSlideCountdownDuration <= 0) {
    return null;
  }
  const elapsedOnSlide = Math.max(0, timerElapsed - currentSlideCountdownStartElapsed);
  return currentSlideCountdownDuration - elapsedOnSlide;
}

function getCurrentSlideElapsed() {
  return Math.max(0, timerElapsed - currentSlideCountdownStartElapsed);
}

function estimatePlannedRemaining() {
  const order = apiSlideOrder || getSlideOrderFromPreview();
  if (!Array.isArray(order) || order.length === 0) {
    return null;
  }
  const index = findSlideIndex(order, lastKnownHash || lastSlideId || "#");
  if (index < 0) {
    return null;
  }

  const currentRemaining = Math.max(0, getSlideCountdownRemaining() ?? 0);
  let futureDuration = 0;
  for (let idx = index + 1; idx < order.length; idx += 1) {
    futureDuration += resolveTimerSlideDurationByHash(order[idx]);
  }
  const transitionsRemaining = Math.max(0, order.length - index - 1) * timerTransitionDuration;
  return currentRemaining + futureDuration + transitionsRemaining;
}

function describePaceTrend() {
  const recent = completedSlideTiming.slice(-3).filter((entry) => entry.budgetMs > 0);
  if (recent.length === 0) {
    return "steady";
  }
  const budget = recent.reduce((total, entry) => total + entry.budgetMs, 0);
  const actual = recent.reduce((total, entry) => total + entry.actualMs, 0);
  if (budget <= 0) {
    return "steady";
  }
  const ratio = actual / budget;
  if (ratio > 1.08) {
    return "slowing down";
  }
  if (ratio < 0.92) {
    return "speeding up";
  }
  return "steady";
}

function updatePaceDisplay() {
  if (!timerPaceDisplay) {
    return;
  }

  timerPaceDisplay.classList.remove(
    "presenter__timer-pace--good",
    "presenter__timer-pace--warn",
    "presenter__timer-pace--danger"
  );

  if (!isCountdownMode()) {
    timerPaceDisplay.textContent = "";
    return;
  }

  const totalDuration = getTotalCountdownDuration();
  const plannedRemaining = estimatePlannedRemaining();
  if (totalDuration <= 0 || plannedRemaining == null) {
    timerPaceDisplay.textContent = "";
    return;
  }

  const totalRemaining = totalDuration - timerElapsed;
  const bufferMs = totalRemaining - plannedRemaining;
  const absBufferMs = Math.abs(bufferMs);
  let state = "On pace";
  let paceLevel = "neutral";
  if (bufferMs > 5000) {
    state = `Ahead ${formatDuration(absBufferMs)}`;
    paceLevel = "good";
  } else if (bufferMs < -5000) {
    state = `Behind ${formatDuration(absBufferMs)}`;
    paceLevel = "warn";
  }

  const slideRemaining = getSlideCountdownRemaining();
  if (slideRemaining != null && slideRemaining < 0) {
    const overBy = formatDuration(-slideRemaining);
    if (bufferMs >= 0) {
      timerPaceDisplay.textContent = `${state} · Over slide ${overBy} (buffer intact)`;
      if (paceLevel === "good") {
        timerPaceDisplay.classList.add("presenter__timer-pace--good");
      }
    } else {
      timerPaceDisplay.textContent = `${state} · Over slide ${overBy} (need catch-up)`;
      timerPaceDisplay.classList.add("presenter__timer-pace--danger");
      return;
    }
  } else {
    timerPaceDisplay.textContent = `${state} · ${describePaceTrend()}`;
  }

  if (bufferMs > 5000) {
    timerPaceDisplay.classList.add("presenter__timer-pace--good");
  } else if (bufferMs < -15000) {
    timerPaceDisplay.classList.add("presenter__timer-pace--danger");
  } else if (bufferMs < -5000) {
    timerPaceDisplay.classList.add("presenter__timer-pace--warn");
  }
}

function isCountdownMode() {
  return (
    timerMode === TIMER_MODE_COUNTDOWN_TOTAL ||
    timerMode === TIMER_MODE_COUNTDOWN_SLIDE
  );
}

function updateCurrentSlideTimerState(hash) {
  currentSlideCountdownDuration = resolveTimerSlideDurationByHash(hash);
  currentSlideCountdownStartElapsed = timerElapsed;
}

function updatePresenterTitleDisplay(title) {
  if (!brandDisplay) {
    return;
  }
  if (title) {
    brandDisplay.textContent = title;
    brandDisplay.dataset.empty = "false";
  } else {
    brandDisplay.textContent = "";
    brandDisplay.dataset.empty = "true";
  }
}

function applyConfig(config) {
  applyRuntimeConfig(config);
  const title = typeof config?.title === "string" ? config.title : null;
  configTitle = title;
  if (title) {
    updatePresenterTitleDisplay(title);
    document.title = title;
  } else {
    updatePresenterTitleDisplay("");
    syncTitleFromPreview();
  }

  const keyboardConfig = normalizeKeyboardConfig(config?.keyboard);
  keyboardMap = buildKeyboardMap(keyboardConfig);

  applyShortcutConfig(config);

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
  const nextTimerMode = resolveTimerMode(timerConfig);
  const nextExplicitTotalDuration = resolveCountdownDuration(timerConfig);
  const nextSlideDurations = resolveTimerSlideDurations(timerConfig);
  const defaultSlideSeconds = Number(timerConfig.defaultSlideSeconds);
  const nextDefaultSlideDuration =
    Number.isFinite(defaultSlideSeconds) && defaultSlideSeconds > 0
      ? Math.round(defaultSlideSeconds * 1000)
      : 0;
  const transitionSeconds = Number(timerConfig.transitionSeconds);
  const nextTransitionDuration =
    Number.isFinite(transitionSeconds) && transitionSeconds >= 0
      ? Math.round(transitionSeconds * 1000)
      : 2000;

  const slideDurationsChanged =
    stableStringify(Array.from(nextSlideDurations.entries())) !==
    stableStringify(Array.from(timerSlideDurations.entries()));
  const timerChanged =
    nextTimerMode !== timerMode ||
    nextExplicitTotalDuration !== timerExplicitTotalDuration ||
    nextDefaultSlideDuration !== timerDefaultSlideDuration ||
    nextTransitionDuration !== timerTransitionDuration ||
    slideDurationsChanged;

  timerMode = nextTimerMode;
  timerExplicitTotalDuration = nextExplicitTotalDuration;
  timerDefaultSlideDuration = nextDefaultSlideDuration;
  timerTransitionDuration = nextTransitionDuration;
  timerSlideDurations = nextSlideDurations;

  if (timerChanged) {
    countdownStartSlide = null;
    timerElapsed = 0;
    timerRunning = false;
    timerStarted = false;
    currentSlideCountdownDuration = 0;
    currentSlideCountdownStartElapsed = 0;
    completedSlideTiming = [];
    if (lastKnownHash) {
      updateCurrentSlideTimerState(lastKnownHash);
    }
  }
  updateTimerDisplay();
  updateTimerToggleLabel();

  const drawConfig = config?.draw ?? {};
  if (typeof drawConfig.color === "string") {
    activeDrawColor = drawConfig.color;
  }
  const drawSize = Number(drawConfig.size);
  if (Number.isFinite(drawSize) && drawSize > 0) {
    activeDrawSize = drawSize;
  }

  const laserConfig = config?.laser ?? {};
  if (typeof laserConfig.color === "string") {
    activeLaserColor = laserConfig.color;
  }
  const laserSize = Number(laserConfig.size);
  if (Number.isFinite(laserSize) && laserSize > 0) {
    activeLaserSize = laserSize;
  }
  syncToolControls();

  const recordingConfig = config?.recording ?? {};
  recordingDeviceId = typeof recordingConfig.deviceId === "string" ? recordingConfig.deviceId : null;
  if (settingsRecordingDevice) {
    settingsRecordingDevice.value = recordingDeviceId ?? "";
  }

  if (lastSlideId || lastKnownHash !== "#") {
    updateNotes({ slideId: lastSlideId, hash: lastKnownHash });
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
  }
}

function updateSettingsDirtyState() {
  settingsDirty = !configsEqual(draftConfig, savedConfig);
  if (settingsDirtyIndicator) {
    settingsDirtyIndicator.dataset.visible = settingsDirty ? "true" : "false";
  }
  if (settingsSaveButton) {
    settingsSaveButton.disabled = !settingsDirty || !jsonIsValid;
  }
}

function syncSettingsForm() {
  if (settingsTitleInput) {
    settingsTitleInput.value = typeof draftConfig.title === "string" ? draftConfig.title : "";
  }

  const keyboard = draftConfig.keyboard ?? {};
  if (settingsKeyNext) {
    settingsKeyNext.value = formatKeyList(keyboard.next ?? DEFAULT_KEYBOARD.next);
  }
  if (settingsKeyPrev) {
    settingsKeyPrev.value = formatKeyList(keyboard.prev ?? DEFAULT_KEYBOARD.prev);
  }
  if (settingsKeyFirst) {
    settingsKeyFirst.value = formatKeyList(keyboard.first ?? DEFAULT_KEYBOARD.first);
  }
  if (settingsKeyLast) {
    settingsKeyLast.value = formatKeyList(keyboard.last ?? DEFAULT_KEYBOARD.last);
  }

  const shortcuts = draftConfig.shortcuts ?? {};
  if (settingsKeyFullscreen) {
    settingsKeyFullscreen.value = formatKeyList(shortcuts.fullscreen ?? DEFAULT_SHORTCUTS.fullscreen);
  }
  if (settingsKeyPresenter) {
    settingsKeyPresenter.value = formatKeyList(shortcuts.presenter ?? DEFAULT_SHORTCUTS.presenter);
  }
  if (settingsKeyQuestions) {
    settingsKeyQuestions.value = formatKeyList(shortcuts.questions ?? DEFAULT_SHORTCUTS.questions);
  }
  if (settingsKeyRecording) {
    settingsKeyRecording.value = formatKeyList(shortcuts.recording ?? DEFAULT_SHORTCUTS.recording);
  }

  if (settingsNotesSource) {
    const source = draftConfig.notes?.source;
    settingsNotesSource.value =
      source === "api" || source === "files" || source === "none" ? source : "auto";
  }

  if (settingsPreviewRelative) {
    const previewConfig = draftConfig.preview ?? draftConfig.previews ?? {};
    settingsPreviewRelative.checked = previewConfig?.relativeHash === true;
  }

  const timerConfig = draftConfig.timer ?? {};
  if (settingsTimerMode) {
    settingsTimerMode.value = resolveTimerMode(timerConfig);
  }
  if (settingsTimerMinutes) {
    const minutes = Number(timerConfig?.durationMinutes);
    settingsTimerMinutes.value = Number.isFinite(minutes) && minutes > 0 ? String(minutes) : "";
  }
  if (settingsTimerSeconds) {
    const secondsValue = timerConfig?.durationSeconds ?? timerConfig?.duration;
    const seconds = Number(secondsValue);
    settingsTimerSeconds.value = Number.isFinite(seconds) && seconds > 0 ? String(seconds) : "";
  }

  const recordingConfig = draftConfig.recording ?? {};
  if (settingsRecordingDevice) {
    settingsRecordingDevice.value =
      typeof recordingConfig.deviceId === "string" ? recordingConfig.deviceId : "";
  }
}

function setJsonValidity(isValid, message = "") {
  jsonIsValid = isValid;
  if (settingsJson) {
    settingsJson.classList.toggle("presenter__settings-json--invalid", !isValid);
  }
  if (settingsJsonStatus) {
    settingsJsonStatus.textContent = isValid ? "" : message || "Invalid JSON";
    settingsJsonStatus.dataset.invalid = isValid ? "false" : "true";
  }
  updateSettingsDirtyState();
}

function syncSettingsJson({ force = false } = {}) {
  if (!settingsJson) {
    return;
  }
  if (!force) {
    if (jsonEditing || !jsonIsValid) {
      return;
    }
  }
  settingsJson.value = JSON.stringify(draftConfig, null, 2);
  if (force) {
    setJsonValidity(true);
  }
}

function applyDraftConfig({ source } = {}) {
  applyConfig({ ...draftConfig, sessionId });
  if (source === "json") {
    syncSettingsForm();
  } else {
    syncSettingsJson();
  }
  updateSettingsDirtyState();
}

function updateDraftConfig(mutator, { source = "form" } = {}) {
  const nextConfig = cloneConfig(draftConfig);
  mutator(nextConfig);
  draftConfig = nextConfig;
  if (settingsStatus) {
    settingsStatus.textContent = "";
  }
  applyDraftConfig({ source });
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function updateKeyboardConfig(nextConfig, action, value) {
  const keys = parseKeyList(value);
  const keyboard =
    nextConfig.keyboard && typeof nextConfig.keyboard === "object"
      ? { ...nextConfig.keyboard }
      : {};
  if (keys.length > 0) {
    keyboard[action] = keys;
  } else {
    delete keyboard[action];
  }
  if (Object.keys(keyboard).length > 0) {
    nextConfig.keyboard = keyboard;
  } else {
    delete nextConfig.keyboard;
  }
}

function updateShortcutConfig(nextConfig, action, value) {
  const keys = parseKeyList(value);
  const shortcuts =
    nextConfig.shortcuts && typeof nextConfig.shortcuts === "object"
      ? { ...nextConfig.shortcuts }
      : {};
  if (keys.length > 0) {
    shortcuts[action] = keys;
  } else {
    delete shortcuts[action];
  }
  if (Object.keys(shortcuts).length > 0) {
    nextConfig.shortcuts = shortcuts;
  } else {
    delete nextConfig.shortcuts;
  }
}

function updateNotesConfig(nextConfig, value) {
  const source = value === "api" || value === "files" || value === "none" ? value : null;
  const notes =
    nextConfig.notes && typeof nextConfig.notes === "object" ? { ...nextConfig.notes } : {};
  if (source) {
    notes.source = source;
  } else {
    delete notes.source;
  }
  if (Object.keys(notes).length > 0) {
    nextConfig.notes = notes;
  } else {
    delete nextConfig.notes;
  }
}

function updatePreviewConfig(nextConfig, enabled) {
  const preview =
    nextConfig.preview && typeof nextConfig.preview === "object"
      ? { ...nextConfig.preview }
      : nextConfig.previews && typeof nextConfig.previews === "object"
        ? { ...nextConfig.previews }
        : {};
  if (enabled) {
    preview.relativeHash = true;
  } else {
    delete preview.relativeHash;
  }
  if (Object.keys(preview).length > 0) {
    nextConfig.preview = preview;
    delete nextConfig.previews;
  } else {
    delete nextConfig.preview;
    delete nextConfig.previews;
  }
}

function updateTimerConfig(nextConfig) {
  const timer = nextConfig.timer && typeof nextConfig.timer === "object" ? { ...nextConfig.timer } : {};
  const mode = settingsTimerMode?.value;
  if (mode === TIMER_MODE_COUNTDOWN_TOTAL || mode === TIMER_MODE_COUNTDOWN_SLIDE) {
    timer.mode = mode;
  } else {
    delete timer.mode;
  }

  const minutes = parsePositiveNumber(settingsTimerMinutes?.value);
  if (minutes) {
    timer.durationMinutes = minutes;
  } else {
    delete timer.durationMinutes;
  }

  const seconds = parsePositiveNumber(settingsTimerSeconds?.value);
  if (seconds) {
    timer.durationSeconds = seconds;
    delete timer.duration;
  } else {
    delete timer.durationSeconds;
    delete timer.duration;
  }

  if (Object.keys(timer).length > 0) {
    nextConfig.timer = timer;
  } else {
    delete nextConfig.timer;
  }
}

function updateRecordingConfig(nextConfig, deviceId) {
  const recording =
    nextConfig.recording && typeof nextConfig.recording === "object"
      ? { ...nextConfig.recording }
      : {};
  if (deviceId) {
    recording.deviceId = deviceId;
  } else {
    delete recording.deviceId;
  }
  if (Object.keys(recording).length > 0) {
    nextConfig.recording = recording;
  } else {
    delete nextConfig.recording;
  }
}

async function refreshRecordingDevices({ requestPermission = false } = {}) {
  if (!settingsRecordingDevice || !navigator.mediaDevices?.enumerateDevices) {
    return;
  }
  if (requestPermission) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      // ignore permission errors
    }
  }
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    return;
  }
  const audioInputs = devices.filter((device) => device.kind === "audioinput");
  settingsRecordingDevice.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "System default";
  settingsRecordingDevice.appendChild(defaultOption);
  audioInputs.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Audio input ${index + 1}`;
    settingsRecordingDevice.appendChild(option);
  });
  settingsRecordingDevice.value = recordingDeviceId ?? "";
}

function handleConfigUpdate(config, { force = false } = {}) {
  const sanitized = sanitizeConfig(config);
  const shouldSyncDraft = force || !settingsDirty || configsEqual(draftConfig, sanitized);
  savedConfig = sanitized;
  if (shouldSyncDraft) {
    draftConfig = cloneConfig(sanitized);
    syncSettingsForm();
    syncSettingsJson({ force: jsonIsValid });
  }
  applyConfig(config ?? {});
  updateSettingsDirtyState();
}

function setSettingsView(nextView) {
  settingsView = nextView;
  settingsViews.forEach((view) => {
    const isActive = view.dataset.settingsView === nextView;
    view.dataset.active = isActive ? "true" : "false";
  });
  if (settingsJsonToggle) {
    const isJson = nextView === "json";
    settingsJsonToggle.setAttribute("aria-pressed", isJson ? "true" : "false");
    settingsJsonToggle.textContent = isJson ? "Hide JSON" : "Show JSON";
  }
  if (settingsPanelHeight && settingsPanel) {
    settingsPanel.style.height = `${settingsPanelHeight}px`;
  }
  if (nextView === "json") {
    syncSettingsJson({ force: jsonIsValid });
    settingsJson?.focus();
  } else {
    jsonEditing = false;
    syncSettingsForm();
  }
}

function lockSettingsPanelHeight() {
  if (!settingsPanel) {
    return;
  }
  if (!settingsPanelHeight) {
    settingsPanelHeight = settingsPanel.getBoundingClientRect().height;
  }
  if (settingsPanelHeight) {
    settingsPanel.style.height = `${settingsPanelHeight}px`;
  }
}

function clearSettingsPanelHeight() {
  if (!settingsPanel) {
    return;
  }
  settingsPanel.style.height = "";
  settingsPanelHeight = null;
}

function openSettings() {
  if (!settingsOverlay) {
    return;
  }
  settingsOverlay.dataset.open = "true";
  settingsOverlay.setAttribute("aria-hidden", "false");
  if (settingsStatus) {
    settingsStatus.textContent = "";
  }
  clearSettingsPanelHeight();
  syncSettingsForm();
  refreshRecordingDevices();
  syncSettingsJson({ force: jsonIsValid });
  setSettingsView(settingsView || "ui");
  updateSettingsDirtyState();
  requestAnimationFrame(() => {
    lockSettingsPanelHeight();
  });
}

function closeSettings() {
  if (!settingsOverlay) {
    return;
  }
  settingsOverlay.dataset.open = "false";
  settingsOverlay.setAttribute("aria-hidden", "true");
  jsonEditing = false;
  stopHotkeyCapture();
  clearSettingsPanelHeight();
}

function buildQuestionsQrPageUrl() {
  return getRuntimeUrl("questionsQr", "/_/questions/qr");
}

function buildQuestionsApiUrl() {
  return getRuntimeApiUrl("questions", "/_/api/questions");
}

function buildQuestionsDeleteUrl() {
  return addPresenterKey(getRuntimeApiUrl("questionsDelete", "/_/api/questions/delete")).toString();
}

function buildQuestionsAnswerUrl() {
  return addPresenterKey(getRuntimeApiUrl("questionsAnswer", "/_/api/questions/answer")).toString();
}

function setQuestionsAvailability(available) {
  questionsAvailable = available;
  if (questionsToggleButton) {
    questionsToggleButton.style.display = available ? "" : "none";
  }
  if (!available) {
    closeQuestionsOverlay();
    stopQuestionsPolling();
  }
}

function setQuestionsOverlayOpen(open) {
  if (!questionsOverlay) {
    return;
  }
  questionsOverlay.dataset.open = open ? "true" : "false";
  questionsOverlay.setAttribute("aria-hidden", open ? "false" : "true");
}

function setQuestionsConfirmOpen(open) {
  if (!questionsConfirmOverlay) {
    return;
  }
  questionsConfirmOverlay.dataset.open = open ? "true" : "false";
  questionsConfirmOverlay.setAttribute("aria-hidden", open ? "false" : "true");
}


function formatQuestionTimestamp(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateQuestionsBadge(count) {
  if (!questionsCountBadge) {
    return;
  }
  if (count > 0) {
    questionsCountBadge.textContent = String(count);
    questionsCountBadge.dataset.visible = "true";
  } else {
    questionsCountBadge.textContent = "";
    questionsCountBadge.dataset.visible = "false";
  }
}

function renderQuestionsList(questions) {
  if (!questionsList) {
    return;
  }
  questionsList.innerHTML = "";
  if (!Array.isArray(questions) || questions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "presenter__questions-empty";
    empty.textContent = "No questions yet.";
    questionsList.appendChild(empty);
    return;
  }

  const sorted = [...questions].sort((a, b) => {
    const voteDiff = (b.votes ?? 0) - (a.votes ?? 0);
    if (voteDiff !== 0) {
      return voteDiff;
    }
    return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
  });

  sorted.forEach((question) => {
    const card = document.createElement("div");
    card.className = "presenter__question";

    const votes = document.createElement("div");
    votes.className = "presenter__question-votes";
    votes.textContent = `${question.votes ?? 0}▲`;

    const content = document.createElement("div");
    const text = document.createElement("div");
    text.className = "presenter__question-text";
    text.textContent = question.text ?? "";
    content.appendChild(text);

    const timestamp = formatQuestionTimestamp(question.createdAt);
    const status = question.answered ? "Answered" : null;
    if (timestamp || status) {
      const meta = document.createElement("div");
      meta.className = "presenter__question-meta";
      meta.textContent = timestamp && status ? `Asked at ${timestamp} · ${status}` : status || `Asked at ${timestamp}`;
      content.appendChild(meta);
    }

    if (question.answered) {
      card.dataset.answered = "true";
    }

    const actions = document.createElement("div");
    actions.className = "presenter__question-actions";

    const answerButton = document.createElement("button");
    answerButton.type = "button";
    answerButton.className = "presenter__button presenter__button--tiny";
    answerButton.textContent = question.answered ? "Unanswer" : "Answered";
    answerButton.addEventListener("click", async () => {
      answerButton.disabled = true;
      await markQuestionAnswered(question.id, !question.answered);
      answerButton.disabled = false;
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "presenter__button presenter__button--tiny";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      pendingDeleteQuestionId = question.id;
      setQuestionsConfirmOpen(true);
    });

    actions.appendChild(answerButton);
    actions.appendChild(deleteButton);

    card.appendChild(votes);
    card.appendChild(content);
    card.appendChild(actions);
    questionsList.appendChild(card);
  });
}

async function deleteQuestion(id) {
  if (!id) {
    return;
  }
  try {
    const response = await fetch(buildQuestionsDeleteUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Failed to delete question (${response.status})`);
    }
  } catch (error) {
    if (questionsStatus) {
      questionsStatus.textContent = error.message || "Failed to delete question.";
    }
  }
}

async function markQuestionAnswered(id, answered) {
  if (!id) {
    return;
  }
  try {
    const response = await fetch(buildQuestionsAnswerUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, answered }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Failed to update question (${response.status})`);
    }
  } catch (error) {
    if (questionsStatus) {
      questionsStatus.textContent = error.message || "Failed to update question.";
    }
  }
}

async function fetchQuestions({ silent = false } = {}) {
  try {
    const response = await fetch(buildQuestionsApiUrl());
    if (response.status === 404 || response.status === 501) {
      setQuestionsAvailability(false);
      return;
    }
    if (!response.ok) {
      throw new Error(`Failed to load questions (${response.status})`);
    }
    const data = await response.json();
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    renderQuestionsList(questions);
    updateQuestionsBadge(questions.length);
    if (questionsStatus && !silent) {
      const now = new Date();
      questionsStatus.textContent = `Updated ${now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
  } catch (error) {
    if (questionsStatus && !silent) {
      questionsStatus.textContent = error.message || "Unable to load questions.";
    }
  }
}

function startQuestionsPolling() {
  if (questionsPollingTimer || !questionsAvailable) {
    return;
  }
  questionsPollingTimer = setInterval(() => {
    fetchQuestions({ silent: true });
  }, QUESTIONS_POLL_INTERVAL_MS);
}

function stopQuestionsPolling() {
  if (questionsPollingTimer) {
    clearInterval(questionsPollingTimer);
    questionsPollingTimer = null;
  }
}

function openQuestionsOverlay() {
  if (!questionsOverlay || !questionsAvailable) {
    return;
  }
  setQuestionsOverlayOpen(true);
  if (questionsOpenQrButton) {
    questionsOpenQrButton.href = buildQuestionsQrPageUrl();
  }
  fetchQuestions();
}

function closeQuestionsOverlay() {
  if (!questionsOverlay) {
    return;
  }
  setQuestionsOverlayOpen(false);
}

function toggleQuestionsOverlay() {
  if (!questionsOverlay || !questionsAvailable) {
    return;
  }
  const isOpen = questionsOverlay.dataset.open === "true";
  if (isOpen) {
    closeQuestionsOverlay();
  } else {
    openQuestionsOverlay();
  }
}

keyboardMap = buildKeyboardMap(DEFAULT_KEYBOARD);

function formatDuration(ms, { allowNegative = false, padSign = false } = {}) {
  const numeric = Number.isFinite(ms) ? ms : 0;
  const isNegative = allowNegative && numeric < 0;
  const absoluteSeconds = Math.trunc(Math.abs(numeric) / 1000);
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  const seconds = absoluteSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  const sign = isNegative ? "−" : padSign ? "\u2007" : "";
  return `${sign}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getTimerDisplayValue() {
  if (timerMode === TIMER_MODE_COUNTDOWN_TOTAL || timerMode === TIMER_MODE_COUNTDOWN_SLIDE) {
    const totalDuration = getTotalCountdownDuration();
    if (totalDuration > 0) {
      return Math.max(0, totalDuration - timerElapsed);
    }
  }
  return timerElapsed;
}

function updateTimerToggleLabel() {
  if (!timerToggleButton) {
    return;
  }
  if (!timerStarted && isCountdownMode()) {
    timerToggleButton.textContent = "Start";
    return;
  }
  timerToggleButton.textContent = timerRunning ? "Pause" : "Resume";
}

function updateTimerDisplay() {
  if (!timerDisplay) {
    return;
  }
  const primaryValue =
    timerMode === TIMER_MODE_COUNTDOWN_SLIDE
      ? getSlideCountdownRemaining() ?? 0
      : getTimerDisplayValue();

  timerDisplay.classList.remove("presenter__timer--warn", "presenter__timer--danger");
  timerSecondaryDisplay?.classList.remove("presenter__timer-secondary--warn", "presenter__timer-secondary--danger");

  timerDisplay.textContent = formatDuration(primaryValue, {
    allowNegative: timerMode === TIMER_MODE_COUNTDOWN_SLIDE,
    padSign: timerMode === TIMER_MODE_COUNTDOWN_SLIDE,
  });

  if (!timerSecondaryDisplay) {
    updatePaceDisplay();
    return;
  }

  if (timerMode === TIMER_MODE_COUNTDOWN_TOTAL) {
    const slideRemaining = getSlideCountdownRemaining();
    if (slideRemaining != null && currentSlideCountdownDuration > 0) {
      timerSecondaryDisplay.textContent = `Slide ${formatDuration(slideRemaining, {
        allowNegative: true,
        padSign: true,
      })} / ${formatDuration(currentSlideCountdownDuration)}`;
      if (slideRemaining <= 5000) {
        timerSecondaryDisplay.classList.add("presenter__timer-secondary--danger");
      } else if (slideRemaining <= 10000) {
        timerSecondaryDisplay.classList.add("presenter__timer-secondary--warn");
      }
    } else {
      timerSecondaryDisplay.textContent = "";
    }
    updatePaceDisplay();
    return;
  }

  if (timerMode === TIMER_MODE_COUNTDOWN_SLIDE) {
    if (primaryValue <= 5000) {
      timerDisplay.classList.add("presenter__timer--danger");
    } else if (primaryValue <= 10000) {
      timerDisplay.classList.add("presenter__timer--warn");
    }
    const totalDuration = getTotalCountdownDuration();
    if (totalDuration > 0) {
      timerSecondaryDisplay.textContent = `Total ${formatDuration(Math.max(0, totalDuration - timerElapsed))}`;
    } else {
      timerSecondaryDisplay.textContent = "";
    }
    updatePaceDisplay();
    return;
  }

  timerSecondaryDisplay.textContent = "";
  updatePaceDisplay();
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

function ensurePresenterFaviconLink() {
  if (faviconLink) {
    return faviconLink;
  }
  if (!document.head) {
    return null;
  }
  faviconLink = document.createElement("link");
  faviconLink.id = "presenter-favicon";
  faviconLink.rel = "icon";
  faviconLink.type = "image/svg+xml";
  document.head.appendChild(faviconLink);
  return faviconLink;
}

function getPresenterFaviconProgress({ slideId, hash } = {}) {
  const order = apiSlideOrder || getSlideOrderFromPreview();
  if (!Array.isArray(order) || order.length === 0) {
    return 0;
  }
  if (order.length === 1) {
    return 1;
  }
  const index = findSlideIndex(order, hash || slideId || lastKnownHash || lastSlideId || "#");
  if (index <= 0) {
    return 0;
  }
  if (index >= order.length - 1) {
    return 1;
  }
  return index / (order.length - 1);
}

function buildPresenterFaviconHref(progress) {
  const normalizedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const progressValue = Number((normalizedProgress * 100).toFixed(4));
  const darkMode = colorSchemeMedia.matches;
  const background = darkMode ? "#ffffff" : "#000000";
  const foreground = darkMode ? "#000000" : "#ffffff";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="${background}" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="${foreground}" stroke-opacity="0.24" stroke-width="4" />
      <circle
        cx="16"
        cy="16"
        r="10"
        fill="none"
        stroke="${foreground}"
        stroke-width="4"
        stroke-linecap="butt"
        pathLength="100"
        stroke-dasharray="${progressValue} 100"
        transform="rotate(-90 16 16)"
      />
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updatePresenterFavicon({ slideId = lastSlideId, hash = lastKnownHash } = {}) {
  const link = ensurePresenterFaviconLink();
  if (!link) {
    return;
  }
  link.href = buildPresenterFaviconHref(getPresenterFaviconProgress({ slideId, hash }));
}

function setupPresenterFavicon() {
  updatePresenterFavicon();
  if (typeof colorSchemeMedia.addEventListener === "function") {
    colorSchemeMedia.addEventListener("change", () => {
      updatePresenterFavicon();
    });
  } else if (typeof colorSchemeMedia.addListener === "function") {
    colorSchemeMedia.addListener(() => {
      updatePresenterFavicon();
    });
  }
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
  if (!timerStarted && isCountdownMode()) {
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
  completedSlideTiming = [];
  currentSlideCountdownStartElapsed = 0;
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
  const totalDuration = getTotalCountdownDuration();
  if (timerMode === TIMER_MODE_COUNTDOWN_TOTAL && totalDuration > 0 && timerElapsed >= totalDuration) {
    timerElapsed = totalDuration;
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

  const deckUrl = new URL(getPreviewDeckUrl(), window.location.href);
  deckUrl.searchParams.set(PREVIEW_QUERY, "1");
  deckUrl.hash = hash || "";
  frame.src = deckUrl.toString();

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
    setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
    pendingNextPreviewHash = null;
    nextPreviewSpeakersKey = null;
    relativeNextPreviewEndHash = resolvedFrameHash || resolvedPendingHash;
  } else {
    setNextPreviewEnd(false);
    if (nextPreviewSpeakersKey) {
      updateNextPreviewSpeakers(nextPreviewSpeakersKey);
    }
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
  if (configTitle || !previewFrame) {
    return;
  }
  try {
    const title = previewFrame.contentDocument?.title;
    if (title) {
      updatePresenterTitleDisplay(title);
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
        updatePresenterFavicon();
        updateTimerDisplay();
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

function setNextPreviewSpeakersPlaceholder(text) {
  if (!nextPreviewSpeakers) {
    return;
  }
  nextPreviewSpeakers.replaceChildren();
  nextPreviewSpeakers.dataset.empty = "true";
  nextPreviewSpeakers.textContent = text;
}

function renderNextPreviewSpeakers({ firstSpeaker, otherSpeakers, carried = false }) {
  if (!nextPreviewSpeakers) {
    return;
  }

  nextPreviewSpeakers.replaceChildren();

  if (!firstSpeaker) {
    nextPreviewSpeakers.dataset.empty = "true";
    nextPreviewSpeakers.textContent = NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT;
    return;
  }

  nextPreviewSpeakers.dataset.empty = "false";

  const leadRow = document.createElement("div");
  leadRow.className = "presenter__preview-speaker-row";
  const leadLabel = document.createElement("span");
  leadLabel.className = "presenter__preview-speaker-label";
  leadLabel.textContent = carried ? "Next (carried)" : "Next";
  leadRow.appendChild(leadLabel);
  leadRow.appendChild(createSpeakerChip(firstSpeaker, { carried }));
  nextPreviewSpeakers.appendChild(leadRow);

  if (Array.isArray(otherSpeakers) && otherSpeakers.length > 0) {
    const othersRow = document.createElement("div");
    othersRow.className = "presenter__preview-speaker-row";
    const othersLabel = document.createElement("span");
    othersLabel.className = "presenter__preview-speaker-label";
    othersLabel.textContent = "Also";
    othersRow.appendChild(othersLabel);
    otherSpeakers.forEach((speaker) => {
      othersRow.appendChild(createSpeakerChip(speaker));
    });
    nextPreviewSpeakers.appendChild(othersRow);
  }
}

async function resolveNotesForKey(notesKey, { apiNotes = null, preferApi = true } = {}) {
  if (!notesKey || notesSource === "none") {
    return null;
  }

  if (typeof apiNotes === "string" && apiNotes) {
    notesCache.set(notesKey, apiNotes);
    return apiNotes;
  }

  if (preferApi && notesSource !== "files") {
    const inlineApiNotes = getApiNotesForKey(notesKey);
    if (typeof inlineApiNotes === "string" && inlineApiNotes) {
      notesCache.set(notesKey, inlineApiNotes);
      return inlineApiNotes;
    }
  }

  if (notesSource === "api") {
    return null;
  }

  if (notesCache.has(notesKey)) {
    return notesCache.get(notesKey);
  }

  const fileNotes = await fetchNotesFromFiles(notesKey);
  notesCache.set(notesKey, fileNotes);
  return fileNotes;
}

function resolveSpeakerLookupHash(hash) {
  if (!hash || !/~(next|prev)$/u.test(hash)) {
    return hash;
  }
  try {
    const frameHash = nextPreviewFrame?.contentWindow?.location?.hash || null;
    if (frameHash && !/~(next|prev)$/u.test(frameHash)) {
      return frameHash;
    }
  } catch {
    // ignore frame access failures
  }
  return null;
}

async function updateNextPreviewSpeakers(nextHash) {
  if (!nextPreviewSpeakers) {
    return;
  }

  if (!nextHash || notesSource === "none") {
    nextPreviewSpeakersKey = null;
    setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
    return;
  }

  const requestId = ++nextPreviewSpeakerRequestId;
  nextPreviewSpeakersKey = nextHash;
  setNextPreviewSpeakersPlaceholder("Loading speakers…");

  const notesKey = resolveSpeakerLookupHash(nextHash);
  if (!notesKey) {
    return;
  }

  const notes = await resolveNotesForKey(notesKey, { preferApi: true });
  if (requestId !== nextPreviewSpeakerRequestId || nextPreviewSpeakersKey !== nextHash) {
    return;
  }

  const parsed = parseNotesWithSpeakers(notes || "");
  const firstSpeaker = parsed.firstSpeaker || currentSpeaker;
  const carried = !parsed.firstSpeaker && Boolean(firstSpeaker);
  const otherSpeakers = parsed.firstSpeaker ? parsed.otherSpeakers : [];

  renderNextPreviewSpeakers({
    firstSpeaker,
    otherSpeakers,
    carried,
  });
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
    nextPreviewSpeakersKey = null;
    setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
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
    nextPreviewSpeakersKey = null;
    setNextPreviewEnd(true);
    setNextPreviewPlaceholder(NEXT_PREVIEW_LAST_TEXT);
    setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
    return;
  }

  const { hash: nextHash, reason } = resolveNextPreviewInfo({ slideId, hash });
  if (!nextHash) {
    setPreviewActive(nextPreviewSection, false);
    pendingNextPreviewHash = null;
    relativeNextPreviewAttempts = 0;
    nextPreviewSpeakersKey = null;
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
    setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
    return;
  }

  setNextPreviewEnd(false);
  setPreviewActive(nextPreviewSection, true);
  setNextPreviewPlaceholder(NEXT_PREVIEW_UNAVAILABLE_TEXT);
  pendingNextPreviewHash = relativeHashPreview ? hash || slideId || "#" : null;
  relativeNextPreviewAttempts = 0;
  updateNextPreviewFrame(nextHash);
  updateNextPreviewSpeakers(nextHash);
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
    sendDrawMessage({ action: "clear" });
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

function getControlTool() {
  return activeTool === "laser" ? "laser" : "draw";
}

function syncColorControls(tool = getControlTool()) {
  const color = tool === "laser" ? activeLaserColor : activeDrawColor;
  if (colorPickerInput && colorPickerInput.value !== color) {
    colorPickerInput.value = color;
  }
  colorButtons.forEach((button) => {
    const isActive = button.dataset.color === color;
    button.classList.toggle("presenter__color--active", isActive);
  });
}

function syncSizeControl(tool = getControlTool()) {
  if (!sizeSlider) {
    return;
  }
  const size = tool === "laser" ? activeLaserSize : activeDrawSize;
  sizeSlider.value = String(size);
}

function syncToolControls(tool = getControlTool()) {
  syncColorControls(tool);
  syncSizeControl(tool);
}

function setToolColor(tool, color, { fromPicker = false } = {}) {
  if (!color || typeof color !== "string") {
    return;
  }
  if (tool === "laser") {
    activeLaserColor = color;
  } else {
    activeDrawColor = color;
  }
  if (tool !== getControlTool()) {
    return;
  }
  if (colorPickerInput && colorPickerInput.value !== color) {
    colorPickerInput.value = color;
  }
  if (fromPicker) {
    colorButtons.forEach((button) => {
      button.classList.remove("presenter__color--active");
    });
    return;
  }
  colorButtons.forEach((button) => {
    const isActive = button.dataset.color === color;
    button.classList.toggle("presenter__color--active", isActive);
  });
}

function setToolSize(tool, size) {
  if (!Number.isFinite(size) || size <= 0) {
    return;
  }
  if (tool === "laser") {
    activeLaserSize = size;
  } else {
    activeDrawSize = size;
  }
  if (tool === getControlTool() && sizeSlider) {
    sizeSlider.value = String(size);
  }
}

function setActiveTool(tool) {
  const nextTool = activeTool === tool ? "none" : tool;
  activeTool = nextTool;
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
  syncToolControls();
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

function sendDrawMessage(payload, { record = true } = {}) {
  sendMessage({ type: "draw", ...payload });
  if (record) {
    recordEvent({ type: "draw", ...payload });
  }
}

function handleDrawPointerDown(event) {
  if (recordingPlaybackActive) {
    return;
  }
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
      size: activeDrawSize,
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
  if (recordingPlaybackActive) {
    return;
  }
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
    color: activeLaserColor,
    radius: activeLaserSize,
  };
  renderLaserPoint(message);
  sendDrawMessage(message);
}

function handleDrawPointerMove(event) {
  if (recordingPlaybackActive) {
    return;
  }
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
  if (recordingPlaybackActive) {
    return;
  }
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

function normalizeSpeakerName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function speakerIdentityKey(name) {
  return normalizeSpeakerName(name).toLocaleLowerCase();
}

function getSpeakerHue(name) {
  const normalized = normalizeSpeakerName(name);
  if (!normalized) {
    return 200;
  }
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 360;
  }
  return (hash + 360) % 360;
}

function createSpeakerChip(name, { carried = false, compact = false } = {}) {
  const chip = document.createElement("span");
  chip.className = "presenter__speaker-chip";
  if (compact) {
    chip.classList.add("presenter__speaker-chip--compact");
  }
  chip.style.setProperty("--speaker-hue", String(getSpeakerHue(name)));
  chip.dataset.carried = carried ? "true" : "false";
  chip.textContent = `@${name}`;
  if (carried) {
    chip.title = "Speaker carried over from previous slide";
  }
  return chip;
}

function parseNotesWithSpeakers(content) {
  const notes = typeof content === "string" ? content : "";
  const lines = notes.split(/\r?\n/u);
  const parsedLines = [];
  const explicitSpeakers = [];
  const seenSpeakers = new Set();

  for (const line of lines) {
    const match = line.match(SPEAKER_MARKER_PATTERN);
    if (!match) {
      parsedLines.push({ type: "text", text: line });
      continue;
    }
    const speaker = normalizeSpeakerName(match[1]);
    if (!speaker) {
      parsedLines.push({ type: "text", text: line });
      continue;
    }
    const remainder = match[2] ?? "";
    parsedLines.push({ type: "speaker", speaker, text: remainder });
    const identity = speakerIdentityKey(speaker);
    if (!seenSpeakers.has(identity)) {
      seenSpeakers.add(identity);
      explicitSpeakers.push(speaker);
    }
  }

  const firstSpeaker = explicitSpeakers.length > 0 ? explicitSpeakers[0] : null;
  return {
    lines: parsedLines,
    explicitSpeakers,
    firstSpeaker,
    otherSpeakers: explicitSpeakers.slice(1),
  };
}

function renderNotesContent(parsedNotes) {
  if (!notesContent) {
    return;
  }
  notesContent.replaceChildren();
  const fragment = document.createDocumentFragment();
  const lines = Array.isArray(parsedNotes?.lines) ? parsedNotes.lines : [];
  if (lines.length === 0) {
    const line = document.createElement("div");
    line.className = "presenter__notes-line";
    line.textContent = "\u00a0";
    fragment.appendChild(line);
  } else {
    lines.forEach((entry) => {
      const line = document.createElement("div");
      line.className = "presenter__notes-line";
      if (entry?.type === "speaker") {
        line.classList.add("presenter__notes-line--speaker");
        line.style.setProperty("--speaker-hue", String(getSpeakerHue(entry.speaker)));
        line.appendChild(createSpeakerChip(entry.speaker));
        if (entry.text) {
          const remainder = document.createElement("span");
          remainder.className = "presenter__notes-line-text";
          remainder.textContent = entry.text;
          line.appendChild(remainder);
        }
      } else {
        const text = entry?.text ?? "";
        line.textContent = text || "\u00a0";
      }
      fragment.appendChild(line);
    });
  }
  notesContent.appendChild(fragment);
}

function setCurrentSlideSpeakers({ firstSpeaker, otherSpeakers, carried = false }) {
  currentSpeaker = firstSpeaker || null;

  if (!notesSpeakers) {
    return;
  }

  notesSpeakers.replaceChildren();
  if (!firstSpeaker) {
    notesSpeakers.dataset.empty = "true";
    return;
  }

  notesSpeakers.dataset.empty = "false";
  notesSpeakers.appendChild(createSpeakerChip(firstSpeaker, { carried, compact: true }));

  if (Array.isArray(otherSpeakers) && otherSpeakers.length > 0) {
    otherSpeakers.forEach((speaker) => {
      notesSpeakers.appendChild(createSpeakerChip(speaker, { compact: true }));
    });
  }
}

function setNotesDisplay(content, status, { renderSpeakers = true } = {}) {
  const notesText = typeof content === "string" ? content : "";
  const parsedNotes = parseNotesWithSpeakers(notesText);

  if (notesText && notesContent) {
    renderNotesContent(parsedNotes);
  } else if (notesContent) {
    notesContent.textContent = content;
  }

  if (notesStatus) {
    notesStatus.textContent = status;
  }

  if (!renderSpeakers) {
    return parsedNotes;
  }

  const firstSpeaker = parsedNotes.firstSpeaker;
  const resolvedSpeaker = firstSpeaker || currentSpeaker;
  const carried = !firstSpeaker && Boolean(resolvedSpeaker);
  const others = firstSpeaker ? parsedNotes.otherSpeakers : [];
  setCurrentSlideSpeakers({
    firstSpeaker: resolvedSpeaker,
    otherSpeakers: others,
    carried,
  });

  return parsedNotes;
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
    setNotesDisplay(NOTES_LOADING_TEXT, "Loading", { renderSpeakers: false });
  }

  try {
    const notes = await fetchNotesFromFiles(notesKey);
    notesCache.set(notesKey, notes);

    if (notesLoadingKey !== notesKey || notesSource === "none") {
      return;
    }

    if (notes) {
      setNotesDisplay(notes, "Notes file");
    } else {
      setNotesDisplay(NOTES_EMPTY_TEXT, "No notes");
    }
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
  } catch (error) {
    if (notesLoadingKey !== notesKey) {
      return;
    }
    setNotesDisplay("Unable to load notes.", "Error", { renderSpeakers: false });
  }
}

function getApiNotesForKey(notesKey) {
  const frames = [nextPreviewFrame, previewFrame];
  for (const frame of frames) {
    try {
      const api = frame?.contentWindow?.miniPresenter;
      if (api && typeof api.getNotes === "function") {
        const value = api.getNotes(notesKey);
        if (typeof value === "string") {
          return value;
        }
      }
    } catch {
      // ignore frame access and deck API errors
    }
  }
  return null;
}

async function fetchNotesFromFiles(notesKey) {
  const url = new URL(getRuntimeApiUrl("notes", "/_/api/notes"), location.origin);
  url.searchParams.set("hash", notesKey);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load notes (${response.status})`);
  }
  const data = await response.json();
  return typeof data?.notes === "string" ? data.notes : null;
}

function updateNotes({ slideId, hash, notes }) {
  if (!notesContent || !notesStatus) {
    return;
  }

  const notesKey = resolveNotesKey(slideId, hash);
  if (!notesKey) {
    return;
  }

  if (notesSource === "none") {
    setNotesDisplay(NOTES_DISABLED_TEXT, "Disabled", { renderSpeakers: false });
    setCurrentSlideSpeakers({ firstSpeaker: null, otherSpeakers: [] });
    return;
  }

  const apiNotes = typeof notes === "string" && notes ? notes : null;

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
  updatePresenterFavicon({ slideId: stateKey, hash: nextHash });
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
    if (timerStarted && currentSlideCountdownDuration > 0) {
      const actualMs = Math.max(0, timerElapsed - currentSlideCountdownStartElapsed);
      completedSlideTiming.push({ budgetMs: currentSlideCountdownDuration, actualMs });
      if (completedSlideTiming.length > 20) {
        completedSlideTiming = completedSlideTiming.slice(-20);
      }
    }
    lastSlideId = stateKey;
    updateCurrentSlideTimerState(nextHash);
    recordSlideState({ slideId, hash: nextHash });
    clearDrawings({ send: true });
    if (!timerStarted) {
      if (isCountdownMode()) {
        if (!countdownStartSlide) {
          countdownStartSlide = stateKey;
          updateTimerToggleLabel();
          updateTimerDisplay();
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
    handleConfigUpdate(message.config ?? {});
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

  if (message.type === "questions") {
    const questions = Array.isArray(message.questions) ? message.questions : [];
    renderQuestionsList(questions);
    updateQuestionsBadge(questions.length);
    if (questionsStatus) {
      questionsStatus.textContent = "Live update";
    }
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
  const useLocalTransport = isLocalMode();
  const createTransport = useLocalTransport
    ? getLocalTransportFactory()
    : getWebSocketTransportFactory();

  if (!createTransport) {
    updateConnectionStatus(false);
    return;
  }

  if (!transport) {
    let localSessionId = useLocalTransport ? getLocalSessionIdHint() : null;
    if (useLocalTransport && !localSessionId) {
      localSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      getRuntimeHelpers()?.setRuntime?.({
        local: {
          ...(getRuntimeSnapshot().local ?? {}),
          sessionId: localSessionId,
        },
      });
    }

    if (localSessionId) {
      sessionId = localSessionId;
    }

    const baseOptions = useLocalTransport
      ? {
          role: "presenter",
          sessionId: localSessionId,
        }
      : {
          url: getWebSocketUrl(),
        };

    transport = createTransport({
      ...baseOptions,
      onOpen: () => {
        updateConnectionStatus(true);
        const registerMessage = { type: "register", role: "presenter" };
        if (presenterKey) {
          registerMessage.key = presenterKey;
        }
        sendMessage(registerMessage);
      },
      onMessage: handleMessage,
      onClose: () => {
        updateConnectionStatus(false);
        scheduleReconnect();
      },
      onError: () => {
        updateConnectionStatus(false);
        scheduleReconnect();
      },
    });
  }

  transport.connect();
}

function handleKeyboard(event) {
  if (settingsOverlay?.dataset.open === "true") {
    return;
  }
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }

  const shortcutAction = resolveShortcutAction(event);
  if (shortcutAction === "recording") {
    event.preventDefault();
    toggleRecording();
    return;
  }
  if (shortcutAction === "questions") {
    event.preventDefault();
    toggleQuestionsOverlay();
    return;
  }

  if (recordingPlaybackActive) {
    return;
  }

  if (questionsOverlay?.dataset.open === "true") {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
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

async function handleSaveConfig() {
  if (!settingsSaveButton || settingsSaveButton.disabled) {
    return;
  }

  if (settingsStatus) {
    settingsStatus.textContent = "Saving…";
  }
  settingsSaveButton.disabled = true;

  try {
    const response = await fetch(buildConfigUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftConfig, null, 2),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Save failed (${response.status})`);
    }
    const payload = await response.json().catch(() => null);
    if (payload?.config) {
      handleConfigUpdate(payload.config, { force: true });
    } else {
      savedConfig = cloneConfig(draftConfig);
      updateSettingsDirtyState();
    }
    if (settingsStatus) {
      settingsStatus.textContent = "Saved.";
    }
  } catch (error) {
    if (settingsStatus) {
      settingsStatus.textContent = error.message || "Save failed.";
    }
  } finally {
    updateSettingsDirtyState();
  }
}

async function handleExportPdf() {
  if (!exportButton || exportButton.disabled) {
    return;
  }

  const label = exportButton.textContent || "Export PDF";
  exportButton.disabled = true;
  exportButton.textContent = "Exporting…";

  let failed = false;

  try {
    const response = await fetch(buildExportUrl("pdf"));
    if (!response.ok) {
      throw new Error(`Export failed (${response.status})`);
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "presentation.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1000);
  } catch (error) {
    failed = true;
    console.error("Failed to export PDF", error);
    exportButton.textContent = "Export failed";
    window.setTimeout(() => {
      if (exportButton) {
        exportButton.textContent = label;
      }
    }, 2000);
  } finally {
    exportButton.disabled = false;
    if (!failed) {
      exportButton.textContent = label;
    }
  }
}

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (recordingPlaybackActive) {
      return;
    }
    const action = button.dataset.action;
    if (action) {
      sendCommand(action);
    }
  });
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (recordingPlaybackActive) {
      return;
    }
    const tool = button.dataset.tool;
    if (tool) {
      setActiveTool(tool);
    }
  });
});

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (recordingPlaybackActive) {
      return;
    }
    const color = button.dataset.color;
    if (!color) {
      return;
    }
    const tool = activeTool === "none" ? "draw" : activeTool;
    setToolColor(tool, color);
    if (activeTool === "none") {
      setActiveTool("draw");
    }
  });
});

if (colorPickerInput) {
  colorPickerInput.addEventListener("input", () => {
    if (recordingPlaybackActive) {
      return;
    }
    const tool = activeTool === "none" ? "draw" : activeTool;
    setToolColor(tool, colorPickerInput.value, { fromPicker: true });
    if (activeTool === "none") {
      setActiveTool("draw");
    }
  });
}

if (sizeSlider) {
  sizeSlider.addEventListener("input", () => {
    if (recordingPlaybackActive) {
      return;
    }
    const size = Number(sizeSlider.value);
    const tool = activeTool === "laser" ? "laser" : "draw";
    setToolSize(tool, size);
    if (activeTool === "none") {
      setActiveTool("draw");
    }
  });
}

questionsToggleButton?.addEventListener("click", () => {
  toggleQuestionsOverlay();
});

recordingToggleButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  requestRecordingStart("main");
});

recordingConfirmButton?.addEventListener("click", () => {
  closeRecordingConfirmPopovers();
  startRecording();
});

recordingCancelButton?.addEventListener("click", () => {
  closeRecordingConfirmPopovers();
});

recordingPlayButton?.addEventListener("click", () => {
  togglePlayback();
});

exportButton?.addEventListener("click", () => {
  handleExportPdf();
});

settingsButton?.addEventListener("click", () => {
  openSettings();
});

settingsSaveButton?.addEventListener("click", () => {
  handleSaveConfig();
});

settingsCloseButton?.addEventListener("click", () => {
  closeSettings();
});

settingsOverlay?.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) {
    closeSettings();
  }
});

questionsOverlay?.addEventListener("click", (event) => {
  if (event.target === questionsOverlay) {
    closeQuestionsOverlay();
  }
});

questionsCloseButton?.addEventListener("click", () => {
  closeQuestionsOverlay();
});

questionsRefreshButton?.addEventListener("click", () => {
  fetchQuestions();
});

questionsConfirmCancel?.addEventListener("click", () => {
  pendingDeleteQuestionId = null;
  setQuestionsConfirmOpen(false);
});

questionsConfirmOverlay?.addEventListener("click", (event) => {
  if (event.target === questionsConfirmOverlay) {
    pendingDeleteQuestionId = null;
    setQuestionsConfirmOpen(false);
  }
});

questionsConfirmDelete?.addEventListener("click", async () => {
  if (!pendingDeleteQuestionId) {
    setQuestionsConfirmOpen(false);
    return;
  }
  const id = pendingDeleteQuestionId;
  pendingDeleteQuestionId = null;
  setQuestionsConfirmOpen(false);
  await deleteQuestion(id);
});

settingsJsonToggle?.addEventListener("click", () => {
  const nextView = settingsView === "json" ? "ui" : "json";
  setSettingsView(nextView);
});

settingsTitleInput?.addEventListener("input", () => {
  const value = settingsTitleInput.value.trim();
  updateDraftConfig((nextConfig) => {
    if (value) {
      nextConfig.title = value;
    } else {
      delete nextConfig.title;
    }
  });
});

setupKeyAutocomplete(settingsKeyNext);

settingsKeyNext?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateKeyboardConfig(nextConfig, "next", settingsKeyNext.value);
  });
});

setupKeyAutocomplete(settingsKeyPrev);
setupKeyAutocomplete(settingsKeyFirst);
setupKeyAutocomplete(settingsKeyLast);
setupKeyAutocomplete(settingsKeyFullscreen);
setupKeyAutocomplete(settingsKeyPresenter);
setupKeyAutocomplete(settingsKeyQuestions);
setupKeyAutocomplete(settingsKeyRecording);
hotkeyCaptureButtons.forEach((button) => {
  setupHotkeyCapture(button);
});

settingsKeyPrev?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateKeyboardConfig(nextConfig, "prev", settingsKeyPrev.value);
  });
});

settingsKeyFirst?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateKeyboardConfig(nextConfig, "first", settingsKeyFirst.value);
  });
});

settingsKeyLast?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateKeyboardConfig(nextConfig, "last", settingsKeyLast.value);
  });
});

settingsKeyFullscreen?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateShortcutConfig(nextConfig, "fullscreen", settingsKeyFullscreen.value);
  });
});

settingsKeyPresenter?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateShortcutConfig(nextConfig, "presenter", settingsKeyPresenter.value);
  });
});

settingsKeyQuestions?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateShortcutConfig(nextConfig, "questions", settingsKeyQuestions.value);
  });
});

settingsKeyRecording?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateShortcutConfig(nextConfig, "recording", settingsKeyRecording.value);
  });
});

settingsNotesSource?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateNotesConfig(nextConfig, settingsNotesSource.value);
  });
});

settingsPreviewRelative?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updatePreviewConfig(nextConfig, settingsPreviewRelative.checked);
  });
});

settingsTimerMode?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateTimerConfig(nextConfig);
  });
});

settingsTimerMinutes?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateTimerConfig(nextConfig);
  });
});

settingsTimerSeconds?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateTimerConfig(nextConfig);
  });
});

settingsRecordingDevice?.addEventListener("change", () => {
  updateDraftConfig((nextConfig) => {
    updateRecordingConfig(nextConfig, settingsRecordingDevice.value);
  });
});

settingsRecordingToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  requestRecordingStart("settings");
});

settingsRecordingConfirmButton?.addEventListener("click", () => {
  closeRecordingConfirmPopovers();
  startRecording();
});

settingsRecordingCancelButton?.addEventListener("click", () => {
  closeRecordingConfirmPopovers();
});

settingsJson?.addEventListener("focus", () => {
  jsonEditing = true;
});

settingsJson?.addEventListener("blur", () => {
  jsonEditing = false;
  if (jsonIsValid) {
    syncSettingsJson({ force: true });
  }
});

settingsJson?.addEventListener("input", () => {
  const raw = settingsJson.value.trim();
  if (settingsStatus) {
    settingsStatus.textContent = "";
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Config must be an object");
    }
    setJsonValidity(true);
    draftConfig = sanitizeConfig(parsed);
    applyDraftConfig({ source: "json" });
  } catch (error) {
    setJsonValidity(false, error.message || "Invalid JSON");
  }
});

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
  if (recordingConfirmPopover?.dataset.open === "true") {
    if (
      !recordingConfirmPopover.contains(event.target) &&
      !recordingToggleButton?.contains(event.target)
    ) {
      closeRecordingConfirmPopovers();
    }
  }
  if (settingsRecordingConfirmPopover?.dataset.open === "true") {
    if (
      !settingsRecordingConfirmPopover.contains(event.target) &&
      !settingsRecordingToggle?.contains(event.target)
    ) {
      closeRecordingConfirmPopovers();
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeClearPopover();
    closeResetPopover();
    closeRecordingConfirmPopovers();
    closeSettings();
    closeQuestionsOverlay();
    pendingDeleteQuestionId = null;
    setQuestionsConfirmOpen(false);
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
    refreshSlideDurationsFromPreview();
    if (lastKnownHash) {
      updateCurrentSlideTimerState(lastKnownHash);
    }
    updateNextPreview({ slideId: lastSlideId, hash: lastKnownHash });
    updateTimerDisplay();
  });
}

if (nextPreviewFrame) {
  nextPreviewFrame.addEventListener("load", () => {
    nextPreviewReady = false;
    handleRelativeNextPreviewLoad();
    if (nextPreviewSpeakersKey) {
      updateNextPreviewSpeakers(nextPreviewSpeakersKey);
    }
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
setNotesDisplay("Waiting for slide updates…", "Idle", { renderSpeakers: false });
setCurrentSlideSpeakers({ firstSpeaker: null, otherSpeakers: [] });
setNextPreviewPlaceholder(NEXT_PREVIEW_WAITING_TEXT);
setNextPreviewSpeakersPlaceholder(NEXT_PREVIEW_SPEAKER_UNKNOWN_TEXT);
setupPresenterLayout();
setupPresenterFavicon();
attachDrawingHandlers();
syncToolControls();
setActiveTool("none");
updateRecordingControls();
fetchRecordingData({ force: true });
refreshRecordingDevices();
if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    refreshRecordingDevices();
  });
}
fetchQuestions({ silent: true }).finally(() => {
  startQuestionsPolling();
});
connect();

window.addEventListener("beforeunload", () => {
  stopTimerInterval();
  stopQuestionsPolling();
  if (recordingRecorder && recordingRecorder.state !== "inactive") {
    recordingRecorder.stop();
  }
  stopPlayback();
  stopRecordingStream();
  transport?.close();
});
