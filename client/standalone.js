(function initMiniPresenterStandalone(globalScope) {
  const root = globalScope || (typeof window !== "undefined" ? window : globalThis);

  if (root.__miniPresenterStandaloneBooted) {
    return;
  }
  root.__miniPresenterStandaloneBooted = true;

  const currentScript = document.currentScript;
  const scriptDataset = currentScript?.dataset ?? {};

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

  async function bootstrap() {
    const baseUrl = resolveScriptBaseUrl();
    const runtimeUrl = withDefault(scriptDataset.runtime, new URL("runtime.js", baseUrl).toString());
    const transportUrl = withDefault(scriptDataset.transport, new URL("transport.js", baseUrl).toString());
    const injectedUrl = withDefault(scriptDataset.injected, new URL("injected.js", baseUrl).toString());
    const presenterUrl = withDefault(
      scriptDataset.presenter,
      new URL("presenter-standalone.html", baseUrl).toString()
    );

    await loadScript(runtimeUrl);

    const params = new URLSearchParams(root.location.search);
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
