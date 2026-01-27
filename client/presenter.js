const timerDisplay = document.querySelector("#timer");
const currentSlideDisplay = document.querySelector("#current-slide");
const displayCountDisplay = document.querySelector("#display-count");
const connectionStatus = document.querySelector("#connection-status");
const previewPlaceholder = document.querySelector("#preview-placeholder");
const timerToggleButton = document.querySelector("#timer-toggle");
const timerResetButton = document.querySelector("#timer-reset");
const actionButtons = document.querySelectorAll("[data-action]");

const RECONNECT_DELAY_MS = 1000;
const TIMER_INTERVAL_MS = 250;

let ws = null;
let reconnectTimer = null;
let timerInterval = null;
let timerRunning = false;
let timerStarted = false;
let timerElapsed = 0;
let lastTick = 0;
let lastSlideId = null;

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

function updateSlideState({ slideId, hash, displays }) {
  const stateKey = slideId || hash || "—";
  currentSlideDisplay.textContent = stateKey;

  if (typeof displays === "number") {
    displayCountDisplay.textContent = displays;
    previewPlaceholder.textContent =
      displays > 0
        ? "Display connected. Presenter controls are active."
        : "Waiting for display connection…";
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

  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
      event.preventDefault();
      sendCommand("next");
      break;
    case " ":
    case "Spacebar":
      event.preventDefault();
      sendCommand("next");
      break;
    case "ArrowLeft":
    case "PageUp":
      event.preventDefault();
      sendCommand("prev");
      break;
    case "Home":
      event.preventDefault();
      sendCommand("first");
      break;
    case "End":
      event.preventDefault();
      sendCommand("last");
      break;
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
connect();

window.addEventListener("beforeunload", () => {
  stopTimerInterval();
  if (ws) {
    ws.close();
  }
});
