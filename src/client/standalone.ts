// Standalone (serverless) mode. Include this from a deck:
//
//   <script src="https://cdn.jsdelivr.net/npm/mini-presenter@0/dist/client/standalone.js"></script>
//
// It loads the display script in local mode and opens the presenter in a
// same-origin popup so both talk over BroadcastChannel. When the deck is
// served by mini-presenter itself this script does nothing.

import { cleanDeckUrl, type LocalContext } from "./lib/globals.ts";
import { presenterWindowFeatures } from "./lib/popup.ts";
import { createId } from "./lib/transport.ts";

const SESSION_KEY = "miniPresenter.localSessionId";

function run(): void {
  if ((window as { __miniPresenterStandaloneBooted?: boolean }).__miniPresenterStandaloneBooted) return;
  (window as { __miniPresenterStandaloneBooted?: boolean }).__miniPresenterStandaloneBooted = true;

  const script = document.currentScript as HTMLScriptElement | null;
  const dataset = script?.dataset ?? {};
  const assetBase = dataset.base
    ? new URL(dataset.base, location.href).toString()
    : new URL("./", script?.src || location.href).toString();
  const asset = (name: string, override?: string) => new URL(override ?? name, override ? location.href : assetBase).toString();
  const displayUrl = asset("display.js", dataset.display);
  const presenterUrl = asset("presenter.html", dataset.presenter);
  const params = new URLSearchParams(location.search);

  const sessionId = (() => {
    const fromQuery = params.get("mp_session");
    if (fromQuery) return fromQuery;
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) return stored;
      const fresh = createId();
      sessionStorage.setItem(SESSION_KEY, fresh);
      return fresh;
    } catch {
      return createId();
    }
  })();
  const deckUrl = params.get("mp_deck") ?? cleanDeckUrl();

  let template: Promise<string> | null = null;
  const loadTemplate = () =>
    (template ??= fetch(presenterUrl, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`Failed to load presenter (${response.status})`);
      return response.text();
    }));

  const escape = (value: string) =>
    value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

  const write = (popup: Window, html: string) => {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  const openPresenterWindow = (options: { sessionId?: string; deckUrl?: string } = {}): Window | null => {
    const context: LocalContext = {
      sessionId: options.sessionId ?? sessionId,
      deckUrl: options.deckUrl ?? deckUrl,
      assetBase,
    };
    // An about:blank popup inherits our origin, so BroadcastChannel works even
    // though the presenter assets come from a CDN.
    const popup = window.open("about:blank", "miniPresenterView", presenterWindowFeatures(window.screen));
    if (!popup) return null;
    write(popup, '<!doctype html><meta charset="utf-8"><title>mini-presenter</title><body style="font:15px system-ui;padding:2rem;color:#2d4b57;background:#d7ebf2">Loading presenter…');
    loadTemplate()
      .then((html) => {
        const head =
          `<base href="${escape(assetBase)}">` +
          `<script>window.__miniPresenterStandaloneContext=${JSON.stringify(context).replace(/</gu, "\\u003c")}</script>`;
        write(popup, /<head[^>]*>/iu.test(html) ? html.replace(/<head([^>]*)>/iu, `<head$1>${head}`) : head + html);
      })
      .catch((error: unknown) => {
        const fallback = new URL(presenterUrl);
        fallback.search = new URLSearchParams({ mp_mode: "local", mp_session: context.sessionId, mp_deck: context.deckUrl }).toString();
        write(
          popup,
          `<!doctype html><meta charset="utf-8"><title>mini-presenter</title><body style="font:15px system-ui;padding:2rem">` +
            `<h1>Could not load the presenter</h1><p>${escape(String((error as Error)?.message ?? error))}</p>` +
            `<p>Try opening <a href="${escape(fallback.toString())}" target="_blank" rel="opener">${escape(fallback.toString())}</a></p>`,
        );
      });
    return popup;
  };

  window.miniPresenterStandalone = { openPresenterWindow, getAssetBaseUrl: () => assetBase };

  const start = () => {
    const forced = dataset.force === "true" || dataset.force === "1" || params.get("mp_mode") === "local";
    if (window.__miniPresenterDisplayInjected && !forced) {
      // Served by mini-presenter: the server already injected the display script.
      return;
    }
    window.__miniPresenterLocal = { sessionId, deckUrl, assetBase };
    if (!document.querySelector(`script[src="${CSS.escape(displayUrl)}"]`)) {
      const element = document.createElement("script");
      element.src = displayUrl;
      element.onerror = () => console.error(`mini-presenter: failed to load ${displayUrl}`);
      document.head.append(element);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    queueMicrotask(start);
  }
}

run();
