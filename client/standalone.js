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

  function scriptAlreadyLoaded(url) {
    return Array.from(document.querySelectorAll("script[src]"))
      .some((entry) => entry.src === url);
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

  function buildServerConfigUrl() {
    if (scriptDataset.config && typeof scriptDataset.config === "string") {
      return new URL(scriptDataset.config, root.location.href).toString();
    }
    const base =
      typeof root.location.origin === "string" && root.location.origin !== "null"
        ? root.location.origin
        : root.location.href;
    return new URL("/_/api/config", base).toString();
  }

  function looksLikeMiniPresenterConfig(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    const runtime = payload._runtime;
    if (!runtime || typeof runtime !== "object") {
      return false;
    }
    if (runtime.mode !== "server") {
      return false;
    }
    return (
      typeof payload.sessionId === "string" &&
      payload.sessionId.length > 0 &&
      typeof runtime.routes?.ws === "string" &&
      typeof runtime.routes?.presenter === "string"
    );
  }

  async function shouldNoopBecauseMiniPresenterServer(params) {
    if (shouldSkipServerNoop) {
      return false;
    }
    if (isExplicitLocalSession(params)) {
      return false;
    }
    if (root.__miniPresenterDisplayInjected === true) {
      return true;
    }
    if (typeof root.fetch !== "function") {
      return false;
    }

    const configUrl = buildServerConfigUrl();
    const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeout = null;
    if (abortController) {
      timeout = setTimeout(() => {
        abortController.abort();
      }, 750);
    }

    try {
      const response = await root.fetch(configUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: abortController?.signal,
      });
      if (!response.ok) {
        return false;
      }
      const payload = await response.json().catch(() => null);
      return looksLikeMiniPresenterConfig(payload);
    } catch (error) {
      return false;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async function bootstrap() {
    const params = new URLSearchParams(root.location.search);
    if (await shouldNoopBecauseMiniPresenterServer(params)) {
      root.__miniPresenterStandaloneNoop = true;
      return;
    }

    const baseUrl = resolveScriptBaseUrl();
    const runtimeUrl = withDefault(scriptDataset.runtime, new URL("runtime.js", baseUrl).toString());
    const transportUrl = withDefault(scriptDataset.transport, new URL("transport.js", baseUrl).toString());
    const injectedUrl = withDefault(scriptDataset.injected, new URL("injected.js", baseUrl).toString());
    const presenterUrl = withDefault(
      scriptDataset.presenter,
      new URL("presenter-standalone.html", baseUrl).toString()
    );

    await loadScript(runtimeUrl);

    const runtime = root.miniPresenterRuntime;
    const sessionId = resolveSessionId(params);
    const deckUrl = params.get("mp_deck") || cleanDeckUrl();

    runtime?.setRuntime?.({
      mode: "local",
      routes: {
        presenter: presenterUrl,
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

    await loadScript(transportUrl);
    await loadScript(injectedUrl);
  }

  bootstrap().catch((error) => {
    console.error(error);
  });
})(typeof window !== "undefined" ? window : globalThis);
