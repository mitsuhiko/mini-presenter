// A slide preview: the deck in an iframe, rendered at the display's surface
// size and scaled down to fit, so previews match the audience view.

import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { isRecord, PREVIEW_PARAM, type PreviewMessage, type PreviewState, type Viewport } from "../../../shared/protocol.ts";

export interface PreviewFrameProps {
  deckUrl: string;
  hash: string | null;
  viewport: Viewport | null;
  label: string;
  /** Shown over the preview instead of the slide. */
  placeholder?: string | null;
  onState?: (state: PreviewState) => void;
  /** Overlays rendered on top of the slide (e.g. drawing canvases). */
  children?: JSX.Element;
}

const DEFAULT_ASPECT = 16 / 9;

function previewSrc(deckUrl: string, hash: string): string {
  const url = new URL(deckUrl, location.href);
  url.searchParams.set(PREVIEW_PARAM, "1");
  url.hash = hash;
  return url.toString();
}

export function PreviewFrame(props: PreviewFrameProps) {
  let iframe: HTMLIFrameElement | undefined;
  let well: HTMLDivElement | undefined;
  const [stageWidth, setStageWidth] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);

  let seq = 0;
  let expectedSeq = 0;
  let ready = false;
  let loadedDeck: string | null = null;

  const aspect = createMemo(() => {
    const viewport = props.viewport;
    return viewport && viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : DEFAULT_ASPECT;
  });

  // Render the iframe at (at least) the display's surface size, then scale.
  const frameStyle = createMemo(() => {
    const width = stageWidth();
    const viewport = props.viewport;
    if (!viewport || width <= 0) {
      return { width: "100%", height: "100%" };
    }
    const virtualWidth = Math.max(width, viewport.width);
    const scale = width / virtualWidth;
    return {
      width: `${virtualWidth}px`,
      height: `${virtualWidth / aspect()}px`,
      transform: `scale(${scale})`,
    };
  });

  createEffect(
    () => ({ deck: props.deckUrl, hash: props.hash }),
    ({ deck, hash }) => {
      if (!hash || !iframe) return;
      if (ready && loadedDeck === deck && iframe.contentWindow) {
        seq += 1;
        expectedSeq = seq;
        const message: PreviewMessage = { type: "miniPresenterPreview", action: "goto", hash, seq };
        iframe.contentWindow.postMessage(message, "*");
        return;
      }
      if (loadedDeck !== deck) {
        ready = false;
        setLoaded(false);
      }
      loadedDeck = deck;
      expectedSeq = 0;
      iframe.src = previewSrc(deck, hash);
    },
  );

  onSettled(() => {
    const onMessage = (event: MessageEvent) => {
      if (!iframe || event.source !== iframe.contentWindow) return;
      const data: unknown = event.data;
      if (!isRecord(data) || data.type !== "miniPresenterPreviewState" || typeof data.hash !== "string") return;
      const state = data as unknown as PreviewState;
      ready = true;
      setLoaded(true);
      // Ignore reports that predate our latest request or are still unresolved.
      if ((state.seq ?? 0) < expectedSeq || /~(next|prev)$/u.test(state.hash)) return;
      props.onState?.(state);
    };
    addEventListener("message", onMessage);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    const stage = well?.querySelector(".preview__stage");
    if (stage) observer.observe(stage);
    return () => {
      removeEventListener("message", onMessage);
      observer.disconnect();
    };
  });

  return (
    <div class="preview" ref={(element) => (well = element)} style={{ "--aspect": String(aspect()) }}>
      <div class={["preview__stage", { "preview__stage--hidden": Boolean(props.placeholder) || !loaded() }]}>
        <iframe
          ref={(element) => (iframe = element)}
          title={props.label}
          style={frameStyle()}
          tabindex="-1"
          onLoad={() => setLoaded(true)}
          allow="autoplay 'none'; fullscreen 'none'"
          referrerpolicy="no-referrer"
        />
        {props.children}
      </div>
      <Show when={props.placeholder}>{(text) => <div class="preview__placeholder">{text()}</div>}</Show>
    </div>
  );
}
