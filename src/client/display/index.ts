// The display script. The server injects it into every HTML page of the deck;
// in standalone mode `standalone.js` loads it from the CDN.

import { DEFAULT_SHORTCUTS, parseConfig, resolveConfig, type PresenterConfig } from "../../shared/config.ts";
import { PREVIEW_PARAM, ROUTES, shareBaseUrl, type ServerMessage, type SessionInfo } from "../../shared/protocol.ts";
import { isEditableTarget, resolveAction } from "../../shared/shortcuts.ts";
import type { LocalContext } from "../lib/globals.ts";
import { presenterWindowFeatures } from "../lib/popup.ts";
import {
  createLocalDisplayTransport,
  createWebSocketTransport,
  webSocketUrl,
  type Transport,
} from "../lib/transport.ts";
import { currentHash, currentSlideId, deckNotes, goto, navigate, slideOrder, surface, viewport, watchDeckState } from "./deck.ts";
import { mountOverlay } from "./overlay.ts";
import { runPreview } from "./preview.ts";

function isPreview(): boolean {
  return new URLSearchParams(location.search).has(PREVIEW_PARAM);
}

async function loadLocalConfig(context: LocalContext): Promise<PresenterConfig> {
  const deck = window.miniPresenter;
  try {
    const provided = typeof deck?.getConfig === "function" ? deck.getConfig() : deck?.config;
    if (provided && typeof provided === "object") {
      return parseConfig(JSON.parse(JSON.stringify(provided)));
    }
  } catch {
    // fall back to presenter.json
  }
  try {
    const response = await fetch(new URL("presenter.json", context.deckUrl), { cache: "no-store" });
    if (response.ok) {
      return parseConfig(await response.json());
    }
  } catch {
    // no config
  }
  return {};
}

function boot(): void {
  window.__miniPresenterDisplayInjected = true;
  if (isPreview()) {
    runPreview();
    return;
  }

  const local = window.__miniPresenterLocal ?? null;
  let config: PresenterConfig = {};
  let session: SessionInfo | null = local
    ? {
        sessionId: local.sessionId,
        mode: "local",
        externalUrl: null,
        lanUrl: null,
        capabilities: { questions: false, export: false, recording: false, configSave: false, notesFiles: false },
      }
    : null;
  let shortcuts = DEFAULT_SHORTCUTS;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const openPresenter = () => {
    const features = presenterWindowFeatures(window.screen);
    if (local) {
      const popup = window.miniPresenterStandalone?.openPresenterWindow({
        sessionId: local.sessionId,
        deckUrl: local.deckUrl,
      });
      if (!popup) {
        // Popup shell unavailable: open the hosted presenter page directly.
        const url = new URL("presenter.html", local.assetBase);
        url.search = new URLSearchParams({ mp_mode: "local", mp_session: local.sessionId, mp_deck: local.deckUrl }).toString();
        window.open(url, "miniPresenterView", features);
      }
      return;
    }
    window.open(ROUTES.presenter, "miniPresenterView", features);
  };

  const overlay = mountOverlay({
    fullscreen: toggleFullscreen,
    presenter: openPresenter,
    prev: () => navigate("prev"),
    next: () => navigate("next"),
  });

  const toggleQuestions = () => {
    if (!session?.capabilities.questions) return;
    const url = new URL(ROUTES.questions, shareBaseUrl(session, location.origin)).toString();
    overlay.toggleQuestions(ROUTES.api.questionsQr, url);
  };

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case "navigate":
        navigate(message.action);
        return;
      case "goto":
        goto(message.hash);
        return;
      case "draw":
        overlay.ink.apply(message);
        return;
      case "config":
        config = message.config;
        session = message.session;
        shortcuts = resolveConfig(config).shortcuts;
        return;
      case "reload":
        if (message.preserveHash) {
          location.reload();
        } else {
          location.href = location.pathname;
        }
        return;
    }
  };

  let lastReport = "";
  let transport: Transport;
  const report = (force = false) => {
    const slideId = currentSlideId();
    const rect = surface();
    overlay.setSurface(rect);
    const state = {
      slideId,
      hash: currentHash(),
      viewport: viewport(rect),
      title: document.title,
      notes: deckNotes(slideId),
      slideOrder: slideOrder(),
    };
    const key = JSON.stringify(state);
    if (!force && key === lastReport) return;
    if (transport.send({ type: "state", ...state, sessionId: session?.sessionId })) {
      lastReport = key;
    }
  };

  if (local) {
    const localTransport = createLocalDisplayTransport({
      sessionId: local.sessionId,
      getConfig: () => ({ config, session: session! }),
      onMessage: handleMessage,
    });
    transport = localTransport;
    void loadLocalConfig(local).then((loaded) => {
      config = loaded;
      shortcuts = resolveConfig(config).shortcuts;
      localTransport.broadcastConfig();
    });
  } else {
    transport = createWebSocketTransport(webSocketUrl(ROUTES.ws), "display", {
      onMessage: handleMessage,
      onStatus: (status) => {
        if (status === "open") report(true);
      },
    }, () => ({ type: "register", role: "display", sessionId: session?.sessionId }));
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || isEditableTarget(event.target)) return;
    const action = resolveAction(event, shortcuts);
    if (!action || action === "recording") return;
    if (action === "questions" && !session?.capabilities.questions) return;
    event.preventDefault();
    if (action === "fullscreen") toggleFullscreen();
    else if (action === "presenter") openPresenter();
    else toggleQuestions();
  });

  transport.start();
  watchDeckState(() => report());
  report(true);
}

if (!window.__miniPresenterDisplayInjected) {
  boot();
}
