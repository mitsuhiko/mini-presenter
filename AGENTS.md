# mini-presenter

Presentation helper: a Node server that injects a display script into a deck
and serves a presenter view (`/_/presenter`), plus a serverless standalone mode.

## Layout

- `src/cli.ts`: command line entry (serve, export).
- `src/server/`: HTTP server (`index.ts` has the route table), auth (`auth.ts`),
  deck serving/proxying (`deck.ts`), WebSocket hub (`hub.ts`), questions store,
  file watcher.
- `src/export/`: PDF/PNG export through Chrome DevTools Protocol.
- `src/shared/`: code used by both server and browser: protocol types and
  routes, `presenter.json` parsing, shortcuts, notes parsing, timer math.
- `src/client/`: browser code, bundled by `scripts/build.ts` into `dist/client/`.
  - `display/`: script injected into the deck (`display.js`).
  - `standalone.ts`: serverless bootstrap (`standalone.js`).
  - `presenter/`: presenter view (Solid 2); `model.ts` holds state, controllers
    for timer, notes and recording are plain classes.
  - `questions/`, `qr/`: audience pages. `pages/`: HTML shells. `ui/`: shared
    CSS tokens/components and icons.
- `client/standalone.js`: legacy CDN shim; not part of the npm package.
- `test/`: `node:test` tests.

## Rules

- Node code must run with plain `node` (type stripping): erasable TypeScript
  syntax only (no enums, namespaces, parameter properties), `.ts` extensions in
  imports, `import type` for types.
- Keep dependencies minimal. Runtime deps: `ws`, `pdf-lib`, `qrcode-terminal`.
- Solid 2 (`solid-js`/`@solidjs/web` 2.0 RC): see
  `node_modules/solid-js/CHEATSHEET.md`. No signal writes during render or in
  memos; `createEffect(compute, apply)`.
- Anything that changes state on the server must go through
  `requirePresenter` and must not weaken the Origin/Host checks.

## Commands

- `npm run dev`: rebuild on change and serve `examples/basic` with `--watch`.
- `npm run check`: type check (node and client projects).
- `npm test`: build, then run tests.
- `npm run build`: `dist/cli.js` and `dist/client/`.
