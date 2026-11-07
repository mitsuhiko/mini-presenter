import { onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Icon } from "../../ui/icons.tsx";

export interface DialogProps {
  title: string;
  subtitle?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
  onClose: () => void;
  children: JSX.Element;
}

/** Modal dialog with backdrop; closes on Escape and backdrop click. */
export function Dialog(props: DialogProps) {
  let panel: HTMLDivElement | undefined;

  onSettled(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  });

  return (
    <div
      class="dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        class={["dialog", props.class]}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex="-1"
        ref={(element) => (panel = element)}
      >
        <header class="dialog__header">
          <div>
            <h2 class="dialog__title">{props.title}</h2>
            {props.subtitle ? <div class="dialog__subtitle">{props.subtitle}</div> : null}
          </div>
          <div class="dialog__actions">
            {props.actions}
            <button class="btn btn--ghost btn--icon" type="button" aria-label="Close" title="Close (Esc)" onClick={() => props.onClose()}>
              <Icon name="close" />
            </button>
          </div>
        </header>
        <div class="dialog__body">{props.children}</div>
      </div>
    </div>
  );
}
