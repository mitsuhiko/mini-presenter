import fs from "node:fs";
import path from "node:path";

export type ChangeKind = "deck" | "notes" | "config";

const IGNORED_FILES = new Set(["questions.json", "recording.json", "recording.webm"]);

function classify(filename: string): ChangeKind | null {
  const normalized = filename.split(path.sep).join("/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.startsWith(".") || segment === "node_modules")) {
    return null;
  }
  if (IGNORED_FILES.has(normalized) || normalized.endsWith(".tmp") || normalized.endsWith("~")) {
    return null;
  }
  if (normalized === "presenter.json") {
    return "config";
  }
  if (segments[0] === "notes" && normalized.endsWith(".md")) {
    return "notes";
  }
  return "deck";
}

/** Watches a deck folder and reports debounced, classified changes. */
export function watchDeck(rootDir: string, onChange: (kinds: Set<ChangeKind>) => void, debounceMs = 150): fs.FSWatcher {
  let timer: NodeJS.Timeout | null = null;
  let pending = new Set<ChangeKind>();

  const watcher = fs.watch(rootDir, { recursive: true }, (_event, filename) => {
    const kind = filename ? classify(filename.toString()) : null;
    if (!kind) {
      return;
    }
    pending.add(kind);
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const kinds = pending;
      pending = new Set();
      onChange(kinds);
    }, debounceMs);
  });
  watcher.on("error", (error) => console.error("Watcher error:", error));
  watcher.on("close", () => {
    if (timer) clearTimeout(timer);
  });
  return watcher;
}
