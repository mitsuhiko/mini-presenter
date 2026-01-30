const form = document.querySelector("#questions-form");
const input = document.querySelector("#question-input");
const submitButton = document.querySelector("#questions-submit");
const list = document.querySelector("#questions-list");
const status = document.querySelector("#questions-status");
const refreshButton = document.querySelector("#questions-refresh");
const hint = document.querySelector("#questions-hint");

const QUESTIONS_POLL_MS = 8000;
const VOTE_STORAGE_KEY = "miniPresenterQuestionVotes";
const WS_RECONNECT_DELAY_MS = 1000;
let pollTimer = null;
let votedQuestions = new Set();
let ws = null;
let reconnectTimer = null;
let wsConnected = false;

function buildQuestionsApiUrl() {
  return new URL("/_/api/questions", window.location.origin);
}

function buildVoteUrl() {
  return new URL("/_/api/questions/vote", window.location.origin);
}

function loadVoteState() {
  try {
    const raw = window.localStorage.getItem(VOTE_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((value) => typeof value === "string"));
  } catch (error) {
    return new Set();
  }
}

function saveVoteState() {
  try {
    window.localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify([...votedQuestions]));
  } catch (error) {
    // ignore
  }
}

function formatTime(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setStatus(message) {
  if (status) {
    status.textContent = message;
  }
}

function setHint(message, { error = false } = {}) {
  if (!hint) {
    return;
  }
  hint.textContent = message;
  hint.style.color = error ? "#d96a6a" : "";
}

function renderQuestions(questions) {
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!questions.length) {
    const empty = document.createElement("div");
    empty.className = "questions__empty";
    empty.textContent = "No questions yet.";
    list.appendChild(empty);
    return;
  }

  const sorted = [...questions].sort((a, b) => {
    const voteDiff = (b.votes ?? 0) - (a.votes ?? 0);
    if (voteDiff !== 0) {
      return voteDiff;
    }
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  sorted.forEach((question) => {
    const card = document.createElement("div");
    card.className = "question-card";
    if (question.answered) {
      card.dataset.answered = "true";
    }

    const votes = document.createElement("div");
    votes.className = "question-card__votes";
    votes.textContent = `${question.votes ?? 0}▲`;

    const content = document.createElement("div");
    const text = document.createElement("div");
    text.className = "question-card__text";
    text.textContent = question.text ?? "";
    const meta = document.createElement("div");
    meta.className = "question-card__meta";
    const time = formatTime(question.createdAt);
    const status = question.answered ? "Answered" : null;
    meta.textContent = time && status ? `Asked at ${time} · ${status}` : status || (time ? `Asked at ${time}` : "");
    content.appendChild(text);
    if (meta.textContent) {
      content.appendChild(meta);
    }

    const voteButton = document.createElement("button");
    voteButton.type = "button";
    voteButton.className = "question-card__vote";
    const hasVoted = votedQuestions.has(question.id);
    const isAnswered = question.answered === true;
    voteButton.textContent = isAnswered ? "Answered" : hasVoted ? "Voted" : "Vote";
    voteButton.disabled = isAnswered || hasVoted;
    voteButton.addEventListener("click", () => {
      voteButton.disabled = true;
      submitVote(question.id).finally(() => {
        voteButton.disabled = votedQuestions.has(question.id) || question.answered === true;
        voteButton.textContent = question.answered ? "Answered" : votedQuestions.has(question.id) ? "Voted" : "Vote";
      });
    });

    card.appendChild(votes);
    card.appendChild(content);
    card.appendChild(voteButton);
    list.appendChild(card);
  });
}

async function fetchQuestions({ silent = false } = {}) {
  try {
    const response = await fetch(buildQuestionsApiUrl());
    if (response.status === 501 || response.status === 404) {
      setStatus("Questions are unavailable for this presentation.");
      submitButton?.setAttribute("disabled", "true");
      stopPolling();
      if (ws) {
        ws.close();
      }
      return;
    }
    if (!response.ok) {
      throw new Error(`Failed to load questions (${response.status})`);
    }
    const data = await response.json();
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    renderQuestions(questions);
    if (!silent) {
      const now = new Date();
      setStatus(`Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }
  } catch (error) {
    if (!silent) {
      setStatus(error.message || "Unable to load questions.");
    }
  }
}

async function submitQuestion(text) {
  const response = await fetch(buildQuestionsApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Failed to submit question (${response.status})`);
  }
  return response.json();
}

async function submitVote(id) {
  const response = await fetch(buildVoteUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    return;
  }
  const payload = await response.json().catch(() => null);
  if (payload?.voted || payload?.question?.answered) {
    votedQuestions.add(id);
    saveVoteState();
  }
  await fetchQuestions({ silent: true });
}

function schedulePolling() {
  if (pollTimer || wsConnected) {
    return;
  }
  pollTimer = setInterval(() => {
    fetchQuestions({ silent: true });
  }, QUESTIONS_POLL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function getWebSocketUrl() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/_/ws`;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, WS_RECONNECT_DELAY_MS);
}

function connectWebSocket() {
  if (ws) {
    ws.close();
  }
  ws = new WebSocket(getWebSocketUrl());
  ws.addEventListener("open", () => {
    wsConnected = true;
    stopPolling();
    ws.send(JSON.stringify({ type: "register", role: "questions" }));
  });
  ws.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    if (message.type === "questions") {
      const questions = Array.isArray(message.questions) ? message.questions : [];
      renderQuestions(questions);
      setStatus("Live update");
    }
  });
  ws.addEventListener("close", () => {
    wsConnected = false;
    schedulePolling();
    scheduleReconnect();
  });
  ws.addEventListener("error", () => {
    wsConnected = false;
    schedulePolling();
    scheduleReconnect();
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!input || !submitButton) {
    return;
  }
  const text = input.value.trim();
  if (!text) {
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  setHint("Sending question…");
  try {
    await submitQuestion(text);
    input.value = "";
    setHint("Question submitted. Thanks!");
    await fetchQuestions({ silent: true });
  } catch (error) {
    setHint(error.message || "Failed to submit question.", { error: true });
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send question";
  }
});

refreshButton?.addEventListener("click", () => {
  fetchQuestions();
});

votedQuestions = loadVoteState();
fetchQuestions({ silent: true });
connectWebSocket();
schedulePolling();
