// Presenter state and actions. Imperative controllers (timer, notes,
// recording) hold their own state; this module wires them to the transport and
// exposes signals for the UI.

import { createEffect, createMemo, createSignal } from "solid-js";
import { resolveConfig, sanitizeConfig, type PresenterConfig, type ResolvedConfig } from "../../shared/config.ts";
import { stripRelativeSuffix } from "../../shared/notes.ts";
import {
  ROUTES,
  type DrawMessage,
  type NavAction,
  type PreviewState,
  type Question,
  type ServerMessage,
  type SessionInfo,
  type SlideState,
} from "../../shared/protocol.ts";
import { findSlideIndex } from "../../shared/timer.ts";
import { cleanDeckUrl, type LocalContext } from "../lib/globals.ts";
import type { InkLayer } from "../lib/ink.ts";
import {
  createLocalPresenterTransport,
  createWebSocketTransport,
  webSocketUrl,
  type ConnectionStatus,
  type Transport,
} from "../lib/transport.ts";
import { NotesController } from "./notes.ts";
import { RecordingController, type RecordedEvent } from "./recording.ts";
import { TimerController } from "./timer.ts";

export type Tool = "none" | "draw" | "laser";

export type NextSlide =
  | { kind: "waiting" }
  | { kind: "unavailable" }
  | { kind: "end" }
  | { kind: "slide"; hash: string; relative: boolean };

/** The hash identifying a slide state; an empty hash defers to the deck's slide id. */
export function slideHash(state: Pick<SlideState, "hash" | "slideId">): string {
  return state.hash && state.hash !== "#" ? state.hash : state.slideId || "#";
}

const LOCAL_CAPABILITIES = { questions: false, export: false, recording: false, configSave: false, notesFiles: false };

/** Standalone mode context: from the popup shell or from query parameters. */
export function detectLocalContext(): LocalContext | null {
  const injected = window.__miniPresenterStandaloneContext;
  const params = new URLSearchParams(location.search);
  if (injected?.sessionId) {
    return {
      sessionId: injected.sessionId,
      deckUrl: injected.deckUrl ?? cleanDeckUrl(),
      assetBase: injected.assetBase ?? new URL("./", location.href).toString(),
    };
  }
  if (params.get("mp_mode") === "local" && params.get("mp_session")) {
    return {
      sessionId: params.get("mp_session")!,
      deckUrl: params.get("mp_deck") ?? `${location.origin}/`,
      assetBase: new URL("./", location.href).toString(),
    };
  }
  return null;
}

export function createPresenterModel() {
  const local = detectLocalContext();
  const deckUrl = local ? local.deckUrl : `${location.origin}/`;

  // --- raw state -------------------------------------------------------
  const [status, setStatus] = createSignal<ConnectionStatus>("connecting");
  const [displays, setDisplays] = createSignal(0);
  const [savedConfig, setSavedConfig] = createSignal<PresenterConfig>({});
  const [draftConfig, setDraftConfig] = createSignal<PresenterConfig | null>(null);
  const [session, setSession] = createSignal<SessionInfo | null>(
    local ? { sessionId: local.sessionId, mode: "local", capabilities: LOCAL_CAPABILITIES, externalUrl: null, lanUrl: null } : null,
  );
  const [slide, setSlide] = createSignal<SlideState | null>(null);
  const [preview, setPreview] = createSignal<PreviewState | null>(null);
  const [nextPreview, setNextPreview] = createSignal<PreviewState | null>(null);
  const [questions, setQuestions] = createSignal<Question[]>([]);
  const [tool, setTool] = createSignal<Tool>("none");
  const [drawStyle, setDrawStyle] = createSignal({ color: "#ff4d4d", size: 0.004 });
  const [laserStyle, setLaserStyle] = createSignal({ color: "#ffdd4d", size: 0.012 });

  const timer = new TimerController();
  const notes = new NotesController();
  let ink: InkLayer | null = null;
  let transport: Transport | null = null;
  let currentKey: { slideId: string; hash: string } | null = null;

  // --- derived ---------------------------------------------------------
  const config = createMemo<ResolvedConfig>(() => resolveConfig(draftConfig() ?? savedConfig()));
  const capabilities = createMemo(() => session()?.capabilities ?? LOCAL_CAPABILITIES);
  const order = createMemo<readonly string[] | null>(
    () => slide()?.slideOrder ?? preview()?.slideOrder ?? null,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  const currentHash = createMemo(() => {
    const state = slide();
    return state ? slideHash(state) : null;
  });
  const position = createMemo(() => {
    const state = slide();
    const list = order();
    let index = findSlideIndex(list, state?.slideId);
    if (index === -1) index = findSlideIndex(list, currentHash());
    return { index, total: list?.length ?? 0 };
  });
  const title = createMemo(() => config().title ?? slide()?.title ?? preview()?.title ?? null);

  const next = createMemo<NextSlide>(() => {
    const hash = currentHash();
    if (!hash || displays() === 0) return { kind: "waiting" };
    const base = stripRelativeSuffix(hash);
    const list = order();
    const index = findSlideIndex(list, base);
    if (list && index !== -1 && index >= list.length - 1) return { kind: "end" };
    if (config().relativeHash) return { kind: "slide", hash: `${base}~next`, relative: true };
    if (!list || index === -1) return { kind: "unavailable" };
    return { kind: "slide", hash: list[index + 1]!, relative: false };
  });

  /** The concrete hash shown in the next preview (relative hashes resolved). */
  const nextResolved = createMemo<string | null>(() => {
    const info = next();
    if (info.kind !== "slide") return null;
    if (!info.relative) return info.hash;
    const reported = nextPreview();
    return reported ? stripRelativeSuffix(reported.hash) : null;
  });

  /** A relative next preview that resolves to the current slide means: end of deck. */
  const nextIsEnd = createMemo(() => {
    const info = next();
    if (info.kind === "end") return true;
    const resolved = nextResolved();
    const hash = currentHash();
    return info.kind === "slide" && info.relative && resolved !== null && hash !== null && resolved === stripRelativeSuffix(hash);
  });

  const nextSpeakers = createMemo(() => {
    notes.version();
    notes.view();
    const hash = nextResolved();
    return hash && !nextIsEnd() ? notes.speakersFor(hash) : null;
  });

  const unansweredQuestions = createMemo(() => questions().filter((question) => !question.answered).length);

  // Push configuration into the controllers.
  createEffect(
    () => ({ config: config(), files: capabilities().notesFiles }),
    ({ config: resolved, files }) => {
      timer.configure(resolved.timer);
      notes.configure(resolved.notesSource, files);
    },
  );
  createEffect(
    () => ({ draw: config().draw, laser: config().laser }),
    ({ draw, laser }) => {
      setDrawStyle(draw);
      setLaserStyle(laser);
    },
  );
  createEffect(order, (list) => {
    timer.setOrder(list);
    notes.setOrder(list);
  });
  createEffect(
    () => title(),
    (value) => {
      document.title = value ? `${value} · Presenter` : "mini-presenter";
    },
  );

  // --- recording ---------------------------------------------------------
  const recording = new RecordingController({
    enabled: () => capabilities().recording,
    deviceId: () => config().recordingDeviceId,
    currentSlide: () => ({ slideId: currentKey?.slideId ?? null, hash: currentKey?.hash ?? null }),
    clearDrawings: () => clearDrawings(),
    replay: (event: RecordedEvent) => {
      if (event.type === "state") {
        const hash = event.hash || event.slideId;
        if (hash) send({ type: "command", action: "goto", hash });
      } else {
        const { time: _time, ...message } = event;
        ink?.apply(message);
        send(message);
      }
    },
  });

  // --- actions -----------------------------------------------------------
  function send(message: Parameters<Transport["send"]>[0]): void {
    transport?.send(message);
  }

  function navigate(action: NavAction): void {
    if (recording.playing) return;
    send({ type: "command", action });
  }

  function goto(hash: string): void {
    if (recording.playing) return;
    send({ type: "command", action: "goto", hash });
  }

  function draw(message: DrawMessage): void {
    ink?.apply(message);
    send(message);
    recording.record(message);
  }

  function clearDrawings(): void {
    draw({ type: "draw", action: "clear" });
  }

  function attachInk(layer: InkLayer | null): void {
    ink = layer;
  }

  function handleSlideState(state: SlideState & { displays: number }): void {
    const { displays: count, ...rest } = state;
    setDisplays(count);
    setSlide(rest);
    const hash = slideHash(rest);
    notes.show(hash, rest.notes);
    if (currentKey?.slideId !== rest.slideId || currentKey.hash !== hash) {
      const first = currentKey === null;
      currentKey = { slideId: rest.slideId, hash };
      timer.slideChanged(rest.slideId, hash);
      recording.record({ type: "state", slideId: rest.slideId, hash });
      if (!first) clearDrawings();
    }
  }

  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "config": {
        const previous = savedConfig();
        setSavedConfig(sanitizeConfig(message.config));
        setSession(message.session);
        // Keep an in-progress edit unless it matches what was just saved.
        const draft = draftConfig();
        if (draft && JSON.stringify(draft) === JSON.stringify(sanitizeConfig(message.config))) {
          setDraftConfig(null);
        }
        if (JSON.stringify(previous) !== JSON.stringify(message.config)) {
          void recording.refreshAvailability();
        }
        return;
      }
      case "state":
        handleSlideState(message);
        return;
      case "sync":
        setDisplays(message.displays);
        return;
      case "questions":
        setQuestions(message.questions);
        return;
      case "notesChanged":
        notes.invalidateFiles();
        return;
      case "reload":
        location.reload();
        return;
    }
  }

  function handlePreviewState(state: PreviewState): void {
    setPreview(state);
    timer.setDomTimes(state.slideTimes);
    notes.reportDeckNotes(state.hash, state.notes);
  }

  function handleNextPreviewState(state: PreviewState): void {
    setNextPreview(state);
    notes.reportDeckNotes(state.hash, state.notes);
  }

  function connect(): () => void {
    const handlers = { onMessage: handleMessage, onStatus: setStatus };
    transport = local
      ? createLocalPresenterTransport(local.sessionId, handlers)
      : createWebSocketTransport(webSocketUrl(ROUTES.ws), "presenter", handlers);
    transport.start();
    void recording.refreshAvailability();
    return () => {
      transport?.stop();
      timer.dispose();
    };
  }

  async function saveConfig(next: PresenterConfig): Promise<void> {
    const response = await fetch(ROUTES.api.config, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      throw new Error((await response.text()).trim() || `Saving failed (${response.status})`);
    }
    const data = (await response.json()) as { config?: PresenterConfig };
    setSavedConfig(sanitizeConfig(data.config ?? next));
    setDraftConfig(null);
  }

  async function questionAction(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error((await response.text()).trim() || `Request failed (${response.status})`);
    }
  }

  async function refreshQuestions(): Promise<void> {
    if (!capabilities().questions) return;
    const response = await fetch(ROUTES.api.questions, { cache: "no-store" });
    if (response.ok) {
      setQuestions(((await response.json()) as { questions: Question[] }).questions);
    }
  }

  return {
    local,
    deckUrl,
    status,
    displays,
    savedConfig,
    draftConfig,
    setDraftConfig,
    config,
    session,
    capabilities,
    slide,
    preview,
    order,
    position,
    currentHash,
    title,
    next,
    nextIsEnd,
    nextSpeakers,
    questions,
    unansweredQuestions,
    tool,
    setTool,
    drawStyle,
    setDrawStyle,
    laserStyle,
    setLaserStyle,
    timer,
    notes,
    recording,
    connect,
    navigate,
    goto,
    draw,
    clearDrawings,
    attachInk,
    handlePreviewState,
    handleNextPreviewState,
    saveConfig,
    refreshQuestions,
    answerQuestion: (id: string, answered: boolean) => questionAction(ROUTES.api.questionsAnswer, { id, answered }),
    deleteQuestion: (id: string) => questionAction(ROUTES.api.questionsDelete, { id }),
    reloadDisplays: () => send({ type: "reload" }),
  };
}

export type PresenterModel = ReturnType<typeof createPresenterModel>;
