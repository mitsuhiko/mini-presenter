import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  DEFAULT_KEYBOARD,
  DEFAULT_SHORTCUTS,
  parseConfig,
  type NotesSource,
  type PresenterConfig,
  type ShortcutAction,
  type TimerMode,
} from "../../../shared/config.ts";
import { isRecord, type NavAction } from "../../../shared/protocol.ts";
import { formatShortcutList, parseShortcutList, shortcutFromEvent } from "../../../shared/shortcuts.ts";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel } from "../model.ts";
import { Dialog } from "./Dialog.tsx";

/** JSON with sorted keys, for order-insensitive comparisons. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item,
  );
}

/** Drops empty strings, empty lists and empty objects. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? value : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, prune(item)] as const)
      .filter(([, item]) => item !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return value === "" || value === null ? undefined : value;
}

function section<K extends string>(config: PresenterConfig, key: K): Record<string, unknown> {
  const value = config[key];
  if (isRecord(value)) return value;
  const fresh: Record<string, unknown> = {};
  config[key] = fresh;
  return fresh;
}

function numberOrUndefined(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) && number >= 0 ? number : undefined;
}

function Field(props: { label: string; hint?: JSX.Element; for?: string; children: JSX.Element }) {
  return (
    <div class="field">
      <label class="field__label" for={props.for}>
        {props.label}
      </label>
      <div class="field__control">
        {props.children}
        <Show when={props.hint}>
          <div class="field__hint">{props.hint}</div>
        </Show>
      </div>
    </div>
  );
}

/** Comma separated shortcuts with a capture button. */
function ShortcutField(props: {
  id: string;
  label: string;
  value: string[] | undefined;
  defaults: string[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [draft, setDraft] = createSignal<string | null>(null);
  const [capturing, setCapturing] = createSignal(false);
  const text = createMemo(() => draft() ?? formatShortcutList(props.value));

  const commit = (value: string) => {
    setDraft(null);
    const list = parseShortcutList(value);
    props.onChange(list.length > 0 ? list : undefined);
  };

  const capture = () => {
    setCapturing(true);
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        stop();
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      const current = props.value ?? [];
      if (!current.includes(shortcut)) props.onChange([...current, shortcut]);
      stop();
    };
    const stop = () => {
      setCapturing(false);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    window.addEventListener("keydown", onKeyDown, true);
  };

  return (
    <label class="shortcut-field">
      <span class="shortcut-field__label">{props.label}</span>
      <span class="shortcut-field__row">
        <input
          class="input"
          id={props.id}
          value={text()}
          placeholder={formatShortcutList(props.defaults)}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onChange={(event) => commit(event.currentTarget.value)}
          spellcheck={false}
          autocomplete="off"
        />
        <button
          class="btn btn--icon"
          type="button"
          aria-pressed={capturing() ? "true" : "false"}
          title={capturing() ? "Press a key… (Esc to cancel)" : "Record a key"}
          onClick={capture}
        >
          <Icon name="keyboard" />
        </button>
      </span>
    </label>
  );
}

const NAV_LABELS: Array<[NavAction, string]> = [
  ["next", "Next"],
  ["prev", "Previous"],
  ["first", "First"],
  ["last", "Last"],
];

const SHORTCUT_LABELS: Array<[ShortcutAction, string]> = [
  ["fullscreen", "Fullscreen"],
  ["presenter", "Open presenter"],
  ["questions", "Questions QR"],
  ["recording", "Recording"],
];

export function SettingsDialog(props: { model: PresenterModel; onClose: () => void }) {
  const model = () => props.model;
  const [view, setView] = createSignal<"form" | "json">("form");
  const [jsonText, setJsonText] = createSignal("");
  const [jsonError, setJsonError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<{ level: "info" | "error"; text: string } | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);

  const current = createMemo(() => model().draftConfig() ?? model().savedConfig());
  const dirty = createMemo(() => model().draftConfig() !== null);
  const canSave = createMemo(() => model().capabilities().configSave);
  const raw = <K extends keyof PresenterConfig>(key: K) => current()[key];

  const edit = (mutate: (draft: PresenterConfig) => void) => {
    const draft = structuredClone(current());
    mutate(draft);
    const cleaned = parseConfig(prune(draft) ?? {});
    model().setDraftConfig(stableJson(cleaned) === stableJson(model().savedConfig()) ? null : cleaned);
    setStatus(null);
  };

  const showJson = () => {
    setJsonText(JSON.stringify(current(), null, 2));
    setJsonError(null);
    setView("json");
  };

  const onJsonInput = (text: string) => {
    setJsonText(text);
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) throw new Error("The configuration must be a JSON object.");
      setJsonError(null);
      const config = parseConfig(parsed);
      model().setDraftConfig(stableJson(config) === stableJson(model().savedConfig()) ? null : config);
    } catch (error) {
      setJsonError((error as Error).message);
    }
  };

  const save = async () => {
    const draft = model().draftConfig();
    if (!draft || !canSave()) return;
    setSaving(true);
    try {
      await model().saveConfig(draft);
      setStatus({ level: "info", text: "Saved to presenter.json" });
    } catch (error) {
      setStatus({ level: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(`${JSON.stringify(current(), null, 2)}\n`);
    setStatus({ level: "info", text: "Copied. Paste it into presenter.json next to your deck." });
  };

  const loadDevices = async (requestPermission: boolean) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    if (requestPermission) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setStatus({ level: "error", text: "Microphone access was denied." });
      }
    }
    setDevices((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput"));
  };

  onSettled(() => {
    if (model().capabilities().recording) void loadDevices(false);
  });

  const timer = createMemo(() => (isRecord(raw("timer")) ? (raw("timer") as Record<string, unknown>) : {}));
  const keyboard = createMemo(() => (isRecord(raw("keyboard")) ? (raw("keyboard") as Record<string, string[]>) : {}));
  const shortcuts = createMemo(() => (isRecord(raw("shortcuts")) ? (raw("shortcuts") as Record<string, string[]>) : {}));

  return (
    <Dialog
      title="Settings"
      class="dialog--settings"
      onClose={props.onClose}
      subtitle={
        <>
          <code>presenter.json</code>
          <Show when={dirty()}>
            <span class="settings__dirty"> · unsaved changes</span>
          </Show>
          <Show when={status()}>
            {(value) => (
              <span class="settings__status" data-level={value().level}>
                {" "}
                · {value().text}
              </span>
            )}
          </Show>
        </>
      }
      actions={
        <>
          <div class="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={view() === "form" ? "true" : "false"} onClick={() => setView("form")}>
              Form
            </button>
            <button type="button" role="tab" aria-selected={view() === "json" ? "true" : "false"} onClick={showJson}>
              <Icon name="code" /> JSON
            </button>
          </div>
          <Show when={dirty()}>
            <button class="btn btn--sm btn--ghost" type="button" onClick={() => model().setDraftConfig(null)}>
              Revert
            </button>
          </Show>
          <Show
            when={canSave()}
            fallback={
              <button class="btn btn--sm" type="button" onClick={() => void copyJson()}>
                Copy JSON
              </button>
            }
          >
            <button class="btn btn--sm btn--primary" type="button" disabled={!dirty() || saving()} onClick={() => void save()}>
              {saving() ? "Saving…" : "Save"}
            </button>
          </Show>
        </>
      }
    >
      <Show when={!canSave()}>
        <div class="message settings__banner">
          {model().local
            ? "Standalone mode: changes apply to this window only. Copy the JSON into presenter.json to keep them."
            : "This deck is read-only: changes apply to this window only."}
        </div>
      </Show>

      <Show
        when={view() === "form"}
        fallback={
          <div class="settings__json">
            <textarea
              class="textarea"
              spellcheck={false}
              value={jsonText()}
              aria-invalid={jsonError() ? "true" : "false"}
              onInput={(event) => onJsonInput(event.currentTarget.value)}
            />
            <div class="field__hint" data-level={jsonError() ? "error" : "info"}>
              {jsonError() ?? "Valid JSON. Changes apply immediately."}
            </div>
          </div>
        }
      >
        <div class="settings">
          <h3 class="settings__section">General</h3>
          <Field label="Title" for="settings-title" hint="Shown in the header and the window title.">
            <input
              class="input"
              id="settings-title"
              value={typeof raw("title") === "string" ? (raw("title") as string) : ""}
              placeholder={model().slide()?.title ?? "Presentation title"}
              onChange={(event) =>
                edit((draft) => {
                  draft.title = event.currentTarget.value.trim() || undefined;
                })
              }
            />
          </Field>
          <Field label="Speaker notes" for="settings-notes">
            <select
              class="select"
              id="settings-notes"
              value={(raw("notes") as { source?: string } | undefined)?.source ?? "auto"}
              onChange={(event) =>
                edit((draft) => {
                  const value = event.currentTarget.value as NotesSource;
                  section(draft, "notes").source = value === "auto" ? undefined : value;
                })
              }
            >
              <option value="auto">Deck API, then notes/ files</option>
              <option value="api">Deck API only</option>
              <option value="files">notes/ files only</option>
              <option value="none">Off</option>
            </select>
          </Field>
          <Field
            label="Next preview"
            hint={
              <>
                For decks that resolve <code>#slide~next</code> themselves, including build steps.
              </>
            }
          >
            <label class="checkbox">
              <input
                type="checkbox"
                checked={(raw("preview") as { relativeHash?: boolean } | undefined)?.relativeHash === true}
                onChange={(event) =>
                  edit((draft) => {
                    section(draft, "preview").relativeHash = event.currentTarget.checked || undefined;
                  })
                }
              />
              Resolve relative hashes
            </label>
          </Field>

          <h3 class="settings__section">Timer</h3>
          <Field label="Mode" for="settings-timer-mode">
            <select
              class="select"
              id="settings-timer-mode"
              value={(timer().mode === "countdown" ? "countdown-total" : (timer().mode as string)) ?? "countup"}
              onChange={(event) =>
                edit((draft) => {
                  const value = event.currentTarget.value as TimerMode;
                  section(draft, "timer").mode = value === "countup" ? undefined : value;
                })
              }
            >
              <option value="countup">Count up</option>
              <option value="countdown-total">Count down the talk</option>
              <option value="countdown-slide">Count down each slide</option>
            </select>
          </Field>
          <Field
            label="Talk length"
            for="settings-timer-minutes"
            hint="Minutes. Leave empty to add up the per-slide times from presenter.json or data-slide-time."
          >
            <input
              class="input input--narrow"
              id="settings-timer-minutes"
              type="number"
              min="0"
              step="1"
              placeholder="auto"
              value={timer().durationMinutes === undefined ? "" : String(timer().durationMinutes)}
              onChange={(event) =>
                edit((draft) => {
                  const timerDraft = section(draft, "timer");
                  timerDraft.durationMinutes = numberOrUndefined(event.currentTarget.value);
                  delete timerDraft.durationSeconds;
                })
              }
            />
          </Field>
          <Field label="Per slide" hint="Default seconds for slides without their own time, and transition time between slides.">
            <div class="field__inline">
              <label class="inline-input">
                <input
                  class="input input--narrow"
                  type="number"
                  min="0"
                  step="5"
                  placeholder="—"
                  value={timer().defaultSlideSeconds === undefined ? "" : String(timer().defaultSlideSeconds)}
                  onChange={(event) =>
                    edit((draft) => {
                      section(draft, "timer").defaultSlideSeconds = numberOrUndefined(event.currentTarget.value);
                    })
                  }
                />
                <span>s default</span>
              </label>
              <label class="inline-input">
                <input
                  class="input input--narrow"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="2"
                  value={timer().transitionSeconds === undefined ? "" : String(timer().transitionSeconds)}
                  onChange={(event) =>
                    edit((draft) => {
                      section(draft, "timer").transitionSeconds = numberOrUndefined(event.currentTarget.value);
                    })
                  }
                />
                <span>s transition</span>
              </label>
            </div>
          </Field>

          <h3 class="settings__section">Drawing</h3>
          <Field label="Defaults" hint="Use the current pen and laser color and size as defaults.">
            <button
              class="btn"
              type="button"
              onClick={() =>
                edit((draft) => {
                  draft.draw = { ...model().drawStyle() };
                  draft.laser = { ...model().laserStyle() };
                })
              }
            >
              <span class="swatch swatch--static" style={{ "--swatch": model().drawStyle().color }} />
              <span class="swatch swatch--static" style={{ "--swatch": model().laserStyle().color }} />
              Save current tools
            </button>
          </Field>

          <Show when={model().capabilities().recording}>
            <h3 class="settings__section">Recording</h3>
            <Field label="Microphone" for="settings-mic">
              <div class="field__inline">
                <select
                  class="select"
                  id="settings-mic"
                  value={(raw("recording") as { deviceId?: string } | undefined)?.deviceId ?? ""}
                  onChange={(event) =>
                    edit((draft) => {
                      section(draft, "recording").deviceId = event.currentTarget.value || undefined;
                    })
                  }
                >
                  <option value="">System default</option>
                  <For each={devices().filter((device) => device.deviceId && device.deviceId !== "default")}>
                    {(device) => <option value={device.deviceId}>{device.label || "Microphone"}</option>}
                  </For>
                </select>
                <button class="btn" type="button" onClick={() => void loadDevices(true)}>
                  Detect
                </button>
              </div>
            </Field>
          </Show>

          <h3 class="settings__section">Keyboard</h3>
          <div class="field">
            <div class="field__label">Navigation</div>
            <div class="field__control shortcut-grid">
              <For each={NAV_LABELS}>
                {([action, label]) => (
                  <ShortcutField
                    id={`settings-key-${action}`}
                    label={label}
                    value={keyboard()[action]}
                    defaults={DEFAULT_KEYBOARD[action]}
                    onChange={(value) =>
                      edit((draft) => {
                        section(draft, "keyboard")[action] = value;
                      })
                    }
                  />
                )}
              </For>
            </div>
          </div>
          <div class="field">
            <div class="field__label">Shortcuts</div>
            <div class="field__control shortcut-grid">
              <For each={SHORTCUT_LABELS}>
                {([action, label]) => (
                  <ShortcutField
                    id={`settings-shortcut-${action}`}
                    label={label}
                    value={shortcuts()[action]}
                    defaults={DEFAULT_SHORTCUTS[action]}
                    onChange={(value) =>
                      edit((draft) => {
                        section(draft, "shortcuts")[action] = value;
                      })
                    }
                  />
                )}
              </For>
              <div class="field__hint">
                Comma separated, e.g. <code>ArrowRight, Space, l</code> or <code>Shift+R</code>. In the presenter,{" "}
                <span class="kbd">T</span> toggles and <span class="kbd">R</span> resets the timer.
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Dialog>
  );
}
