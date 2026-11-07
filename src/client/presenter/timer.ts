// Presenter timer: count-up, total countdown or per-slide countdown with pace.

import { createSignal } from "solid-js";
import { resolveTimer, type ResolvedTimer, type TimerMode } from "../../shared/config.ts";
import { paceTrend, plannedRemaining, slideBudget, totalBudget, type SlideTiming, type TimerBudget } from "../../shared/timer.ts";
import { formatDuration } from "../lib/format.ts";

export type Level = "normal" | "good" | "warn" | "danger";
export type TimerState = "idle" | "armed" | "running" | "paused" | "finished";

export interface TimerView {
  mode: TimerMode;
  state: TimerState;
  label: string;
  primary: string;
  primaryLevel: Level;
  secondary: string | null;
  secondaryLevel: Level;
  pace: string | null;
  paceLevel: Level;
  /** Fraction of the planned time used (countdown modes). */
  progress: number | null;
}

const TICK_MS = 250;
const PACE_TOLERANCE_MS = 5000;

function settingsKey(settings: ResolvedTimer): string {
  return JSON.stringify({ ...settings, slides: [...settings.slides] });
}

function slideLevel(remaining: number): Level {
  return remaining <= 5000 ? "danger" : remaining <= 10_000 ? "warn" : "normal";
}

export class TimerController {
  private settings = resolveTimer(undefined);
  private order: readonly string[] | null = null;
  private domTimes = new Map<string, number>();
  private running = false;
  private started = false;
  private finished = false;
  private elapsed = 0;
  private lastTick = 0;
  private armedSlide: string | null = null;
  private slideKey: string | null = null;
  private hash = "#";
  private slideMs = 0;
  private slideStart = 0;
  private history: SlideTiming[] = [];
  private interval: number | null = null;
  private readonly viewSignal = createSignal<TimerView>(this.compute());

  get view(): () => TimerView {
    return this.viewSignal[0];
  }

  private get budget(): TimerBudget {
    return { settings: this.settings, order: this.order, domTimes: this.domTimes };
  }

  private get countdown(): boolean {
    return this.settings.mode !== "countup";
  }

  /** Total elapsed time, used for recording timestamps and the like. */
  get elapsedMs(): number {
    return this.elapsed;
  }

  configure(settings: ResolvedTimer): void {
    if (settingsKey(settings) === settingsKey(this.settings)) return;
    this.settings = settings;
    this.running = false;
    this.started = false;
    this.finished = false;
    this.elapsed = 0;
    this.slideStart = 0;
    this.history = [];
    this.armedSlide = null;
    this.slideMs = slideBudget(this.budget, this.hash);
    if (!this.countdown && this.slideKey) {
      this.start();
    } else if (this.countdown && this.slideKey) {
      this.armedSlide = this.slideKey;
    }
    this.publish();
  }

  setOrder(order: readonly string[] | null): void {
    this.order = order;
    this.slideMs = slideBudget(this.budget, this.hash);
    this.publish();
  }

  setDomTimes(times: Record<string, number> | undefined): void {
    const next = new Map(Object.entries(times ?? {}));
    if (JSON.stringify([...next]) === JSON.stringify([...this.domTimes])) return;
    this.domTimes = next;
    this.slideMs = slideBudget(this.budget, this.hash);
    this.publish();
  }

  slideChanged(slideKey: string, hash: string): void {
    if (slideKey === this.slideKey && hash === this.hash) return;
    const previous = this.slideKey;
    if (this.started && this.slideMs > 0) {
      this.history = [...this.history.slice(-19), { budgetMs: this.slideMs, actualMs: this.elapsed - this.slideStart }];
    }
    this.slideKey = slideKey;
    this.hash = hash;
    this.slideMs = slideBudget(this.budget, hash);
    this.slideStart = this.elapsed;
    if (!this.started) {
      if (!this.countdown) {
        this.start();
      } else if (!this.armedSlide) {
        // Countdowns are armed on the first slide and start once we move on.
        this.armedSlide = slideKey;
      } else if (previous === this.armedSlide) {
        this.start();
      }
    }
    this.publish();
  }

  toggle(): void {
    if (this.running) {
      this.pause();
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.running) return;
    if (this.finished) this.reset();
    this.started = true;
    this.running = true;
    this.lastTick = performance.now();
    this.interval ??= window.setInterval(() => this.tick(), TICK_MS);
    this.publish();
  }

  pause(): void {
    if (!this.running) return;
    this.tick();
    this.running = false;
    this.publish();
  }

  reset(): void {
    this.elapsed = 0;
    this.slideStart = 0;
    this.history = [];
    this.finished = false;
    this.lastTick = performance.now();
    this.publish();
  }

  dispose(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }

  private tick(): void {
    if (!this.running) return;
    const now = performance.now();
    this.elapsed += now - this.lastTick;
    this.lastTick = now;
    const total = totalBudget(this.budget);
    if (this.settings.mode === "countdown-total" && total > 0 && this.elapsed >= total) {
      this.elapsed = total;
      this.running = false;
      this.finished = true;
    }
    this.publish();
  }

  private publish(): void {
    this.viewSignal[1](this.compute());
  }

  private compute(): TimerView {
    const mode = this.settings.mode;
    const state: TimerState = this.finished
      ? "finished"
      : this.running
        ? "running"
        : this.started
          ? "paused"
          : this.countdown && this.armedSlide
            ? "armed"
            : "idle";
    const onSlide = Math.max(0, this.elapsed - this.slideStart);
    const slideRemaining = this.slideMs > 0 ? this.slideMs - onSlide : null;
    const total = this.countdown ? totalBudget(this.budget) : 0;
    const totalRemaining = total > 0 ? total - this.elapsed : null;

    const view: TimerView = {
      mode,
      state,
      label: "Elapsed",
      primary: formatDuration(this.elapsed),
      primaryLevel: "normal",
      secondary: null,
      secondaryLevel: "normal",
      pace: null,
      paceLevel: "normal",
      progress: total > 0 ? Math.min(1, this.elapsed / total) : null,
    };

    if (mode === "countup") {
      view.secondary = this.started ? `This slide ${formatDuration(onSlide)}` : null;
      return view;
    }

    if (mode === "countdown-total") {
      view.label = "Remaining";
      view.primary = formatDuration(Math.max(0, totalRemaining ?? 0));
      view.primaryLevel = totalRemaining !== null && totalRemaining <= 60_000 ? (totalRemaining <= 0 ? "danger" : "warn") : "normal";
      if (slideRemaining !== null) {
        view.secondary = `Slide ${formatDuration(slideRemaining)} of ${formatDuration(this.slideMs)}`;
        view.secondaryLevel = slideLevel(slideRemaining);
      }
    } else {
      view.label = slideRemaining === null ? "Time on slide" : "This slide";
      view.primary = slideRemaining === null ? formatDuration(onSlide) : formatDuration(slideRemaining);
      view.primaryLevel = slideRemaining === null ? "normal" : slideLevel(slideRemaining);
      view.secondary = totalRemaining !== null ? `Total ${formatDuration(Math.max(0, totalRemaining))}` : null;
    }

    const planned = totalRemaining !== null ? plannedRemaining(this.budget, this.hash, slideRemaining ?? 0) : null;
    if (planned !== null && totalRemaining !== null && this.started) {
      const buffer = totalRemaining - planned;
      const status =
        buffer > PACE_TOLERANCE_MS
          ? `Ahead ${formatDuration(buffer)}`
          : buffer < -PACE_TOLERANCE_MS
            ? `Behind ${formatDuration(-buffer)}`
            : "On pace";
      if (slideRemaining !== null && slideRemaining < 0) {
        view.pace = `${status} · over slide by ${formatDuration(-slideRemaining)}`;
        view.paceLevel = buffer >= 0 ? "warn" : "danger";
      } else {
        view.pace = `${status} · ${paceTrend(this.history)}`;
        view.paceLevel =
          buffer > PACE_TOLERANCE_MS ? "good" : buffer < -15_000 ? "danger" : buffer < -PACE_TOLERANCE_MS ? "warn" : "normal";
      }
    }
    return view;
  }
}
