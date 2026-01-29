# AGENT_HELP.md

Goal: create a slide deck that works with mini-presenter.

## How mini-presenter works
- Serves the folder you pass on the CLI (HTML/CSS/JS assets).
- Injects `<script src="/_/client/injected.js"></script>` into every HTML file.
- The injected script connects to `/_/ws` as a **display**, reports slide state, and listens for navigation commands from the presenter.
- Presenter UI is at `/_/presenter` and controls the display via WebSocket.

## Required deck behavior
Your deck **must** provide a stable slide identifier and respond to navigation.

### Slide identifier
The presenter uses this in order:
1. `window.miniPresenter.getCurrentSlide()` if defined.
2. `location.hash` (fallback). If empty, `"#"` is used.

**Recommendation:** update `location.hash` whenever the slide changes.

### Navigation commands
Presenter sends `next`, `prev`, `first`, `last`, and `goto`.

**Preferred (API):** implement `window.miniPresenter` methods (see below).

**Fallback (keyboard):** the injected display script dispatches keydown events:
- `next` → `ArrowRight`
- `prev` → `ArrowLeft`
- `first` → `Home`
- `last` → `End`

Your deck must handle those keys if you do not provide API methods.

## Optional deck API (recommended)
```js
window.miniPresenter = {
  next() {},
  prev() {},
  first() {},
  last() {},
  goto(hash) {},

  getCurrentSlide() { return location.hash || "#"; },
  getSlideList() { return ["#1", "#2", "#3"]; },
  getNotes(slideId) { return "Speaker notes"; }
};
```

Behavior details:
- `getSlideList()` enables the **next-slide preview** in the presenter.
- `getNotes(slideId)` supplies speaker notes directly from the deck (string only).

## Presenter preview context
Presenter loads slide previews in iframes with the `?_presenter_preview=1` query param.
When that flag is present, the injected script:
- sets `window.miniPresenter.isPresenterPreview = true`
- sets `document.documentElement.dataset.presenterPreview = "true"`
- mutes all `<audio>`/`<video>` elements so presenter previews stay silent

Use this flag to disable autoplay audio or other heavy effects in the presenter view.

## Fixed-size deck layout (recommended)
Presenter previews render in small iframes, so fluid layouts can reflow and cause awkward previews.
Use a fixed canvas (for example 1920×1080) and scale it to the viewport:
- Wrap slides in a `.deck` container with a fixed width/height.
- Center it with `position: absolute; top: 50%; left: 50%` and scale via `transform: translate(-50%, -50%) scale(...)`.
- Recompute scale on `resize` so the deck stays crisp in both the main display and previews.

See `examples/basic/index.html` for a working reference.

## Hash-based navigation (recommended)
Use URL hashes to encode slide state, e.g. `#3` or `#4.2` for build steps.
- Call `history.replaceState()` or `location.hash = ...` when state changes.
- Listen to `hashchange` (and/or `popstate`) to sync state when presenter jumps.

### Relative preview hashes
If presenter config enables `preview.relativeHash`, the presenter loads `#<hash>~next` in the **next** preview iframe.
Your deck must resolve `~next`/`~prev` to the correct slide/build state (see `examples/basic/index.html`).

## Speaker notes
Presenter looks for notes in this order:
1. `window.miniPresenter.getNotes(slideId)` (if `notes.source` is `api` or `auto`).
2. Files in `notes/` next to `index.html` (if `notes.source` is `files` or `auto`).

File mapping (hash → notes file):
- `#1` → `notes/1.md`
- `#1.2` → `notes/1.2.md` (falls back to `notes/1.md` if missing)
- `#2-1` → `notes/2-1.md` (falls back to `notes/2.md`)
- `#/2/1` → `notes/2--1.md` (slashes become `--`)
- `#intro` → `notes/intro.md`

Notes API used by presenter: `/_/api/notes?hash=%23intro`.

## Optional `presenter.json`
Place next to `index.html` to configure presenter UI.
```json
{
  "title": "My Presentation",
  "keyboard": {
    "next": ["ArrowRight", "Space", "PageDown", "l", "j"],
    "prev": ["ArrowLeft", "PageUp", "h", "k"],
    "first": ["Home"],
    "last": ["End"]
  },
  "notes": { "source": "api" },
  "preview": { "relativeHash": true }
}
```
- `notes.source`: `api`, `files`, or `none` (default: `auto`).
- `preview.relativeHash`: enables `#<hash>~next` preview resolution.
- Config is available at `/_/api/config`.

## Minimal working recipe
1. Create `index.html` with slides and a JS router.
2. Update `location.hash` on slide change.
3. Handle `ArrowRight/ArrowLeft/Home/End` or implement `window.miniPresenter`.
4. (Optional) Implement `getSlideList()` for next preview and `getNotes()` for notes.
5. (Optional) Add `notes/*.md` and `presenter.json`.

See `examples/basic/index.html` for a working reference.
