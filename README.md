# mini-presenter

Run a local HTTP server that injects a display script into your slides and exposes a presenter view.

## Usage

```bash
mini-presenter path/to/presentation --port 8080
```

- Presentation: `http://localhost:8080/`
- Presenter view: `http://localhost:8080/_/presenter`

## Configuration (`presenter.json`)

Place an optional `presenter.json` next to your `index.html` to customize the presenter experience.

```json
{
  "title": "My Presentation",
  "keyboard": {
    "next": ["ArrowRight", "Space", "PageDown", "l", "j"],
    "prev": ["ArrowLeft", "PageUp", "h", "k"],
    "first": ["Home"],
    "last": ["End"]
  },
  "notes": {
    "source": "files"
  },
  "slides": ["#intro", "#slide-1", "#slide-2"]
}
```

- `title`: Updates the presenter header and browser title.
- `keyboard`: Custom key bindings for presenter navigation.
- `notes.source`: `api`, `files`, or `none` (default: `api` + file fallback).
- `slides`: Optional explicit slide order (reserved for future features).

The config is available at `/_/api/config`.

## Speaker notes

Notes are shown in the presenter view and loaded in this order:

1. Presentation API: define `window.miniPresenter.getNotes(slideId)` in your deck.
2. Notes files: add Markdown files under `notes/` next to your `index.html`.

File mapping examples:

- `#1` → `notes/#1.md`
- `#/2/1` → `notes/#-2-1.md` (slashes replaced with dashes)
- `#intro` → `notes/#intro.md`

Notes are fetched from `/_/api/notes?hash=%23intro` and rendered as pre-wrapped text.
