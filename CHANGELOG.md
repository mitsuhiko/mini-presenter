# Changelog

## Unreleased

This release is a rewrite of the code base in TypeScript with a rebuilt
presenter UI. Decks and `presenter.json` files keep working as before.

### Breaking changes

- The server now binds to `127.0.0.1` by default. Use `--host 0.0.0.0` (or
  `-H`) to make it reachable from other devices; network URLs with the
  presenter PIN are printed on startup.
- Node.js 22.18 or later is required.
- The standalone script moved to the npm package:
  `https://cdn.jsdelivr.net/npm/mini-presenter@0/dist/client/standalone.js`.
  The old `gh/…/client/standalone.js` URL forwards to it.
- Reading recordings (`/_/api/recording`) now requires presenter access.

### Changes

- Rebuilt the presenter view with Solid: refined teal/copper design with dark
  mode, resizable panels, compact layout for small windows and phones, a
  settings dialog with form and JSON editing and shortcut capture, a questions
  dialog, confirmations for destructive actions, and a timer with pace info.
- Speaker notes render a small Markdown subset (headings, lists, emphasis, code).
- Notes and `presenter.json` changes are applied live with `--watch` without
  reloading the slides.
- Previews render at the display's real size and scale down, so they match
  what the audience sees.
- The questions QR code uses a network address instead of `localhost` when
  the server listens on all interfaces.
- PDF/PNG export uses a headless Chrome with a throwaway profile, supports
  `CHROME_PATH`, reports progress, and the export runs on its own server.
- Static files support HTTP range requests and conditional requests, so
  videos in decks can seek.
- Added tests (`npm test`) and type checking (`npm run check`).

### Security

- The presenter PIN is no longer accepted from `X-Forwarded-For` spoofing:
  proxy headers are only trusted from loopback peers.
- The PIN is exchanged for an HttpOnly session cookie and stripped from the
  URL instead of being kept in links and storage. Logins are rate limited.
- Cross-site requests and WebSocket connections are rejected, and requests
  using a foreign `Host` are not treated as local (DNS rebinding).
- Files outside the deck folder (including sibling folders sharing the name
  prefix), dotfiles, `questions.json` and recordings are no longer served.

### Fixes

- Malformed URLs no longer crash the server.
- Drawings and the laser pointer line up with the slide on letterboxed decks.
- Notes now show on the first slide when the URL has no hash yet.
- Recording playback no longer stops early.
- Resetting the timer asks for confirmation.
- Fixed presenter layout clipping at small window sizes.

## 0.5.1

- Fixed presenter key detection in standalone local mode so local sessions no longer prompt for a presenter code.

## 0.5.0

- Added `@name:` note markers with color-highlighted speaker tags in the notes panel.
- Added next-slide speaker hints (first + additional speakers) in the presenter preview, with speaker carry-over when a slide has no marker.
- Added standalone local-tab presenter transport with a same-origin popup shell for decks not served by `mini-presenter`.
- Improved standalone presenter behavior by gating server-only controls, preserving slide order in next-preview, loading deck config in local mode, and reducing popup/server-probe issues.

## 0.4.0

- Added a full presenter overlay with notes, next-slide preview, timer, navigation controls, configurable shortcuts, settings, and draggable layout splitters.
- Added drawing and laser tools with synced overlays plus adjustable colors and sizes.
- Added presenter recording support, PDF export controls, and a slide progress favicon.
- Added optional presenter access PIN authentication.
- Added audience Q&A pages with live updates, voting, answered state, and a QR code for audience access.
- Improved presenter polish with muted preview playback, scrollable notes, responsive notes sizing, and relative preview fixes.

## 0.3.0

- Added support for serving presentations from remote URLs.

## 0.2.0

- Switch to Apache 2.

## 0.1.0

- Initial release.
