// Behavior inside presenter preview iframes (`?_presenter_preview=1`): stay
// silent, follow `goto` requests and report state to the presenter.

import { isRecord, type PreviewMessage, type PreviewState } from "../../shared/protocol.ts";
import { currentHash, currentSlideId, deckNotes, goto, slideOrder, slideTimes, watchDeckState } from "./deck.ts";

function markPreview(): void {
  if (!window.miniPresenter || typeof window.miniPresenter !== "object") {
    window.miniPresenter = {};
  }
  try {
    window.miniPresenter.isPresenterPreview = true;
  } catch {
    // read-only deck API
  }
  document.documentElement.dataset.presenterPreview = "true";
}

function muteMedia(): void {
  const mute = (element: HTMLMediaElement) => {
    element.muted = true;
    element.volume = 0;
    element.autoplay = false;
    element.removeAttribute("autoplay");
  };
  const muteAll = () => document.querySelectorAll("audio, video").forEach((element) => mute(element as HTMLMediaElement));
  for (const type of ["play", "playing", "volumechange", "loadedmetadata"]) {
    document.addEventListener(type, (event) => event.target instanceof HTMLMediaElement && mute(event.target), true);
  }
  muteAll();
  new MutationObserver(muteAll).observe(document.documentElement, { childList: true, subtree: true });
}

export function runPreview(): void {
  markPreview();
  muteMedia();

  let lastKey = "";
  let seq = 0;
  const report = () => {
    if (window.parent === window) return;
    const slideId = currentSlideId();
    const state: PreviewState = { seq, slideId, hash: currentHash(), title: document.title };
    const notes = deckNotes(slideId);
    if (notes !== undefined) state.notes = notes;
    const order = slideOrder();
    if (order) state.slideOrder = order;
    const times = slideTimes();
    if (times) state.slideTimes = times;
    const key = JSON.stringify(state);
    if (key !== lastKey) {
      lastKey = key;
      const message: PreviewMessage = { type: "miniPresenterPreviewState", ...state };
      window.parent.postMessage(message, "*");
    }
  };

  addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data: unknown = event.data;
    if (isRecord(data) && data.type === "miniPresenterPreview" && data.action === "goto" && typeof data.hash === "string") {
      seq = typeof data.seq === "number" ? data.seq : seq;
      goto(data.hash);
      // Force a fresh report even if the deck resolves to the same state.
      lastKey = "";
      queueMicrotask(report);
    }
  });

  watchDeckState(report, 300);
  if (document.readyState === "complete") {
    report();
  } else {
    addEventListener("load", report, { once: true });
  }
}
