import { createSignal, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export interface PopconfirmProps {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  align?: "start" | "end";
  placement?: "top" | "bottom";
  onConfirm: () => void;
  /** Renders the trigger; call `open` to show the confirmation. */
  trigger: (open: () => void, expanded: () => boolean) => JSX.Element;
  /** Receives a function that opens the confirmation (e.g. for shortcuts). */
  control?: (open: () => void) => void;
  /** Skip confirmation when this returns false. */
  when?: () => boolean;
}

/** A small anchored confirmation popover. */
export function Popconfirm(props: PopconfirmProps) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const request = () => {
    if (props.when && !props.when()) {
      props.onConfirm();
      return;
    }
    setOpen((value) => !value);
  };

  onSettled(() => {
    props.control?.(request);
    const onPointerDown = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    // Capture phase, so an open popover swallows Escape before dialogs see it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open()) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  });

  return (
    <div class="popconfirm" ref={(element) => (root = element)}>
      {props.trigger(request, open)}
      <Show when={open()}>
        <div
          class={["popover", `popover--${props.placement ?? "bottom"}`, `popover--${props.align ?? "end"}`]}
          role="dialog"
          aria-label={props.title}
        >
          <div class="popover__title">{props.title}</div>
          <div class="popover__actions">
            <button class="btn btn--sm btn--ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              class={["btn", "btn--sm", "btn--primary", { "btn--danger": props.danger }]}
              type="button"
              ref={(element) => queueMicrotask(() => element.focus())}
              onClick={() => {
                setOpen(false);
                props.onConfirm();
              }}
            >
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
