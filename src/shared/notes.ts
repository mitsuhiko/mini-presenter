// Speaker notes: file name mapping, `@speaker:` markers, and a tiny, safe
// Markdown subset for rendering.

const SPEAKER_MARKER = /^\s*@([^:\n]+?)\s*:\s*(.*)$/u;

/** Removes relative preview suffixes (`#3~next`). */
export function stripRelativeSuffix(hash: string): string {
  return hash.replace(/~(next|prev)$/u, "");
}

/**
 * Maps a slide hash to candidate note file names (without `.md`).
 *
 * `#1.2` → `1.2`, `1`; `#/2/1` → `2--1`, `2`; `#intro` → `intro`.
 */
export function notesFileCandidates(hash: string | null | undefined): string[] {
  if (!hash) {
    return [];
  }
  const name = stripRelativeSuffix(hash.replace(/^#/u, "")).replace(/\//gu, "--").replace(/^-+/u, "");
  // Only allow plain file names: no traversal, no hidden files.
  if (!name || name.startsWith(".") || name.includes("..") || !/^[\p{L}\p{N}_.~-]+$/u.test(name)) {
    return [];
  }
  const candidates = [name];
  const base = name.split(/--|-|\./u)[0];
  if (base && base !== name && /^\d+$/u.test(base)) {
    candidates.push(base);
  }
  return candidates;
}

export interface NotesLine {
  speaker: string | null;
  text: string;
}

export interface ParsedNotes {
  lines: NotesLine[];
  /** Speakers in order of first appearance. */
  speakers: string[];
}

export function normalizeSpeaker(name: string): string {
  return name.replace(/\s+/gu, " ").trim();
}

export function parseNotes(content: string | null | undefined): ParsedNotes {
  const lines: NotesLine[] = [];
  const speakers: string[] = [];
  const seen = new Set<string>();
  for (const line of (content ?? "").split(/\r?\n/u)) {
    const match = SPEAKER_MARKER.exec(line);
    const speaker = match ? normalizeSpeaker(match[1] ?? "") : "";
    if (!match || !speaker) {
      lines.push({ speaker: null, text: line });
      continue;
    }
    lines.push({ speaker, text: match[2] ?? "" });
    const identity = speaker.toLocaleLowerCase();
    if (!seen.has(identity)) {
      seen.add(identity);
      speakers.push(speaker);
    }
  }
  return { lines, speakers };
}

/** Stable hue (0-359) for a speaker name, used to color speaker chips. */
export function speakerHue(name: string): number {
  const normalized = normalizeSpeaker(name).toLocaleLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 360;
  }
  return hash;
}

// --- Markdown subset ------------------------------------------------------

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "code"; text: string };

export type Block =
  | { type: "paragraph"; content: Inline[] }
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "speaker"; name: string; content: Inline[] }
  | { type: "rule" };

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/u;

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match) {
      result.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) {
      result.push({ type: "text", text: rest.slice(0, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      result.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      result.push({ type: "strong", text: token.slice(2, -2) });
    } else {
      result.push({ type: "em", text: token.slice(1, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }
  return result;
}

/** Parses notes into blocks. Consecutive text lines form paragraphs with line breaks kept. */
export function parseNotesBlocks(content: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ...list });
      list = null;
    }
  };

  for (const line of parseNotes(content).lines) {
    if (line.speaker) {
      flushParagraph();
      flushList();
      blocks.push({ type: "speaker", name: line.speaker, content: parseInline(line.text) });
      continue;
    }
    const text = line.text;
    if (!text.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(text);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1]!.length, content: parseInline(heading[2] ?? "") });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/u.test(text)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/u.exec(text);
    if (item) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(item[3] ?? ""));
      continue;
    }
    flushList();
    paragraph.push(text);
  }
  flushParagraph();
  flushList();
  return blocks;
}
