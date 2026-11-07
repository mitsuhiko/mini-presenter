import "./presenter.css";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import { render } from "@solidjs/web";
import { matchesAny, isEditableTarget, resolveAction } from "../../shared/shortcuts.ts";
import { Navigation, Tools } from "./components/Controls.tsx";
import { Header } from "./components/Header.tsx";
import { NotesPanel } from "./components/NotesPanel.tsx";
import { CurrentPreview, NextPreview } from "./components/Previews.tsx";
import { QuestionsDialog } from "./components/QuestionsDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { Splitter } from "./components/Splitter.tsx";
import { TimerCard } from "./components/TimerCard.tsx";
import { createPresenterModel } from "./model.ts";

function stored(key: string, fallback: number, min: number, max: number) {
  const read = () => {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= min && value <= max && localStorage.getItem(key) !== null ? value : fallback;
  };
  const [value, setValue] = createSignal(read());
  return [
    value,
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      setValue(clamped);
      localStorage.setItem(key, String(clamped));
    },
  ] as const;
}

function faviconFor(progress: number, dark: boolean): string {
  const fg = dark ? "#e1f1f7" : "#20404c";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="12" fill="none" stroke="${fg}" stroke-opacity=".25" stroke-width="6"/>` +
    `<circle cx="16" cy="16" r="12" fill="none" stroke="#c08a57" stroke-width="6" pathLength="100" ` +
    `stroke-dasharray="${(progress * 100).toFixed(2)} 100" transform="rotate(-90 16 16)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DEFAULT_SIDE = 0.32;
const DEFAULT_NOTES = 0.28;

function App() {
  const model = createPresenterModel();
  const [dialog, setDialog] = createSignal<"settings" | "questions" | null>(null);
  const [side, setSide] = stored("miniPresenter.layout.side", DEFAULT_SIDE, 0.2, 0.55);
  const [notesSize, setNotesSize] = stored("miniPresenter.layout.notes", DEFAULT_NOTES, 0.1, 0.65);
  const [fontSize, setFontSize] = stored("miniPresenter.notes.fontSize", 18, 12, 40);
  const [dark, setDark] = createSignal(matchMedia("(prefers-color-scheme: dark)").matches);
  let openReset: (() => void) | null = null;
  let openRecord: (() => void) | null = null;

  const progress = createMemo(() => {
    const { index, total } = model.position();
    return total > 1 && index >= 0 ? index / (total - 1) : 0;
  });

  createEffect(
    () => faviconFor(progress(), dark()),
    (href) => {
      let link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.append(link);
      }
      link.href = href;
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isEditableTarget(event.target) || dialog() !== null) return;
    if ((event.target as Element | null)?.closest?.("[role=separator]")) return;
    const config = model.config();
    if (matchesAny(event, config.shortcuts.recording) && model.capabilities().recording) {
      event.preventDefault();
      if (model.recording.view().phase === "recording") {
        void model.recording.toggleRecording();
      } else {
        openRecord?.();
      }
      return;
    }
    if (matchesAny(event, config.shortcuts.questions) && model.capabilities().questions) {
      event.preventDefault();
      setDialog("questions");
      return;
    }
    const action = resolveAction(event, config.keyboard);
    if (action) {
      event.preventDefault();
      model.navigate(action);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case "t":
      case "T":
        event.preventDefault();
        model.timer.toggle();
        return;
      case "r":
        event.preventDefault();
        openReset?.();
        return;
      case "Escape":
        model.setTool("none");
        return;
    }
  };

  onSettled(() => {
    const disconnect = model.connect();
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setDark(scheme.matches);
    scheme.addEventListener("change", onScheme);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      disconnect();
      scheme.removeEventListener("change", onScheme);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <div
      class="app"
      data-playing={model.recording.view().phase === "playing" ? "true" : "false"}
      style={{ "--side": `${side() * 100}%`, "--notes": `${notesSize() * 100}%` }}
    >
      <Header
        model={model}
        onQuestions={() => setDialog("questions")}
        onSettings={() => setDialog("settings")}
        recordControl={(open) => (openRecord = open)}
      />
      <main class="workspace">
        <div class="stage-row">
          <CurrentPreview model={model} />
          <Splitter
            orientation="vertical"
            label="Resize sidebar"
            value={side()}
            min={0.2}
            max={0.55}
            onChange={setSide}
            onReset={() => setSide(DEFAULT_SIDE)}
          />
          <aside class="sidebar">
            <NextPreview model={model} />
            <Navigation model={model} />
            <TimerCard model={model} resetRequest={(open) => (openReset = open)} />
            <section class="panel tools-panel" aria-label="Drawing">
              <Tools model={model} />
            </section>
          </aside>
        </div>
        <Splitter
          orientation="horizontal"
          label="Resize notes"
          value={notesSize()}
          min={0.1}
          max={0.65}
          onChange={setNotesSize}
          onReset={() => setNotesSize(DEFAULT_NOTES)}
        />
        <NotesPanel model={model} fontSize={fontSize()} onFontSize={setFontSize} />
      </main>
      <Show when={model.recording.view().phase === "playing"}>
        <div class="playback-banner" role="status">
          Playing back the recording. Navigation is paused.
          <button class="btn btn--sm" type="button" onClick={() => model.recording.stopPlayback()}>
            Stop
          </button>
        </div>
      </Show>
      <Show when={dialog() === "settings"}>
        <SettingsDialog model={model} onClose={() => setDialog(null)} />
      </Show>
      <Show when={dialog() === "questions"}>
        <QuestionsDialog model={model} onClose={() => setDialog(null)} />
      </Show>
    </div>
  );
}

render(() => <App />, document.getElementById("app")!);
