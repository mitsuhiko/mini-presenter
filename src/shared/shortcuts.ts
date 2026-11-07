// Keyboard shortcut parsing and matching (`ArrowRight`, `Space`, `Shift+R`, `Meta+Shift+P`).

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ParsedShortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const MODIFIER_ALIASES: Record<string, "meta" | "ctrl" | "alt" | "shift"> = {
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
};

const KEY_ALIASES: Record<string, string> = {
  space: " ",
  spacebar: " ",
  esc: "Escape",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  return: "Enter",
  del: "Delete",
};

export const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "OS", "AltGraph", "CapsLock"]);

/** Normalizes a key name the way `KeyboardEvent.key` reports it. */
export function normalizeKeyName(token: string): string {
  if (token === " ") {
    return " ";
  }
  const alias = KEY_ALIASES[token.toLowerCase()];
  if (alias) {
    return alias;
  }
  return token.length === 1 ? token.toLowerCase() : token;
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  // "Shift++" / "+" style bindings for the plus key itself.
  const tokens = shortcut === "+" ? ["+"] : shortcut.split(/\+(?!$)/u).map((token) => token.trim());
  const parsed: ParsedShortcut = { key: "", meta: false, ctrl: false, alt: false, shift: false };
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const modifier = MODIFIER_ALIASES[token.toLowerCase()];
    if (modifier && tokens.length > 1) {
      parsed[modifier] = true;
    } else {
      parsed.key = normalizeKeyName(token);
    }
  }
  return parsed.key ? parsed : null;
}

function eventKey(event: KeyEventLike): string {
  return event.key === "Spacebar" ? " " : normalizeKeyName(event.key);
}

export function matchesShortcut(event: KeyEventLike, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed || parsed.key !== eventKey(event)) {
    return false;
  }
  if (event.metaKey !== parsed.meta || event.ctrlKey !== parsed.ctrl || event.altKey !== parsed.alt) {
    return false;
  }
  // Punctuation like `?` or `+` usually requires shift to type, so only enforce
  // the shift state for letters, digits and named keys.
  const shiftImplied = parsed.key.length === 1 && !/[a-z0-9 ]/u.test(parsed.key);
  return shiftImplied || event.shiftKey === parsed.shift;
}

export function matchesAny(event: KeyEventLike, shortcuts: readonly string[]): boolean {
  return shortcuts.some((shortcut) => matchesShortcut(event, shortcut));
}

/** Finds the first action whose bindings match the event. */
export function resolveAction<A extends string>(
  event: KeyEventLike,
  bindings: Readonly<Record<A, readonly string[]>>,
): A | null {
  for (const action of Object.keys(bindings) as A[]) {
    if (matchesAny(event, bindings[action])) {
      return action;
    }
  }
  return null;
}

/** Formats a captured key event as a shortcut string (`Shift+R`). */
export function shortcutFromEvent(event: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }
  const parts: string[] = [];
  if (event.metaKey) parts.push("Meta");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key;
  const isPunctuation = key.length === 1 && !/[a-z0-9]/iu.test(key);
  if (event.shiftKey && !isPunctuation) parts.push("Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/** Human friendly label for a shortcut, used in tooltips and hints. */
export function formatShortcut(shortcut: string, { mac = false } = {}): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed) {
    return shortcut;
  }
  const names: Record<string, string> = {
    " ": "Space",
    ArrowRight: "→",
    ArrowLeft: "←",
    ArrowUp: "↑",
    ArrowDown: "↓",
    PageDown: "PgDn",
    PageUp: "PgUp",
    Escape: "Esc",
  };
  const parts: string[] = [];
  if (parsed.ctrl) parts.push(mac ? "⌃" : "Ctrl");
  if (parsed.alt) parts.push(mac ? "⌥" : "Alt");
  if (parsed.shift) parts.push(mac ? "⇧" : "Shift");
  if (parsed.meta) parts.push(mac ? "⌘" : "Meta");
  parts.push(names[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key));
  return parts.join(mac ? "" : "+");
}

export function parseShortcutList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatShortcutList(shortcuts: readonly string[] | undefined): string {
  return (shortcuts ?? []).join(", ");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!element || typeof element.tagName !== "string") {
    return false;
  }
  return (
    element.isContentEditable === true ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  );
}
