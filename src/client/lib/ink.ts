// Drawing and laser rendering shared by the display overlay and the presenter
// preview. Coordinates are normalized (0..1) relative to the drawing surface;
// sizes are ratios of the surface width.

import { DEFAULT_DRAW, DEFAULT_LASER } from "../../shared/config.ts";
import type { DrawMessage } from "../../shared/protocol.ts";

interface Stroke {
  color: string;
  size: number;
  points: Array<[number, number]>;
}

const LASER_FADE_MS = 180;

export interface InkLayer {
  apply(message: DrawMessage): void;
  clear(): void;
  resize(): void;
  destroy(): void;
}

/** Renders draw messages onto two stacked canvases inside `container`. */
export function createInkLayer(drawCanvas: HTMLCanvasElement, laserCanvas: HTMLCanvasElement): InkLayer {
  const draw = drawCanvas.getContext("2d")!;
  const laser = laserCanvas.getContext("2d")!;
  const strokes: Stroke[] = [];
  let active: Stroke | null = null;
  let width = 1;
  let height = 1;
  let laserTimer: number | null = null;

  const renderStroke = (stroke: Stroke, from = 0) => {
    const lineWidth = stroke.size * width;
    draw.strokeStyle = stroke.color;
    draw.fillStyle = stroke.color;
    draw.lineWidth = lineWidth;
    draw.lineCap = "round";
    draw.lineJoin = "round";
    const points = stroke.points;
    if (points.length === 1 || from === 0) {
      const [x, y] = points[0]!;
      draw.beginPath();
      draw.arc(x * width, y * height, lineWidth / 2, 0, Math.PI * 2);
      draw.fill();
    }
    if (points.length < 2) return;
    draw.beginPath();
    const start = Math.max(0, from - 1);
    draw.moveTo(points[start]![0] * width, points[start]![1] * height);
    for (let index = start + 1; index < points.length; index += 1) {
      draw.lineTo(points[index]![0] * width, points[index]![1] * height);
    }
    draw.stroke();
  };

  const redraw = () => {
    draw.clearRect(0, 0, width, height);
    for (const stroke of strokes) renderStroke(stroke);
  };

  const clearLaser = () => laser.clearRect(0, 0, width, height);

  const resize = () => {
    const rect = drawCanvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const ratio = devicePixelRatio || 1;
    for (const [canvas, context] of [
      [drawCanvas, draw],
      [laserCanvas, laser],
    ] as const) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    redraw();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(drawCanvas);

  return {
    apply(message) {
      switch (message.action) {
        case "clear":
          strokes.length = 0;
          active = null;
          redraw();
          clearLaser();
          return;
        case "laser": {
          const radius = (message.radius ?? DEFAULT_LASER.size) * width;
          const color = message.color ?? DEFAULT_LASER.color;
          clearLaser();
          laser.save();
          laser.fillStyle = color;
          laser.shadowColor = color;
          laser.shadowBlur = radius * 1.2;
          laser.beginPath();
          laser.arc(message.x * width, message.y * height, radius, 0, Math.PI * 2);
          laser.fill();
          laser.restore();
          if (laserTimer !== null) clearTimeout(laserTimer);
          laserTimer = window.setTimeout(clearLaser, LASER_FADE_MS);
          return;
        }
        case "start":
          active = {
            color: message.color ?? DEFAULT_DRAW.color,
            size: message.size ?? DEFAULT_DRAW.size,
            points: [[message.x, message.y]],
          };
          strokes.push(active);
          renderStroke(active);
          return;
        case "move":
        case "end":
          if (!active) return;
          active.points.push([message.x, message.y]);
          renderStroke(active, active.points.length - 1);
          if (message.action === "end") active = null;
          return;
      }
    },
    clear() {
      this.apply({ type: "draw", action: "clear" });
    },
    resize,
    destroy() {
      observer.disconnect();
      if (laserTimer !== null) clearTimeout(laserTimer);
    },
  };
}
