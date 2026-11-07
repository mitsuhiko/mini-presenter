// Timer budgeting: per-slide durations, totals and pace. Pure functions.

import { normalizeSlideKey, type ResolvedTimer } from "./config.ts";
import { stripRelativeSuffix } from "./notes.ts";

/** Index of `hash` in a slide list, treating `#3.2` as part of `#3`. */
export function findSlideIndex(order: readonly string[] | null | undefined, hash: string | null | undefined): number {
  if (!order || !hash) {
    return -1;
  }
  const base = stripRelativeSuffix(hash);
  const exact = order.indexOf(base);
  if (exact !== -1) {
    return exact;
  }
  return order.findIndex((entry) => base.startsWith(`${entry}.`));
}

export interface TimerBudget {
  settings: ResolvedTimer;
  /** Durations read from `data-slide-time` attributes (ms). */
  domTimes: ReadonlyMap<string, number>;
  order: readonly string[] | null;
}

/** Planned duration (ms) for a slide; `#3.2` falls back to `#3`. */
export function slideBudget(budget: TimerBudget, hash: string | null | undefined): number {
  const key = normalizeSlideKey(stripRelativeSuffix(hash ?? ""));
  if (!key) {
    return budget.settings.defaultSlideMs;
  }
  const candidates = [key];
  const dot = key.indexOf(".");
  if (dot > 1) {
    candidates.push(key.slice(0, dot));
  }
  for (const candidate of candidates) {
    const value = budget.settings.slides.get(candidate) ?? budget.domTimes.get(candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return budget.settings.defaultSlideMs;
}

function sumWithTransitions(durations: number[], transitionMs: number): number {
  const total = durations.reduce((sum, value) => sum + value, 0);
  return total + Math.max(0, durations.length - 1) * transitionMs;
}

/** Total countdown (ms): explicit duration, else derived from slide budgets. */
export function totalBudget(budget: TimerBudget): number {
  const { settings, order, domTimes } = budget;
  if (settings.totalMs > 0) {
    return settings.totalMs;
  }
  if (order && order.length > 0) {
    return sumWithTransitions(
      order.map((hash) => slideBudget(budget, hash)),
      settings.transitionMs,
    );
  }
  const known = settings.slides.size > 0 ? [...settings.slides.values()] : [...domTimes.values()];
  return sumWithTransitions(known, settings.transitionMs);
}

/** Planned time left (ms) after the current slide's remaining time. */
export function plannedRemaining(budget: TimerBudget, hash: string, currentSlideRemaining: number): number | null {
  const index = findSlideIndex(budget.order, hash);
  if (!budget.order || index < 0) {
    return null;
  }
  let future = 0;
  for (let next = index + 1; next < budget.order.length; next += 1) {
    future += slideBudget(budget, budget.order[next]);
  }
  const transitions = (budget.order.length - index - 1) * budget.settings.transitionMs;
  return Math.max(0, currentSlideRemaining) + future + transitions;
}

export interface SlideTiming {
  budgetMs: number;
  actualMs: number;
}

export type PaceTrend = "steady" | "slowing down" | "speeding up";

/** Compares the last few slides against their budgets. */
export function paceTrend(history: readonly SlideTiming[]): PaceTrend {
  const recent = history.slice(-3).filter((entry) => entry.budgetMs > 0);
  const budget = recent.reduce((sum, entry) => sum + entry.budgetMs, 0);
  if (budget <= 0) {
    return "steady";
  }
  const ratio = recent.reduce((sum, entry) => sum + entry.actualMs, 0) / budget;
  return ratio > 1.08 ? "slowing down" : ratio < 0.92 ? "speeding up" : "steady";
}
