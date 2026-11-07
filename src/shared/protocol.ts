// Wire protocol shared by the server hub, the injected display script, the
// presenter view, and the local (BroadcastChannel) transport.

import type { PresenterConfig } from "./config.ts";

export type Role = "display" | "presenter" | "questions";
export type NavAction = "next" | "prev" | "first" | "last";

export interface Viewport {
  width: number;
  height: number;
}

export interface SlideState {
  slideId: string;
  hash: string;
  /** Notes provided by the deck API. `undefined` when the deck has no notes API. */
  notes?: string | null;
  viewport?: Viewport;
  /** Slide order as reported by `getSlideList()`. */
  slideOrder?: string[];
  title?: string;
}

export interface Capabilities {
  questions: boolean;
  export: boolean;
  recording: boolean;
  configSave: boolean;
  notesFiles: boolean;
}

export type RuntimeMode = "server" | "local";

export interface SessionInfo {
  sessionId: string;
  mode: RuntimeMode;
  capabilities: Capabilities;
  /** Public tunnel URL (`--funnel`). */
  externalUrl: string | null;
  /** A network address of this machine, when the server listens on all interfaces. */
  lanUrl: string | null;
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || hostname === "::1" || hostname.startsWith("127.");
}

/** Base URL the audience should use: the tunnel, else a LAN address instead of localhost. */
export function shareBaseUrl(session: Pick<SessionInfo, "externalUrl" | "lanUrl"> | null, origin: string): string {
  if (session?.externalUrl) {
    return session.externalUrl;
  }
  if (session?.lanUrl && isLoopbackHostname(new URL(origin).hostname)) {
    return session.lanUrl;
  }
  return origin;
}

export type DrawMessage =
  | { type: "draw"; action: "start" | "move" | "end"; x: number; y: number; color?: string; size?: number }
  | { type: "draw"; action: "laser"; x: number; y: number; color?: string; radius?: number }
  | { type: "draw"; action: "clear" };

export interface Question {
  id: string;
  text: string;
  votes: number;
  answered: boolean;
  createdAt: string;
  updatedAt: string;
  /** Only set for the requesting audience member. */
  voted?: boolean;
}

/** Messages sent by clients (displays, presenters, question listeners). */
export type ClientMessage =
  | { type: "register"; role: Role; sessionId?: string }
  | ({ type: "state"; sessionId?: string } & SlideState)
  | { type: "command"; action: NavAction }
  | { type: "command"; action: "goto"; hash: string }
  | DrawMessage
  | { type: "reload" };

/** Messages sent to clients. */
export type ServerMessage =
  | { type: "config"; config: PresenterConfig; session: SessionInfo }
  | ({ type: "state"; displays: number } & SlideState)
  | { type: "sync"; displays: number; presenters: number }
  | { type: "navigate"; action: NavAction }
  | { type: "goto"; hash: string }
  | DrawMessage
  | { type: "questions"; questions: Question[] }
  | { type: "notesChanged" }
  | { type: "reload"; preserveHash: boolean };

export const NAV_ACTIONS: readonly NavAction[] = ["next", "prev", "first", "last"];

export function isNavAction(value: unknown): value is NavAction {
  return typeof value === "string" && (NAV_ACTIONS as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const ROUTES = {
  ws: "/_/ws",
  presenter: "/_/presenter",
  questions: "/_/questions",
  questionsQr: "/_/questions/qr",
  client: "/_/client/",
  api: {
    config: "/_/api/config",
    session: "/_/api/session",
    notes: "/_/api/notes",
    export: "/_/api/export",
    recording: "/_/api/recording",
    recordingAudio: "/_/api/recording/audio",
    questions: "/_/api/questions",
    questionsVote: "/_/api/questions/vote",
    questionsDelete: "/_/api/questions/delete",
    questionsAnswer: "/_/api/questions/answer",
    questionsQr: "/_/api/questions/qr",
  },
} as const;

/** Query parameter that marks an iframe as a presenter preview. */
export const PREVIEW_PARAM = "_presenter_preview";

/** State a preview iframe reports to the presenter (works cross-origin). */
export interface PreviewState {
  /** Sequence number of the last `goto` request the preview handled. */
  seq: number;
  slideId: string;
  hash: string;
  title: string;
  notes?: string | null;
  slideOrder?: string[];
  /** Per-slide durations from `data-slide-time` attributes, in ms. */
  slideTimes?: Record<string, number>;
}

/** postMessage envelopes between presenter and preview iframes. */
export type PreviewMessage =
  | ({ type: "miniPresenterPreviewState" } & PreviewState)
  | { type: "miniPresenterPreview"; action: "goto"; hash: string; seq: number };
