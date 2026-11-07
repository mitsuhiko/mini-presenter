// Records slide changes, drawings and microphone audio; plays them back.

import { createSignal } from "solid-js";
import { isRecord, ROUTES, type DrawMessage } from "../../shared/protocol.ts";

export type RecordingPhase = "idle" | "starting" | "recording" | "saving" | "playing";

export type RecordableEvent = { type: "state"; slideId: string | null; hash: string | null } | DrawMessage;
export type RecordedEvent = RecordableEvent & { time: number };

interface StoredRecording {
  durationMs: number;
  events: RecordedEvent[];
  audioUrl: string | null;
}

export interface RecordingView {
  phase: RecordingPhase;
  available: boolean;
  /** Recording start (performance.now) while recording. */
  startedAt: number | null;
  message: { level: "info" | "error"; text: string } | null;
}

export interface RecordingHost {
  enabled(): boolean;
  deviceId(): string | null;
  currentSlide(): { slideId: string | null; hash: string | null };
  clearDrawings(): void;
  replay(event: RecordedEvent): void;
}

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

async function checkedFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")).trim() || `Request failed (${response.status})`);
  }
  return response;
}

export class RecordingController {
  private readonly host: RecordingHost;
  private readonly viewSignal = createSignal<RecordingView>({ phase: "idle", available: false, startedAt: null, message: null });
  private phase: RecordingPhase = "idle";
  private available = false;
  private startedAt: number | null = null;
  private events: RecordedEvent[] = [];
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private frame: number | null = null;
  private messageTimer: number | null = null;
  private message: RecordingView["message"] = null;

  constructor(host: RecordingHost) {
    this.host = host;
  }

  get view(): () => RecordingView {
    return this.viewSignal[0];
  }

  get playing(): boolean {
    return this.phase === "playing";
  }

  private publish(): void {
    this.viewSignal[1]({ phase: this.phase, available: this.available, startedAt: this.startedAt, message: this.message });
  }

  private setPhase(phase: RecordingPhase): void {
    this.phase = phase;
    this.publish();
  }

  notify(text: string, level: "info" | "error" = "info", timeoutMs = 3500): void {
    if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    this.message = { level, text };
    this.messageTimer = window.setTimeout(() => {
      this.message = null;
      this.messageTimer = null;
      this.publish();
    }, timeoutMs);
    this.publish();
  }

  /** Records an event while recording (ignored otherwise). */
  record(event: RecordableEvent): void {
    if (this.phase !== "recording" || this.startedAt === null) return;
    this.events.push({ ...event, time: Math.round(performance.now() - this.startedAt) });
  }

  async refreshAvailability(): Promise<void> {
    if (!this.host.enabled()) {
      this.available = false;
      this.publish();
      return;
    }
    try {
      const data = (await (await checkedFetch(ROUTES.api.recording)).json()) as { available?: boolean };
      this.available = data.available === true;
    } catch {
      this.available = false;
    }
    this.publish();
  }

  async toggleRecording(): Promise<void> {
    if (this.phase === "recording") {
      this.stopRecording();
    } else if (this.phase === "idle") {
      await this.startRecording();
    }
  }

  async startRecording(): Promise<void> {
    if (this.phase !== "idle") return;
    if (!this.host.enabled()) {
      this.notify("Recording needs a local deck served by mini-presenter.", "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      this.notify("Recording is not supported in this browser.", "error");
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      this.notify("No supported audio format.", "error");
      return;
    }
    this.setPhase("starting");
    const deviceId = this.host.deviceId();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
    } catch {
      this.setPhase("idle");
      this.notify("Microphone access was denied.", "error");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(this.stream, { mimeType });
    this.recorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const durationMs = this.startedAt === null ? 0 : performance.now() - this.startedAt;
      void this.save(new Blob(chunks, { type: recorder.mimeType || mimeType }), durationMs);
    });
    recorder.start(1000);
    this.events = [];
    this.startedAt = performance.now();
    this.setPhase("recording");
    const { slideId, hash } = this.host.currentSlide();
    this.record({ type: "state", slideId, hash });
    this.host.clearDrawings();
  }

  stopRecording(): void {
    if (this.phase !== "recording") return;
    this.setPhase("saving");
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else {
      this.releaseStream();
      this.setPhase("idle");
    }
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  private async save(audio: Blob, durationMs: number): Promise<void> {
    this.releaseStream();
    try {
      await checkedFetch(ROUTES.api.recordingAudio, {
        method: "PUT",
        headers: { "Content-Type": audio.type || "audio/webm" },
        body: audio,
      });
      await checkedFetch(ROUTES.api.recording, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMs: Math.round(durationMs), audioMimeType: audio.type, events: this.events }),
      });
      this.available = true;
      this.notify("Recording saved.");
    } catch (error) {
      this.notify(`Saving failed: ${(error as Error).message}`, "error", 6000);
    } finally {
      this.events = [];
      this.startedAt = null;
      this.setPhase("idle");
    }
  }

  async togglePlayback(): Promise<void> {
    if (this.phase === "playing") {
      this.stopPlayback();
    } else if (this.phase === "idle") {
      await this.play();
    }
  }

  async play(): Promise<void> {
    if (this.phase !== "idle") return;
    let recording: StoredRecording;
    try {
      const data: unknown = await (await checkedFetch(ROUTES.api.recording)).json();
      const stored = isRecord(data) && isRecord(data.recording) ? data.recording : null;
      if (!stored || !Array.isArray(stored.events)) {
        this.available = false;
        this.notify("No recording found.", "error");
        return;
      }
      recording = stored as unknown as StoredRecording;
    } catch (error) {
      this.notify(`Could not load recording: ${(error as Error).message}`, "error");
      return;
    }
    if (!recording.audioUrl) {
      this.notify("The recording has no audio.", "error");
      return;
    }

    const events = [...recording.events].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    let index = 0;
    const audio = new Audio(recording.audioUrl);
    this.audio = audio;
    this.host.clearDrawings();
    this.setPhase("playing");

    const tick = () => {
      if (this.audio !== audio) return;
      const now = audio.currentTime * 1000;
      while (index < events.length && (events[index]!.time ?? 0) <= now) {
        this.host.replay(events[index]!);
        index += 1;
      }
      this.frame = requestAnimationFrame(tick);
    };
    audio.addEventListener("ended", () => this.stopPlayback());
    try {
      await audio.play();
    } catch {
      this.stopPlayback();
      this.notify("Playback could not start.", "error");
      return;
    }
    this.frame = requestAnimationFrame(tick);
  }

  stopPlayback(): void {
    if (this.phase !== "playing") return;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.audio?.pause();
    this.audio = null;
    this.setPhase("idle");
  }
}
