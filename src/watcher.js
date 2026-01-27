import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXTENSIONS = new Set([".html", ".css", ".js"]);
const DEFAULT_DEBOUNCE_MS = 200;

export function watchDirectory(
  rootDir,
  onChange,
  { extensions = DEFAULT_EXTENSIONS, debounceMs = DEFAULT_DEBOUNCE_MS } = {}
) {
  let debounceTimer = null;
  let lastFilename = null;

  function schedule(filename) {
    lastFilename = filename;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (lastFilename) {
        onChange(lastFilename);
      }
    }, debounceMs);
  }

  const watcher = fs.watch(
    rootDir,
    { recursive: true },
    (eventType, filename) => {
      if (!filename) {
        return;
      }
      const ext = path.extname(filename).toLowerCase();
      if (!extensions.has(ext)) {
        return;
      }
      schedule(filename);
    }
  );

  watcher.on("error", (error) => {
    console.error("Watcher error:", error);
  });

  return watcher;
}
