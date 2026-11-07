import { createMemo, For, Show } from "solid-js";
import { formatShortcut } from "../../../shared/shortcuts.ts";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel, Tool } from "../model.ts";
import { Popconfirm } from "./Popconfirm.tsx";

const COLORS = [
  { value: "#ff4d4d", name: "Red" },
  { value: "#ff8a00", name: "Orange" },
  { value: "#ffdd4d", name: "Yellow" },
  { value: "#35c276", name: "Green" },
  { value: "#4d7cff", name: "Blue" },
  { value: "#ffffff", name: "White" },
];

const isMac = /Mac|iPhone|iPad/u.test(navigator.platform);

function hint(shortcuts: readonly string[] | undefined): string {
  const first = shortcuts?.[0];
  return first ? ` (${formatShortcut(first, { mac: isMac })})` : "";
}

export function Navigation(props: { model: PresenterModel }) {
  const model = () => props.model;
  const disabled = createMemo(() => model().displays() === 0 || model().recording.view().phase === "playing");
  const counter = createMemo(() => {
    const { index, total } = model().position();
    const hash = model().currentHash();
    if (total > 0 && index >= 0) return { current: String(index + 1), total: String(total) };
    return { current: hash ? hash.replace(/^#/u, "") || "—" : "—", total: null };
  });

  return (
    <div class="nav" role="group" aria-label="Slide navigation">
      <button
        class="btn btn--lg btn--icon nav__edge"
        type="button"
        title="First slide"
        disabled={disabled()}
        onClick={() => model().navigate("first")}
      >
        <Icon name="first" />
      </button>
      <button
        class="btn btn--lg nav__step"
        type="button"
        title={`Previous${hint(model().config().keyboard.prev)}`}
        disabled={disabled()}
        onClick={() => model().navigate("prev")}
      >
        <Icon name="prev" size={18} />
        <span class="nav__label">Prev</span>
      </button>
      <div class="nav__counter" aria-live="polite">
        <span class="nav__current">{counter().current}</span>
        <Show when={counter().total}>{(total) => <span class="nav__total">/ {total()}</span>}</Show>
      </div>
      <button
        class="btn btn--lg btn--primary nav__step"
        type="button"
        title={`Next${hint(model().config().keyboard.next)}`}
        disabled={disabled()}
        onClick={() => model().navigate("next")}
      >
        <span class="nav__label">Next</span>
        <Icon name="next" size={18} />
      </button>
      <button
        class="btn btn--lg btn--icon nav__edge"
        type="button"
        title="Last slide"
        disabled={disabled()}
        onClick={() => model().navigate("last")}
      >
        <Icon name="last" />
      </button>
    </div>
  );
}

export function Tools(props: { model: PresenterModel }) {
  const model = () => props.model;
  const styleTool = createMemo<Exclude<Tool, "none">>(() => (model().tool() === "laser" ? "laser" : "draw"));
  const style = createMemo(() => (styleTool() === "laser" ? model().laserStyle() : model().drawStyle()));
  const disabled = createMemo(() => model().displays() === 0 || model().recording.view().phase === "playing");

  const setStyle = (patch: Partial<{ color: string; size: number }>) => {
    const tool = styleTool();
    if (tool === "laser") {
      model().setLaserStyle((value) => ({ ...value, ...patch }));
    } else {
      model().setDrawStyle((value) => ({ ...value, ...patch }));
    }
    if (model().tool() === "none") model().setTool("draw");
  };

  const toggle = (tool: Exclude<Tool, "none">) => model().setTool((current) => (current === tool ? "none" : tool));

  // The size slider uses a shared 0..1 scale mapped to each tool's useful range.
  const ranges = { draw: [0.001, 0.02], laser: [0.004, 0.03] } as const;
  const sliderValue = createMemo(() => {
    const [min, max] = ranges[styleTool()];
    return String(Math.round(((style().size - min) / (max - min)) * 100));
  });

  return (
    <div class="tools" role="toolbar" aria-label="Drawing tools">
      <div class="tools__group">
        <button
          class="btn btn--icon"
          type="button"
          aria-pressed={model().tool() === "draw" ? "true" : "false"}
          title="Draw on the slide"
          disabled={disabled()}
          onClick={() => toggle("draw")}
        >
          <Icon name="pen" />
        </button>
        <button
          class="btn btn--icon"
          type="button"
          aria-pressed={model().tool() === "laser" ? "true" : "false"}
          title="Laser pointer"
          disabled={disabled()}
          onClick={() => toggle("laser")}
        >
          <Icon name="laser" />
        </button>
      </div>
      <div class="tools__colors" role="radiogroup" aria-label="Color">
        <For each={COLORS}>
          {(color) => (
            <button
              class="swatch"
              type="button"
              role="radio"
              aria-checked={style().color.toLowerCase() === color.value ? "true" : "false"}
              aria-label={color.name}
              title={color.name}
              style={{ "--swatch": color.value }}
              onClick={() => setStyle({ color: color.value })}
            />
          )}
        </For>
        <label class="swatch swatch--custom" title="Custom color">
          <input
            type="color"
            value={style().color}
            aria-label="Custom color"
            onInput={(event) => setStyle({ color: event.currentTarget.value })}
          />
        </label>
      </div>
      <input
        class="tools__size"
        type="range"
        min="0"
        max="100"
        value={sliderValue()}
        aria-label={styleTool() === "laser" ? "Laser size" : "Pen size"}
        title="Size"
        style={{ "--fill": `${sliderValue()}%` }}
        onInput={(event) => {
          const [min, max] = ranges[styleTool()];
          setStyle({ size: min + (Number(event.currentTarget.value) / 100) * (max - min) });
        }}
      />
      <Popconfirm
        title="Clear all drawings?"
        confirmLabel="Clear"
        danger
        placement="top"
        onConfirm={() => model().clearDrawings()}
        trigger={(open, expanded) => (
          <button
            class="btn btn--icon"
            type="button"
            title="Clear drawings"
            aria-expanded={expanded() ? "true" : "false"}
            disabled={disabled()}
            onClick={open}
          >
            <Icon name="eraser" />
          </button>
        )}
      />
    </div>
  );
}
