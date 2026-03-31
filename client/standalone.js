(function initMiniPresenterStandalone(globalScope) {
  const root = globalScope || (typeof window !== "undefined" ? window : globalThis);

  if (root.__miniPresenterStandaloneBooted) {
    return;
  }
  root.__miniPresenterStandaloneBooted = true;

  const currentScript = document.currentScript;
  const scriptDataset = currentScript?.dataset ?? {};
  const shouldSkipServerNoop = scriptDataset.force === "true" || scriptDataset.force === "1";

  function createSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function resolveScriptBaseUrl() {
    if (scriptDataset.base) {
      return new URL(scriptDataset.base, root.location.href).toString();
    }
    if (currentScript?.src) {
      return new URL("./", currentScript.src).toString();
    }
    return new URL("./", root.location.href).toString();
  }

  function withDefault(url, fallback) {
    if (typeof url === "string" && url.trim()) {
      return new URL(url, root.location.href).toString();
    }
    return fallback;
  }

  const assetBaseUrl = resolveScriptBaseUrl();
  const assetUrls = {
    runtime: withDefault(scriptDataset.runtime, new URL("runtime.js", assetBaseUrl).toString()),
    transport: withDefault(scriptDataset.transport, new URL("transport.js", assetBaseUrl).toString()),
    injected: withDefault(scriptDataset.injected, new URL("injected.js", assetBaseUrl).toString()),
    presenterTemplate: withDefault(
      scriptDataset.presenter,
      new URL("presenter-standalone.html", assetBaseUrl).toString()
    ),
  };

  let presenterTemplatePromise = null;

  function scriptAlreadyLoaded(url) {
    return Array.from(document.querySelectorAll("script[src]")).some((entry) => entry.src === url);
  }

  function loadScript(url) {
    if (scriptAlreadyLoaded(url)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  function cleanDeckUrl() {
    const url = new URL(root.location.href);
    url.searchParams.delete("_presenter_preview");
    url.searchParams.delete("mp_mode");
    url.searchParams.delete("mp_session");
    url.searchParams.delete("mp_deck");
    return url.toString();
  }

  function getSessionStorage() {
    try {
      return root.sessionStorage;
    } catch (error) {
      return null;
    }
  }

  function resolveSessionId(params) {
    const fromQuery = params.get("mp_session");
    if (fromQuery) {
      return fromQuery;
    }

    const storage = getSessionStorage();
    const stored = storage?.getItem("miniPresenter.localSessionId");
    if (stored) {
      return stored;
    }

    const generated = createSessionId();
    storage?.setItem("miniPresenter.localSessionId", generated);
    return generated;
  }

  function isExplicitLocalSession(params) {
    return params.get("mp_mode") === "local";
  }

  function waitForServerInjectionMarker() {
    if (root.__miniPresenterDisplayInjected === true) {
      return Promise.resolve();
    }

    if (document.readyState === "loading") {
      return new Promise((resolve) => {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            resolve();
          },
          { once: true }
        );
      });
    }

    return Promise.resolve();
  }

  async function shouldNoopBecauseMiniPresenterServer(params) {
    if (shouldSkipServerNoop) {
      return false;
    }
    if (isExplicitLocalSession(params)) {
      return false;
    }

    await waitForServerInjectionMarker();
    return root.__miniPresenterDisplayInjected === true;
  }

  function serializeForInlineScript(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  function escapeHtmlAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtmlText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function loadPresenterTemplate() {
    if (!presenterTemplatePromise) {
      presenterTemplatePromise = (async () => {
        if (typeof root.fetch !== "function") {
          throw new Error("fetch is not available in this browser");
        }
        const response = await root.fetch(assetUrls.presenterTemplate, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Failed to load presenter template (${response.status})`);
        }
        return response.text();
      })();
    }
    return presenterTemplatePromise;
  }

  function buildPresenterDocument(template, { sessionId, deckUrl }) {
    const baseTag = `<base href="${escapeHtmlAttribute(assetBaseUrl)}">`;
    const contextScript = `<script>window.__miniPresenterStandaloneContext=${serializeForInlineScript({
      sessionId,
      deckUrl,
    })};</script>`;

    if (/<head[^>]*>/i.test(template)) {
      return template.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${contextScript}`);
    }

    return `<!doctype html><html><head>${baseTag}${contextScript}</head><body>${template}</body></html>`;
  }

  function renderPresenterError(error, { sessionId, deckUrl }) {
    const safeError = escapeHtmlText(error?.message || String(error || "Unknown error"));
    const fallbackUrl = new URL(assetUrls.presenterTemplate);
    fallbackUrl.searchParams.set("mp_mode", "local");
    fallbackUrl.searchParams.set("mp_session", sessionId);
    fallbackUrl.searchParams.set("mp_deck", deckUrl);

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>mini-presenter</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; color: #1f2937; }
      code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 4px; }
      .error { color: #991b1b; }
    </style>
  </head>
  <body>
    <h1>Unable to load presenter shell</h1>
    <p class="error">${safeError}</p>
    <p>Try opening this fallback URL directly:</p>
    <p><a href="${escapeHtmlAttribute(fallbackUrl.toString())}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(
      fallbackUrl.toString()
    )}</a></p>
  </body>
</html>`;
  }

  function writePopupDocument(popup, html) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  function parseWindowDimension(features, key, fallback) {
    if (!features || typeof features !== "string") {
      return fallback;
    }
    const pattern = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*(\\d+)`, "i");
    const match = features.match(pattern);
    if (!match) {
      return fallback;
    }
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function tryNormalizePopupSize(popup, features) {
    if (!popup || popup.closed) {
      return;
    }

    const width = parseWindowDimension(features, "width", 1000);
    const height = parseWindowDimension(features, "height", 700);

    try {
      if (typeof popup.resizeTo === "function") {
        popup.resizeTo(width, height);
      }
    } catch (error) {
      // ignore window manager restrictions
    }
  }

  function openPresenterWindow({ sessionId, deckUrl, windowName = "miniPresenterView", features = "width=1000,height=700" } = {}) {
    const resolvedSessionId =
      typeof sessionId === "string" && sessionId ? sessionId : createSessionId();
    const resolvedDeckUrl =
      typeof deckUrl === "string" && deckUrl ? deckUrl : cleanDeckUrl();

    const popup = root.open("about:blank", windowName, features);
    if (!popup) {
      return null;
    }

    tryNormalizePopupSize(popup, features);

    writePopupDocument(
      popup,
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>mini-presenter</title></head><body style=\"font-family:sans-serif;padding:1rem\">Loading presenter…</body></html>"
    );

    loadPresenterTemplate()
      .then((template) => {
        const html = buildPresenterDocument(template, {
          sessionId: resolvedSessionId,
          deckUrl: resolvedDeckUrl,
        });
        writePopupDocument(popup, html);
      })
      .catch((error) => {
        writePopupDocument(
          popup,
          renderPresenterError(error, {
            sessionId: resolvedSessionId,
            deckUrl: resolvedDeckUrl,
          })
        );
      });

    return popup;
  }

  root.miniPresenterStandalone = {
    ...(root.miniPresenterStandalone ?? {}),
    openPresenterWindow,
    getAssetBaseUrl: () => assetBaseUrl,
    getAssetUrls: () => ({ ...assetUrls }),
  };

  async function bootstrap() {
    const params = new URLSearchParams(root.location.search);
    if (await shouldNoopBecauseMiniPresenterServer(params)) {
      root.__miniPresenterStandaloneNoop = true;
      return;
    }

    await loadScript(assetUrls.runtime);

    const runtime = root.miniPresenterRuntime;
    const sessionId = resolveSessionId(params);
    const deckUrl = params.get("mp_deck") || cleanDeckUrl();

    runtime?.setRuntime?.({
      mode: "local",
      routes: {
        presenter: assetUrls.presenterTemplate,
      },
      capabilities: {
        questions: false,
        export: false,
        recordingPersistence: false,
        configSave: false,
      },
      local: {
        sessionId,
        deckUrl,
      },
    });

    await loadScript(assetUrls.transport);
    await loadScript(assetUrls.injected);
  }

  bootstrap().catch((error) => {
    console.error(error);
  });
})(typeof window !== "undefined" ? window : globalThis);
