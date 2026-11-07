import { createMemo, Show } from "solid-js";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel } from "../model.ts";
import { Popconfirm } from "./Popconfirm.tsx";

export function TimerCard(props: { model: PresenterModel; resetRequest?: (open: () => void) => void }) {
  const view = createMemo(() => props.model.timer.view());
  const toggleLabel = createMemo(() => {
    const state = view().state;
    return state === "running" ? "Pause" : state === "paused" ? "Resume" : state === "finished" ? "Restart" : "Start";
  });
  const stateLabel = createMemo(() => {
    switch (view().state) {
      case "armed":
        return "Starts when you leave this slide";
      case "idle":
        return "Not started";
      case "paused":
        return "Paused";
      case "finished":
        return "Time is up";
      default:
        return null;
    }
  });

  return (
    <section class="panel timer" aria-label="Timer" data-state={view().state}>
      <div class="timer__main">
        <div class="timer__label">
          {view().label}
          <Show when={stateLabel()}>{(text) => <span class="timer__state"> · {text()}</span>}</Show>
        </div>
        <div class="timer__value" data-level={view().primaryLevel} role="timer" aria-live="off">
          {view().primary}
        </div>
        <Show when={view().secondary}>
          {(text) => (
            <div class="timer__secondary" data-level={view().secondaryLevel}>
              {text()}
            </div>
          )}
        </Show>
        <Show when={view().pace}>
          {(text) => (
            <div class="timer__pace" data-level={view().paceLevel}>
              {text()}
            </div>
          )}
        </Show>
      </div>
      <div class="timer__actions">
        <button
          class={["btn", "btn--icon", { "btn--primary": view().state !== "running" }]}
          type="button"
          title={`${toggleLabel()} timer (T)`}
          aria-label={`${toggleLabel()} timer`}
          onClick={() => props.model.timer.toggle()}
        >
          <Icon name={view().state === "running" ? "pause" : "play"} />
        </button>
        <Popconfirm
          title="Reset the timer?"
          confirmLabel="Reset"
          danger
          align="end"
          onConfirm={() => props.model.timer.reset()}
          control={props.resetRequest}
          trigger={(open, expanded) => (
            <button
              class="btn btn--icon"
              type="button"
              title="Reset timer (R)"
              aria-label="Reset timer"
              aria-expanded={expanded() ? "true" : "false"}
              onClick={open}
            >
              <Icon name="reset" />
            </button>
          )}
        />
      </div>
      <Show when={view().progress !== null}>
        <div class="timer__progress" aria-hidden="true">
          <div style={{ width: `${(view().progress ?? 0) * 100}%` }} data-level={view().primaryLevel} />
        </div>
      </Show>
    </section>
  );
}
