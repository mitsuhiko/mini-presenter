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
const settingsJson = document.querySelector("#settings-json");
const settingsJsonStatus = document.querySelector("#settings-json-status");
const brandDisplay = document.querySelector(".presenter__brand");
const notesStatus = document.querySelector("#notes-status");
const notesContent = document.querySelector("#notes-content");
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

function buildExportUrl(format) {
  const url = new URL("/_/api/export", window.location.origin);
  if (format) {
    url.searchParams.set("format", format);
  }
  if (presenterKey) {
    url.searchParams.set("key", presenterKey);
  }
  return url.toString();
}

function buildConfigUrl() {
  const url = new URL("/_/api/config", window.location.origin);
  if (presenterKey) {
    url.searchParams.set("key", presenterKey);
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
};

const QUESTIONS_POLL_INTERVAL_MS = 6000;

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
  const { sessionId: _sessionId, ...rest } = config;
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
  const nextTimerMode = timerConfig?.mode === "countdown" ? "countdown" : "countup";
  const nextCountdownDuration = resolveCountdownDuration(timerConfig);
  const timerChanged = nextTimerMode !== timerMode || nextCountdownDuration !== countdownDuration;
  timerMode = nextTimerMode;
  countdownDuration = nextCountdownDuration;
  if (timerChanged) {
    countdownStartSlide = null;
    timerElapsed = 0;
    timerRunning = false;
    timerStarted = false;
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
    settingsTimerMode.value = timerConfig?.mode === "countdown" ? "countdown" : "countup";
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
  const mode = settingsTimerMode?.value === "countdown" ? "countdown" : "countup";
  if (mode === "countdown") {
    timer.mode = "countdown";
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
  return new URL("/_/questions/qr", window.location.origin).toString();
}

function buildQuestionsApiUrl() {
  return new URL("/_/api/questions", window.location.origin).toString();
}

function buildQuestionsDeleteUrl() {
  const url = new URL("/_/api/questions/delete", window.location.origin);
  if (presenterKey) {
    url.searchParams.set("key", presenterKey);
  }
  return url.toString();
}

function buildQuestionsAnswerUrl() {
  const url = new URL("/_/api/questions/answer", window.location.origin);
  if (presenterKey) {
    url.searchParams.set("key", presenterKey);
  }
  return url.toString();
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
  if (settingsOverlay?.dataset.open === "true") {
    return;
  }
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }

  const shortcutAction = resolveShortcutAction(event);
  if (shortcutAction === "questions") {
    event.preventDefault();
    toggleQuestionsOverlay();
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
    const tool = activeTool === "none" ? "draw" : activeTool;
    setToolColor(tool, colorPickerInput.value, { fromPicker: true });
    if (activeTool === "none") {
      setActiveTool("draw");
    }
  });
}

if (sizeSlider) {
  sizeSlider.addEventListener("input", () => {
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
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeClearPopover();
    closeResetPopover();
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
syncToolControls();
setActiveTool("none");
fetchQuestions({ silent: true }).finally(() => {
  startQuestionsPolling();
});
connect();

window.addEventListener("beforeunload", () => {
  stopTimerInterval();
  stopQuestionsPolling();
  if (ws) {
    ws.close();
  }
});
