// Draggable, keyboard accessible split handle. The value is the size of the
// panel *after* the handle (right or bottom) as a fraction of the container.

export interface SplitterProps {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  onReset: () => void;
}

const STEP = 0.02;

export function Splitter(props: SplitterProps) {
  const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    const container = handle.parentElement;
    if (!container) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.dataset.resizing = props.orientation;
    const move = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const value =
        props.orientation === "vertical"
          ? (rect.right - moveEvent.clientX) / rect.width
          : (rect.bottom - moveEvent.clientY) / rect.height;
      props.onChange(clamp(value));
    };
    const up = () => {
      delete document.body.dataset.resizing;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const grow = props.orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const shrink = props.orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (event.key === grow || event.key === shrink) {
      event.preventDefault();
      event.stopPropagation();
      props.onChange(clamp(props.value + (event.key === grow ? STEP : -STEP)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      props.onChange(event.key === "Home" ? props.min : props.max);
    }
  };

  return (
    <div
      class={["splitter", `splitter--${props.orientation}`]}
      role="separator"
      tabindex="0"
      aria-label={props.label}
      aria-orientation={props.orientation}
      aria-valuemin={Math.round(props.min * 100)}
      aria-valuemax={Math.round(props.max * 100)}
      aria-valuenow={Math.round(props.value * 100)}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onDblClick={() => props.onReset()}
      onKeyDown={onKeyDown}
    />
  );
}
