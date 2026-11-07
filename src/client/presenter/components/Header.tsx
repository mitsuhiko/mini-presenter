import { createMemo, createSignal, onSettled, Show } from "solid-js";
import { formatShortcut } from "../../../shared/shortcuts.ts";
import { formatDuration } from "../../lib/format.ts";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel } from "../model.ts";
import { Popconfirm } from "./Popconfirm.tsx";

const isMac = /Mac|iPhone|iPad/u.test(navigator.platform);

export interface HeaderProps {
  model: PresenterModel;
  onQuestions: () => void;
  onSettings: () => void;
  recordControl?: (open: () => void) => void;
}

function useNow(intervalMs: number) {
  const [now, setNow] = createSignal(performance.now());
  onSettled(() => {
    const timer = setInterval(() => setNow(performance.now()), intervalMs);
    return () => clearInterval(timer);
  });
  return now;
}

export function Header(props: HeaderProps) {
  const model = () => props.model;
  const now = useNow(500);
  const [exporting, setExporting] = createSignal<"idle" | "busy" | "error">("idle");
  const recording = createMemo(() => model().recording.view());

  const connection = createMemo(() => {
    const status = model().status();
    const displays = model().displays();
    if (status === "unauthorized") return { state: "danger", text: "Signed out" };
    if (status !== "open") return { state: "warn", text: "Reconnecting…" };
    if (displays === 0) return { state: "warn", text: "No display" };
    return { state: "ok", text: displays === 1 ? "1 display" : `${displays} displays` };
  });

  const progress = createMemo(() => {
    const { index, total } = model().position();
    return total > 1 && index >= 0 ? index / (total - 1) : total === 1 ? 1 : 0;
  });

  const recordingLabel = createMemo(() => {
    const view = recording();
    if (view.phase === "recording" && view.startedAt !== null) return formatDuration(now() - view.startedAt);
    if (view.phase === "saving") return "Saving…";
    if (view.phase === "starting") return "Starting…";
    return "Record";
  });

  const exportPdf = async () => {
    if (exporting() === "busy") return;
    setExporting("busy");
    try {
      const response = await fetch("/_/api/export?format=pdf");
      if (!response.ok) throw new Error((await response.text()).trim());
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(model().title() ?? "presentation").replace(/[^\w.-]+/gu, "-")}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExporting("idle");
    } catch (error) {
      console.error("Export failed", error);
      setExporting("error");
      setTimeout(() => setExporting("idle"), 3000);
    }
  };

  return (
    <header class="topbar">
      <div class="topbar__brand">
        <Icon name="monitor" size={18} />
        <span class="topbar__title" title={model().title() ?? undefined}>
          {model().title() ?? "mini-presenter"}
        </span>
        <span class="status-pill" title={model().local ? "Standalone mode (no server)" : undefined}>
          <span class="dot" data-state={connection().state} />
          {connection().text}
          <Show when={model().local}>
            <span class="status-pill__mode">local</span>
          </Show>
        </span>
      </div>

      <div class="topbar__actions">
        <Show when={recording().message}>
          {(message) => (
            <span class="topbar__message" data-level={message().level} role="status">
              {message().text}
            </span>
          )}
        </Show>
        <Show when={model().capabilities().recording}>
          <Popconfirm
            title="Replace the existing recording?"
            confirmLabel="Record"
            danger
            when={() => recording().available && recording().phase === "idle"}
            onConfirm={() => void model().recording.toggleRecording()}
            control={props.recordControl}
            trigger={(open, expanded) => (
              <button
                class={["btn", "record-button", { "record-button--active": recording().phase === "recording" }]}
                type="button"
                title={`${recording().phase === "recording" ? "Stop recording" : "Record audio, slides and drawings"} (${formatShortcut(model().config().shortcuts.recording[0] ?? "", { mac: isMac })})`}
                aria-label={recording().phase === "recording" ? `Stop recording (${recordingLabel()})` : "Record"}
                aria-expanded={expanded() ? "true" : "false"}
                disabled={recording().phase === "saving" || recording().phase === "starting" || recording().phase === "playing"}
                onClick={() => (recording().phase === "recording" ? void model().recording.toggleRecording() : open())}
              >
                <Icon name={recording().phase === "recording" ? "stop" : "record"} />
                <span class="btn__label">{recordingLabel()}</span>
              </button>
            )}
          />
          <Show when={recording().available || recording().phase === "playing"}>
            <button
              class="btn"
              type="button"
              aria-pressed={recording().phase === "playing" ? "true" : "false"}
              title={recording().phase === "playing" ? "Stop playback" : "Play the recording"}
              disabled={recording().phase !== "idle" && recording().phase !== "playing"}
              onClick={() => void model().recording.togglePlayback()}
            >
              <Icon name={recording().phase === "playing" ? "stop" : "play"} />
              <span class="btn__label">{recording().phase === "playing" ? "Stop" : "Play"}</span>
            </button>
          </Show>
        </Show>
        <Show when={model().capabilities().questions}>
          <button class="btn" type="button" title="Audience questions (Q)" onClick={() => props.onQuestions()}>
            <Icon name="questions" />
            <span class="btn__label">Questions</span>
            <Show when={model().unansweredQuestions() > 0}>
              <span class="badge">{model().unansweredQuestions()}</span>
            </Show>
          </button>
        </Show>
        <Show when={model().capabilities().export}>
          <button
            class="btn"
            type="button"
            title="Export the deck as PDF"
            disabled={exporting() === "busy"}
            onClick={() => void exportPdf()}
          >
            <Icon name="download" />
            <span class="btn__label">
              {exporting() === "busy" ? "Exporting…" : exporting() === "error" ? "Export failed" : "PDF"}
            </span>
          </button>
        </Show>
        <button class="btn btn--icon" type="button" title="Settings" aria-label="Settings" onClick={() => props.onSettings()}>
          <Icon name="settings" />
        </button>
      </div>
      <div class="topbar__progress" aria-hidden="true">
        <div style={{ width: `${progress() * 100}%` }} />
      </div>
    </header>
  );
}
