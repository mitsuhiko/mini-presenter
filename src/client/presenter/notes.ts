// Speaker notes: from the deck API, from `notes/*.md` files, or both.

import { createSignal } from "solid-js";
import type { NotesSource } from "../../shared/config.ts";
import { parseNotes, stripRelativeSuffix } from "../../shared/notes.ts";
import { ROUTES } from "../../shared/protocol.ts";
import { findSlideIndex } from "../../shared/timer.ts";

export type NotesOrigin = "deck" | "file" | null;

export interface NotesView {
  status: "loading" | "ready" | "empty" | "disabled";
  text: string;
  origin: NotesOrigin;
  /** Speakers named on this slide, in order. */
  speakers: string[];
  /** Speaker carried over from an earlier slide when this one names none. */
  carried: string | null;
}

export interface SpeakerInfo {
  lead: string | null;
  others: string[];
  carried: boolean;
}

interface NotesEntry {
  text: string | null;
  origin: NotesOrigin;
}

export class NotesController {
  private source: NotesSource = "auto";
  private filesAvailable = false;
  /** Notes reported by the deck API, keyed by hash. */
  private readonly deckNotes = new Map<string, string | null>();
  /** Notes loaded from files, keyed by hash. */
  private readonly fileNotes = new Map<string, string | null>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private order: readonly string[] | null = null;
  private currentHash: string | null = null;
  private lastSpeaker: string | null = null;
  private generation = 0;
  private readonly viewSignal = createSignal<NotesView>({ status: "loading", text: "", origin: null, speakers: [], carried: null });
  private readonly versionSignal = createSignal(0);

  get view(): () => NotesView {
    return this.viewSignal[0];
  }

  /** Bumps whenever any cached notes change (for dependent lookups like next speakers). */
  get version(): () => number {
    return this.versionSignal[0];
  }

  configure(source: NotesSource, filesAvailable: boolean): void {
    if (source === this.source && filesAvailable === this.filesAvailable) return;
    this.source = source;
    this.filesAvailable = filesAvailable;
    this.refresh();
  }

  setOrder(order: readonly string[] | null): void {
    this.order = order;
  }

  /** Clears cached files, e.g. after the notes folder changed on disk. */
  invalidateFiles(): void {
    this.fileNotes.clear();
    this.pending.clear();
    this.refresh();
  }

  /** Records notes the deck API reported for a slide. `undefined` means no API. */
  reportDeckNotes(hash: string, notes: string | null | undefined): void {
    if (notes === undefined) return;
    const key = stripRelativeSuffix(hash);
    if (this.deckNotes.get(key) === notes) return;
    this.deckNotes.set(key, notes);
    this.bump();
  }

  show(hash: string, deckNotes: string | null | undefined): void {
    this.reportDeckNotes(hash, deckNotes);
    this.currentHash = stripRelativeSuffix(hash);
    this.refresh();
  }

  private bump(): void {
    this.versionSignal[1]((value) => value + 1);
  }

  private get usesDeck(): boolean {
    return this.source === "auto" || this.source === "api";
  }

  private get usesFiles(): boolean {
    return this.filesAvailable && (this.source === "auto" || this.source === "files");
  }

  /** Cached notes for a hash, or `undefined` if they still need loading. */
  private cached(hash: string): NotesEntry | undefined {
    const deck = this.usesDeck ? this.deckNotes.get(hash) : undefined;
    if (deck) return { text: deck, origin: "deck" };
    if (!this.usesFiles) return { text: null, origin: null };
    if (!this.fileNotes.has(hash)) return undefined;
    const file = this.fileNotes.get(hash) ?? null;
    return { text: file, origin: file ? "file" : null };
  }

  private load(hash: string): Promise<string | null> {
    let promise = this.pending.get(hash);
    if (!promise) {
      promise = fetch(`${ROUTES.api.notes}?hash=${encodeURIComponent(hash)}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<{ notes: string | null }>) : { notes: null }))
        .then((data) => (typeof data.notes === "string" ? data.notes : null))
        .catch(() => null)
        .then((notes) => {
          this.fileNotes.set(hash, notes);
          this.pending.delete(hash);
          this.bump();
          // Earlier slides can change which speaker carries over to this one.
          if (hash !== this.currentHash) this.refresh();
          return notes;
        });
      this.pending.set(hash, promise);
    }
    return promise;
  }

  /** Notes for any slide; loads files on demand and resolves `null` if none. */
  async notesFor(hash: string): Promise<NotesEntry> {
    const key = stripRelativeSuffix(hash);
    const cached = this.cached(key);
    if (cached) return cached;
    await this.load(key);
    return this.cached(key) ?? { text: null, origin: null };
  }

  /** Synchronous lookup; kicks off loading and returns `undefined` when unknown. */
  peek(hash: string): NotesEntry | undefined {
    const key = stripRelativeSuffix(hash);
    const cached = this.cached(key);
    if (!cached && this.usesFiles) void this.load(key);
    return cached;
  }

  /** Lead speaker before `hash` in slide order, walking back through notes. */
  speakerBefore(hash: string): string | null {
    const index = findSlideIndex(this.order, hash);
    if (!this.order || index < 0) {
      return this.lastSpeaker;
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const entry = this.peek(this.order[cursor]!);
      if (!entry) return this.lastSpeaker;
      const speakers = parseNotes(entry.text).speakers;
      if (speakers.length > 0) return speakers[0]!;
    }
    return null;
  }

  speakersFor(hash: string): SpeakerInfo | null {
    if (this.source === "none") return null;
    const entry = this.peek(hash);
    if (!entry) return null;
    const speakers = parseNotes(entry.text).speakers;
    if (speakers.length > 0) {
      return { lead: speakers[0]!, others: speakers.slice(1), carried: false };
    }
    const carried = this.speakerBefore(hash);
    return { lead: carried, others: [], carried: carried !== null };
  }

  private refresh(): void {
    const hash = this.currentHash;
    const setView = this.viewSignal[1];
    if (this.source === "none") {
      setView({ status: "disabled", text: "", origin: null, speakers: [], carried: null });
      return;
    }
    if (!hash) return;
    const generation = ++this.generation;
    const apply = (entry: NotesEntry) => {
      if (generation !== this.generation) return;
      const speakers = parseNotes(entry.text).speakers;
      if (speakers.length > 0) this.lastSpeaker = speakers[0]!;
      setView({
        status: entry.text?.trim() ? "ready" : "empty",
        text: entry.text ?? "",
        origin: entry.origin,
        speakers,
        carried: speakers.length > 0 ? null : this.speakerBefore(hash),
      });
    };
    const cached = this.cached(hash);
    if (cached) {
      apply(cached);
      return;
    }
    setView((previous) => ({ ...previous, status: "loading" }));
    void this.notesFor(hash).then(apply);
  }
}
