// Reads state from and drives the deck, via `window.miniPresenter` when the
// deck provides it and via URL hashes / keyboard events otherwise.

import { normalizeSlideKey } from "../../shared/config.ts";
import type { NavAction, Viewport } from "../../shared/protocol.ts";
import type { DeckApi } from "../lib/globals.ts";

function api(): DeckApi | null {
  const value = window.miniPresenter;
  return value && (typeof value === "object" || typeof value === "function") ? value : null;
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function currentSlideId(): string {
  const id = attempt(() => api()?.getCurrentSlide?.());
  return typeof id === "string" && id ? id : location.hash || "#";
}

export function currentHash(): string {
  return location.hash || "#";
}

/** Notes from the deck API: `undefined` when the deck has no notes API. */
export function deckNotes(slideId: string): string | null | undefined {
  const deck = api();
  if (typeof deck?.getNotes !== "function") {
    return undefined;
  }
  const notes = attempt(() => deck.getNotes!(slideId));
  return typeof notes === "string" ? notes : null;
}

export function slideOrder(): string[] | undefined {
  const list = attempt(() => api()?.getSlideList?.());
  if (!Array.isArray(list)) {
    return undefined;
  }
  const filtered = list.filter((entry): entry is string => typeof entry === "string");
  return filtered.length > 0 ? filtered : undefined;
}

const SURFACE_SELECTORS = ["[data-mini-presenter-viewport]", "[data-presenter-viewport]", ".deck", ".reveal .slides", ".slides"];

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The on-screen slide surface. Drawings are normalized to this rectangle and
 * the presenter preview uses its aspect ratio.
 */
export function surface(): Rect {
  const reported = attempt(() => api()?.getViewport?.());
  const width = Number(reported?.width);
  const height = Number(reported?.height);
  if (width > 0 && height > 0) {
    // The deck reports a logical size: center it in the window like a fitted canvas.
    const scale = Math.min(innerWidth / width, innerHeight / height);
    return {
      left: (innerWidth - width * scale) / 2,
      top: (innerHeight - height * scale) / 2,
      width: width * scale,
      height: height * scale,
    };
  }
  for (const selector of SURFACE_SELECTORS) {
    let best: DOMRect | null = null;
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (!best || rect.width * rect.height > best.width * best.height)) {
        best = rect;
      }
    }
    if (best) {
      return { left: best.left, top: best.top, width: best.width, height: best.height };
    }
  }
  return { left: 0, top: 0, width: innerWidth, height: innerHeight };
}

export function viewport(rect: Rect = surface()): Viewport {
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
}

/** Parses `45`, `1:30` or `1:02:03` into milliseconds. */
export function parseSlideTime(value: string | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? Math.round(seconds * 1000) : null;
  }
  const parts = trimmed.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds * 1000) : null;
}

/** Per-slide durations declared with `data-slide-time`. */
export function slideTimes(): Record<string, number> | undefined {
  const times: Record<string, number> = {};
  let found = false;
  for (const node of document.querySelectorAll("[data-slide-time]")) {
    const duration = parseSlideTime(node.getAttribute("data-slide-time"));
    if (!duration) continue;
    for (const attribute of ["data-slide-hash", "data-slide-id", "data-slide", "id"]) {
      const key = normalizeSlideKey(node.getAttribute(attribute));
      if (key) {
        times[key] = duration;
        found = true;
      }
    }
  }
  return found ? times : undefined;
}

const KEYS: Record<NavAction, string> = { next: "ArrowRight", prev: "ArrowLeft", first: "Home", last: "End" };

export function navigate(action: NavAction): void {
  const deck = api();
  const method = deck?.[action];
  if (typeof method === "function") {
    method.call(deck);
    return;
  }
  // Without first()/last(), jump via the slide list when the deck exposes one.
  if (action === "first" || action === "last") {
    const order = slideOrder();
    const hash = order && (action === "first" ? order[0] : order[order.length - 1]);
    if (hash) {
      goto(hash);
      return;
    }
  }
  const target = document.body ?? document.documentElement;
  const init = { key: KEYS[action], code: KEYS[action], bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

export function goto(hash: string): void {
  // Relative preview hashes (`#3~next`) are a URL convention the deck resolves
  // in its hash handler; its `goto()` usually does not understand them.
  if (/~(next|prev)$/u.test(hash)) {
    if (location.hash === hash) {
      dispatchEvent(new HashChangeEvent("hashchange"));
    } else {
      location.hash = hash;
    }
    return;
  }
  const deck = api();
  if (typeof deck?.goto === "function") {
    deck.goto(hash);
  } else if (hash && location.hash !== hash) {
    location.hash = hash;
  }
}

/** Calls `callback` whenever the slide may have changed (hash, history, resize, polling). */
export function watchDeckState(callback: () => void, pollMs = 250): () => void {
  const patched: Array<[keyof History, History[keyof History]]> = [];
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    patched.push([method, original]);
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      queueMicrotask(callback);
      return result;
    };
  }
  addEventListener("hashchange", callback);
  addEventListener("popstate", callback);
  addEventListener("resize", callback);
  const timer = setInterval(callback, pollMs);
  return () => {
    for (const [method, original] of patched) {
      (history as unknown as Record<string, unknown>)[method] = original;
    }
    removeEventListener("hashchange", callback);
    removeEventListener("popstate", callback);
    removeEventListener("resize", callback);
    clearInterval(timer);
  };
}
