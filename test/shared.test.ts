import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeSlideKey, resolveConfig, resolveTimer, sanitizeConfig } from "../src/shared/config.ts";
import { notesFileCandidates, parseInline, parseNotes, parseNotesBlocks, speakerHue } from "../src/shared/notes.ts";
import {
  formatShortcut,
  matchesShortcut,
  parseShortcut,
  resolveAction,
  shortcutFromEvent,
  type KeyEventLike,
} from "../src/shared/shortcuts.ts";
import { findSlideIndex, paceTrend, plannedRemaining, slideBudget, totalBudget, type TimerBudget } from "../src/shared/timer.ts";

function key(keyName: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key: keyName, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers };
}

describe("shortcuts", () => {
  test("parses modifiers and aliases", () => {
    assert.deepEqual(parseShortcut("Cmd+Shift+p"), { key: "p", meta: true, ctrl: false, alt: false, shift: true });
    assert.equal(parseShortcut("Space")?.key, " ");
    assert.equal(parseShortcut("esc")?.key, "Escape");
    assert.equal(parseShortcut("+")?.key, "+");
    assert.equal(parseShortcut("Shift++")?.key, "+");
    assert.equal(parseShortcut(""), null);
  });

  test("matches events strictly on modifiers", () => {
    assert.ok(matchesShortcut(key("ArrowRight"), "ArrowRight"));
    assert.ok(matchesShortcut(key("R", { shiftKey: true }), "Shift+R"));
    assert.ok(!matchesShortcut(key("r"), "Shift+R"));
    assert.ok(!matchesShortcut(key("r", { shiftKey: true }), "r"));
    assert.ok(!matchesShortcut(key("f", { metaKey: true }), "f"));
    // Punctuation implies shift on most layouts.
    assert.ok(matchesShortcut(key("?", { shiftKey: true }), "?"));
    assert.ok(matchesShortcut(key(" "), "Space"));
    assert.ok(matchesShortcut(key("Spacebar"), "Space"));
  });

  test("resolves the first matching action", () => {
    const bindings = { next: ["ArrowRight", "Space"], prev: ["ArrowLeft"] };
    assert.equal(resolveAction(key(" "), bindings), "next");
    assert.equal(resolveAction(key("ArrowLeft"), bindings), "prev");
    assert.equal(resolveAction(key("x"), bindings), null);
  });

  test("captures and formats shortcuts", () => {
    assert.equal(shortcutFromEvent(key("Shift", { shiftKey: true })), null);
    assert.equal(shortcutFromEvent(key("R", { shiftKey: true })), "Shift+R");
    assert.equal(shortcutFromEvent(key(" ")), "Space");
    assert.equal(shortcutFromEvent(key("?", { shiftKey: true })), "?");
    assert.equal(shortcutFromEvent(key("p", { metaKey: true })), "Meta+P");
    assert.equal(formatShortcut("ArrowRight"), "→");
    assert.equal(formatShortcut("Shift+R"), "Shift+R");
    assert.equal(formatShortcut("Meta+Shift+p", { mac: true }), "⇧⌘P");
  });
});

describe("config", () => {
  test("fills defaults for missing or invalid values", () => {
    const resolved = resolveConfig({ keyboard: { next: [] }, notes: { source: "bogus" as never }, title: "  " });
    assert.deepEqual(resolved.keyboard.next, ["ArrowRight", "PageDown", "Space"]);
    assert.equal(resolved.notesSource, "auto");
    assert.equal(resolved.title, null);
    assert.equal(resolved.timer.mode, "countup");
    assert.equal(resolved.draw.color, "#ff4d4d");
  });

  test("resolves timers", () => {
    const timer = resolveTimer({
      mode: "countdown",
      durationMinutes: 20,
      transitionSeconds: 0,
      slides: { intro: 30, "#2": "45", bad: -1 },
    });
    assert.equal(timer.mode, "countdown-total");
    assert.equal(timer.totalMs, 20 * 60_000);
    assert.equal(timer.transitionMs, 0);
    assert.deepEqual([...timer.slides], [
      ["#intro", 30_000],
      ["#2", 45_000],
    ]);
    assert.equal(resolveTimer({ durationSeconds: 90 }).totalMs, 90_000);
    assert.equal(resolveTimer(null).transitionMs, 2000);
  });

  test("normalizes slide keys and strips runtime keys", () => {
    assert.equal(normalizeSlideKey(" intro "), "#intro");
    assert.equal(normalizeSlideKey("#3"), "#3");
    assert.equal(normalizeSlideKey(""), null);
    assert.deepEqual(sanitizeConfig({ title: "x", sessionId: "abc", _runtime: {}, custom: 1 }), { title: "x", custom: 1 });
  });
});

describe("notes", () => {
  test("maps hashes to safe file names", () => {
    assert.deepEqual(notesFileCandidates("#1.2"), ["1.2", "1"]);
    assert.deepEqual(notesFileCandidates("#/2/1"), ["2--1", "2"]);
    assert.deepEqual(notesFileCandidates("#intro"), ["intro"]);
    assert.deepEqual(notesFileCandidates("#intro~next"), ["intro"]);
    assert.deepEqual(notesFileCandidates("#../secret"), []);
    assert.deepEqual(notesFileCandidates("#.hidden"), []);
    assert.deepEqual(notesFileCandidates("#a/../../b"), []);
    assert.deepEqual(notesFileCandidates("#a b"), []);
    assert.deepEqual(notesFileCandidates(""), []);
  });

  test("extracts speakers in order", () => {
    const parsed = parseNotes("@Alice: hello\nplain\n@ bob :hi\n@alice: again");
    assert.deepEqual(parsed.speakers, ["Alice", "bob"]);
    assert.deepEqual(parsed.lines[1], { speaker: null, text: "plain" });
    assert.equal(speakerHue("Alice"), speakerHue(" alice "));
  });

  test("parses the markdown subset", () => {
    const blocks = parseNotesBlocks("# Title\n\nSome **bold** and `code`\nnext line\n\n- a\n- b\n1. one\n---\n@Ann: *hi*");
    assert.deepEqual(
      blocks.map((block) => block.type),
      ["heading", "paragraph", "list", "list", "rule", "speaker"],
    );
    assert.deepEqual(parseInline("a **b** _c_ `d`"), [
      { type: "text", text: "a " },
      { type: "strong", text: "b" },
      { type: "text", text: " " },
      { type: "em", text: "c" },
      { type: "text", text: " " },
      { type: "code", text: "d" },
    ]);
    // Raw HTML is kept as text, never interpreted.
    assert.deepEqual(parseInline("<img onerror=x>"), [{ type: "text", text: "<img onerror=x>" }]);
  });
});

describe("timer", () => {
  const budget: TimerBudget = {
    settings: resolveTimer({ transitionSeconds: 1, defaultSlideSeconds: 10, slides: { "1": 60, "3": 30 } }),
    domTimes: new Map([["#2", 20_000]]),
    order: ["#1", "#2", "#3", "#4"],
  };

  test("finds slides including sub-steps", () => {
    assert.equal(findSlideIndex(budget.order, "#3"), 2);
    assert.equal(findSlideIndex(budget.order, "#3.2"), 2);
    assert.equal(findSlideIndex(budget.order, "#2~next"), 1);
    assert.equal(findSlideIndex(budget.order, "#9"), -1);
    assert.equal(findSlideIndex(null, "#1"), -1);
  });

  test("computes slide and total budgets", () => {
    assert.equal(slideBudget(budget, "#1"), 60_000);
    assert.equal(slideBudget(budget, "#2"), 20_000);
    assert.equal(slideBudget(budget, "#3.4"), 30_000);
    assert.equal(slideBudget(budget, "#4"), 10_000);
    assert.equal(totalBudget(budget), 120_000 + 3000);
    assert.equal(totalBudget({ ...budget, settings: resolveTimer({ durationMinutes: 5 }) }), 300_000);
  });

  test("computes planned remaining time", () => {
    assert.equal(plannedRemaining(budget, "#3", 5000), 5000 + 10_000 + 1000);
    assert.equal(plannedRemaining(budget, "#4", -100), 0);
    assert.equal(plannedRemaining(budget, "#nope", 0), null);
  });

  test("reports pace", () => {
    assert.equal(paceTrend([]), "steady");
    assert.equal(paceTrend([{ budgetMs: 1000, actualMs: 2000 }]), "slowing down");
    assert.equal(paceTrend([{ budgetMs: 1000, actualMs: 500 }]), "speeding up");
    assert.equal(paceTrend([{ budgetMs: 1000, actualMs: 1010 }]), "steady");
  });
});
