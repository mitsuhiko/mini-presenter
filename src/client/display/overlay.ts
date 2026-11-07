// UI the display script adds to the deck. Everything lives in a shadow root so
// deck styles cannot leak in and ours cannot leak out.

import { createInkLayer, type InkLayer } from "../lib/ink.ts";

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.ink { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.controls {
  position: fixed; right: 16px; bottom: 16px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 8px; border-radius: 14px;
  background: rgb(16 33 40 / 0.78);
  -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.08);
  font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0; transform: translateY(6px); pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}
.controls[data-visible="true"] { opacity: 1; transform: none; pointer-events: auto; }
button {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-width: 112px; padding: 9px 14px; border-radius: 9px;
  color: #fffaf3; background: linear-gradient(#c99462, #b97f4b);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), 0 2px 0 #6f4b2a, 0 3px 8px rgb(0 0 0 / 0.25);
  transition: transform 80ms ease, box-shadow 80ms ease, filter 120ms ease;
}
button:hover { filter: brightness(1.06); }
button:active { transform: translateY(2px); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.2), 0 0 0 #6f4b2a, 0 1px 3px rgb(0 0 0 / 0.25); }
button:focus-visible { outline: 2px solid #f0c290; outline-offset: 2px; }
svg { width: 15px; height: 15px; flex: none; }
.backdrop {
  position: fixed; inset: 0; display: grid; place-items: center; padding: 32px;
  background: rgb(6 18 23 / 0.6);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  opacity: 0; pointer-events: none; transition: opacity 200ms ease;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.backdrop[data-open="true"] { opacity: 1; pointer-events: auto; }
.card {
  display: grid; justify-items: center; gap: 18px;
  max-width: min(90vw, 560px); padding: 36px 44px; border-radius: 24px;
  background: #f4fafc; color: #1d3a45; text-align: center;
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.4);
  transform: scale(0.97); transition: transform 200ms ease;
}
.backdrop[data-open="true"] .card { transform: none; }
.card h2 { margin: 0; font-size: 32px; font-weight: 750; letter-spacing: -0.02em; }
.card img { width: min(56vmin, 300px); aspect-ratio: 1; padding: 14px; border-radius: 18px; background: #fff; box-shadow: inset 0 0 0 1px #d5e7ee; }
.card p { margin: 0; font-size: 17px; font-weight: 600; color: #3b5c68; word-break: break-all; }
`;

const ICONS = {
  fullscreen:
    '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  presenter: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
};

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export interface OverlayActions {
  fullscreen(): void;
  presenter(): void;
  prev(): void;
  next(): void;
}

export interface Overlay {
  ink: InkLayer;
  /** Positions the ink layer over the slide surface. */
  setSurface(rect: { left: number; top: number; width: number; height: number }): void;
  toggleQuestions(qrUrl: string, questionsUrl: string): void;
}

const HIDE_DELAY_MS = 2000;
const TRIGGER_SIZE = 120;

export function mountOverlay(actions: OverlayActions): Overlay {
  const host = document.createElement("mini-presenter-overlay");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="layer"><div class="ink"><canvas></canvas><canvas></canvas></div></div>
    <div class="controls" part="controls" role="toolbar" aria-label="Presentation controls">
      <button data-action="fullscreen">${icon("fullscreen")}Fullscreen</button>
      <button data-action="presenter">${icon("presenter")}Presenter</button>
      <button data-action="prev">${icon("prev")}Prev</button>
      <button data-action="next">Next${icon("next")}</button>
    </div>
    <div class="backdrop" role="dialog" aria-label="Ask a question">
      <div class="card"><h2>Ask a question</h2><img alt="QR code for questions"><p></p></div>
    </div>`;

  const [drawCanvas, laserCanvas] = shadow.querySelectorAll("canvas");
  const controls = shadow.querySelector<HTMLElement>(".controls")!;
  const backdrop = shadow.querySelector<HTMLElement>(".backdrop")!;

  controls.addEventListener("click", (event) => {
    const action = (event.target as Element).closest("button")?.dataset.action as keyof OverlayActions | undefined;
    if (action) actions[action]();
  });

  let hideTimer: number | null = null;
  let hovering = false;
  const show = () => {
    controls.dataset.visible = "true";
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!hovering) controls.dataset.visible = "false";
    }, HIDE_DELAY_MS);
  };
  controls.addEventListener("pointerenter", () => (hovering = true));
  controls.addEventListener("pointerleave", () => {
    hovering = false;
    show();
  });
  document.addEventListener("pointermove", (event) => {
    if (innerWidth - event.clientX <= TRIGGER_SIZE && innerHeight - event.clientY <= TRIGGER_SIZE) show();
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.dataset.open = "false";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && backdrop.dataset.open === "true") backdrop.dataset.open = "false";
  });

  const attach = () => document.body.append(host);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });

  const inkBox = shadow.querySelector<HTMLElement>(".ink")!;
  let surfaceKey = "";

  return {
    ink: createInkLayer(drawCanvas!, laserCanvas!),
    setSurface(rect) {
      const key = `${rect.left},${rect.top},${rect.width},${rect.height}`;
      if (key === surfaceKey) return;
      surfaceKey = key;
      Object.assign(inkBox.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    },
    toggleQuestions(qrUrl, questionsUrl) {
      const open = backdrop.dataset.open !== "true";
      if (open) {
        shadow.querySelector("img")!.src = qrUrl;
        shadow.querySelector(".card p")!.textContent = questionsUrl;
      }
      backdrop.dataset.open = String(open);
    },
  };
}
