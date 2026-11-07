// `presenter.json` schema and resolution of user config into effective settings.

import { isRecord, type NavAction } from "./protocol.ts";

export type NotesSource = "auto" | "api" | "files" | "none";
export type TimerMode = "countup" | "countdown-total" | "countdown-slide";
export type ShortcutAction = "fullscreen" | "presenter" | "questions" | "recording";

export interface TimerConfig {
  mode?: TimerMode | "countdown";
  durationMinutes?: number;
  durationSeconds?: number;
  transitionSeconds?: number;
  defaultSlideSeconds?: number;
  slides?: Record<string, number>;
}

export interface ToolConfig {
  color?: string;
  size?: number;
}

/** The shape of `presenter.json`. Unknown keys are preserved on save. */
export interface PresenterConfig {
  title?: string;
  keyboard?: Partial<Record<NavAction, string[]>>;
  shortcuts?: Partial<Record<ShortcutAction, string[]>>;
  notes?: { source?: NotesSource };
  preview?: { relativeHash?: boolean };
  timer?: TimerConfig;
  draw?: ToolConfig;
  laser?: ToolConfig;
  recording?: { deviceId?: string };
  [key: string]: unknown;
}

export const DEFAULT_KEYBOARD: Record<NavAction, string[]> = {
  next: ["ArrowRight", "PageDown", "Space"],
  prev: ["ArrowLeft", "PageUp"],
  first: ["Home"],
  last: ["End"],
};

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string[]> = {
  fullscreen: ["f"],
  presenter: ["p"],
  questions: ["q"],
  recording: ["Shift+R"],
};

export const DEFAULT_DRAW = { color: "#ff4d4d", size: 0.004 };
export const DEFAULT_LASER = { color: "#ffdd4d", size: 0.012 };
export const DEFAULT_TRANSITION_MS = 2000;

export interface ResolvedTimer {
  mode: TimerMode;
  /** Explicit total duration in ms (0 when derived from slide durations). */
  totalMs: number;
  transitionMs: number;
  defaultSlideMs: number;
  /** Per-slide durations in ms keyed by normalized hash (`#intro`). */
  slides: Map<string, number>;
}

export interface ResolvedConfig {
  title: string | null;
  keyboard: Record<NavAction, string[]>;
  shortcuts: Record<ShortcutAction, string[]>;
  notesSource: NotesSource;
  relativeHash: boolean;
  timer: ResolvedTimer;
  draw: { color: string; size: number };
  laser: { color: string; size: number };
  recordingDeviceId: string | null;
}

/** Parses an untrusted value (e.g. JSON from disk) into a config object. */
export function parseConfig(value: unknown): PresenterConfig {
  return isRecord(value) ? (value as PresenterConfig) : {};
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const list = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function positive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeSlideKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function resolveTimer(timer: unknown): ResolvedTimer {
  const raw = isRecord(timer) ? timer : {};
  const mode: TimerMode =
    raw.mode === "countdown" || raw.mode === "countdown-total"
      ? "countdown-total"
      : raw.mode === "countdown-slide"
        ? "countdown-slide"
        : "countup";

  const minutes = positive(raw.durationMinutes);
  const seconds = positive(raw.durationSeconds ?? raw.duration);
  const totalMs = minutes ? minutes * 60_000 : seconds ? seconds * 1000 : 0;

  const transition = Number(raw.transitionSeconds);
  const transitionMs =
    Number.isFinite(transition) && transition >= 0 ? Math.round(transition * 1000) : DEFAULT_TRANSITION_MS;
  const defaultSlideMs = Math.round((positive(raw.defaultSlideSeconds) ?? 0) * 1000);

  const slides = new Map<string, number>();
  if (isRecord(raw.slides)) {
    for (const [key, value] of Object.entries(raw.slides)) {
      const slideKey = normalizeSlideKey(key);
      const secs = positive(value);
      if (slideKey && secs) {
        slides.set(slideKey, Math.round(secs * 1000));
      }
    }
  }

  return { mode, totalMs: Math.round(totalMs), transitionMs, defaultSlideMs, slides };
}

function resolveTool(value: unknown, fallback: { color: string; size: number }) {
  const raw = isRecord(value) ? value : {};
  return {
    color: typeof raw.color === "string" && raw.color ? raw.color : fallback.color,
    size: positive(raw.size) ?? fallback.size,
  };
}

export function resolveConfig(config: PresenterConfig): ResolvedConfig {
  const keyboard = isRecord(config.keyboard) ? config.keyboard : {};
  const shortcuts = isRecord(config.shortcuts) ? config.shortcuts : {};
  const notes = isRecord(config.notes) ? config.notes : {};
  const preview = isRecord(config.preview) ? config.preview : {};
  const recording = isRecord(config.recording) ? config.recording : {};
  const source = notes.source;

  return {
    title: typeof config.title === "string" && config.title.trim() ? config.title.trim() : null,
    keyboard: {
      next: stringList(keyboard.next, DEFAULT_KEYBOARD.next),
      prev: stringList(keyboard.prev, DEFAULT_KEYBOARD.prev),
      first: stringList(keyboard.first, DEFAULT_KEYBOARD.first),
      last: stringList(keyboard.last, DEFAULT_KEYBOARD.last),
    },
    shortcuts: {
      fullscreen: stringList(shortcuts.fullscreen, DEFAULT_SHORTCUTS.fullscreen),
      presenter: stringList(shortcuts.presenter, DEFAULT_SHORTCUTS.presenter),
      questions: stringList(shortcuts.questions, DEFAULT_SHORTCUTS.questions),
      recording: stringList(shortcuts.recording, DEFAULT_SHORTCUTS.recording),
    },
    notesSource: source === "api" || source === "files" || source === "none" ? source : "auto",
    relativeHash: preview.relativeHash === true,
    timer: resolveTimer(config.timer),
    draw: resolveTool(config.draw, DEFAULT_DRAW),
    laser: resolveTool(config.laser, DEFAULT_LASER),
    recordingDeviceId:
      typeof recording.deviceId === "string" && recording.deviceId ? recording.deviceId : null,
  };
}

/** Strips runtime-only keys that older versions merged into the config. */
export function sanitizeConfig(config: PresenterConfig): PresenterConfig {
  const { sessionId: _sessionId, _runtime, runtime: _legacyRuntime, externalUrl: _externalUrl, ...rest } =
    config;
  return rest;
}
