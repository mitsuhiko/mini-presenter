import { createMemo, For, onSettled, Show } from "solid-js";
import { speakerHue } from "../../../shared/notes.ts";
import { createInkLayer } from "../../lib/ink.ts";
import type { PresenterModel } from "../model.ts";
import { PreviewFrame } from "./PreviewFrame.tsx";

const DRAW_THROTTLE_MS = 16;
const LASER_THROTTLE_MS = 25;

export function SpeakerChip(props: { name: string; carried?: boolean }) {
  return (
    <span
      class="chip"
      style={{ "--hue": String(speakerHue(props.name)) }}
      data-carried={props.carried ? "true" : "false"}
      title={props.carried ? "Carried over from an earlier slide" : undefined}
    >
      @{props.name}
    </span>
  );
}

/** Canvases over the current slide: shows ink and captures pointer input. */
function InkSurface(props: { model: PresenterModel }) {
  let drawCanvas: HTMLCanvasElement | undefined;
  let laserCanvas: HTMLCanvasElement | undefined;
  let drawing = false;
  let lastSent = 0;

  const point = (event: PointerEvent) => {
    const rect = laserCanvas!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    const model = props.model;
    if (model.tool() !== "draw" || event.button !== 0 || model.recording.playing) return;
    drawing = true;
    laserCanvas!.setPointerCapture(event.pointerId);
    const { color, size } = model.drawStyle();
    model.draw({ type: "draw", action: "start", ...point(event), color, size });
  };

  const onPointerMove = (event: PointerEvent) => {
    const model = props.model;
    if (model.recording.playing) return;
    const now = performance.now();
    if (model.tool() === "draw" && drawing) {
      if (now - lastSent < DRAW_THROTTLE_MS) return;
      lastSent = now;
      model.draw({ type: "draw", action: "move", ...point(event) });
    } else if (model.tool() === "laser") {
      if (now - lastSent < LASER_THROTTLE_MS) return;
      lastSent = now;
      const { color, size } = model.laserStyle();
      model.draw({ type: "draw", action: "laser", ...point(event), color, radius: size });
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    laserCanvas!.releasePointerCapture(event.pointerId);
    props.model.draw({ type: "draw", action: "end", ...point(event) });
  };

  onSettled(() => {
    const layer = createInkLayer(drawCanvas!, laserCanvas!);
    props.model.attachInk(layer);
    return () => {
      props.model.attachInk(null);
      layer.destroy();
    };
  });

  return (
    <>
      <canvas class="ink" ref={(element) => (drawCanvas = element)} aria-hidden="true" />
      <canvas
        class={["ink", "ink--input", { "ink--active": props.model.tool() !== "none" }]}
        data-tool={props.model.tool()}
        ref={(element) => (laserCanvas = element)}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </>
  );
}

export function CurrentPreview(props: { model: PresenterModel }) {
  const placeholder = createMemo(() => {
    const model = props.model;
    if (model.status() === "unauthorized") return "Not authorized. Reload to sign in again.";
    if (model.status() !== "open") return "Connecting…";
    if (model.displays() === 0 || !model.currentHash()) return "Waiting for the slides to connect…";
    return null;
  });

  return (
    <section class="panel current" aria-label="Current slide">
      <PreviewFrame
        deckUrl={props.model.deckUrl}
        hash={props.model.currentHash()}
        viewport={props.model.slide()?.viewport ?? null}
        label="Current slide"
        placeholder={placeholder()}
        onState={props.model.handlePreviewState}
      >
        <InkSurface model={props.model} />
      </PreviewFrame>
    </section>
  );
}

export function NextPreview(props: { model: PresenterModel }) {
  const model = () => props.model;
  const info = createMemo(() => model().next());
  const placeholder = createMemo(() => {
    const next = info();
    if (next.kind === "waiting") return "Waiting for the slides…";
    if (next.kind === "unavailable") return "No preview: the deck does not expose its slide order.";
    if (model().nextIsEnd()) return "End of deck";
    return null;
  });
  const hash = createMemo(() => {
    const next = info();
    return next.kind === "slide" ? next.hash : null;
  });

  return (
    <section class="panel next" aria-label="Next slide">
      <header class="panel__header">
        <span class="panel__title">Next</span>
        <Show when={model().nextSpeakers()}>
          {(speakers) => (
            <span class="speakers">
              <Show when={speakers().lead}>
                {(lead) => <SpeakerChip name={lead()} carried={speakers().carried} />}
              </Show>
              <For each={speakers().others}>{(name) => <SpeakerChip name={name} />}</For>
            </span>
          )}
        </Show>
      </header>
      <PreviewFrame
        deckUrl={model().deckUrl}
        hash={hash()}
        viewport={model().slide()?.viewport ?? null}
        label="Next slide"
        placeholder={placeholder()}
        onState={model().handleNextPreviewState}
      />
    </section>
  );
}
