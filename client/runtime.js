(function initMiniPresenterRuntime(globalScope) {
  const root = globalScope || (typeof window !== "undefined" ? window : globalThis);

  const DEFAULT_RUNTIME = {
    mode: "server",
    routes: {
      ws: "/_/ws",
      presenter: "/_/presenter",
      questions: "/_/questions",
      questionsQr: "/_/questions/qr",
      api: {
        config: "/_/api/config",
        notes: "/_/api/notes",
        export: "/_/api/export",
        recording: "/_/api/recording",
        recordingAudio: "/_/api/recording/audio",
        questions: "/_/api/questions",
        questionsVote: "/_/api/questions/vote",
        questionsDelete: "/_/api/questions/delete",
        questionsAnswer: "/_/api/questions/answer",
        questionsQr: "/_/api/questions/qr",
      },
    },
    capabilities: {
      questions: true,
      export: true,
      recordingPersistence: true,
      configSave: true,
    },
  };

  const namespace = root.miniPresenterRuntime || {};

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeObjects(base, override) {
    const result = isPlainObject(base) ? { ...base } : {};
    if (!isPlainObject(override)) {
      return result;
    }

    Object.entries(override).forEach(([key, value]) => {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = mergeObjects(result[key], value);
      } else if (Array.isArray(value)) {
        result[key] = value.slice();
      } else {
        result[key] = value;
      }
    });

    return result;
  }

  function normalizeRuntime(value) {
    const merged = mergeObjects(DEFAULT_RUNTIME, value);

    if (typeof merged.mode !== "string" || !merged.mode.trim()) {
      merged.mode = DEFAULT_RUNTIME.mode;
    }

    if (!isPlainObject(merged.routes)) {
      merged.routes = clone(DEFAULT_RUNTIME.routes);
    }
    if (!isPlainObject(merged.routes.api)) {
      merged.routes.api = clone(DEFAULT_RUNTIME.routes.api);
    }

    if (!isPlainObject(merged.capabilities)) {
      merged.capabilities = clone(DEFAULT_RUNTIME.capabilities);
    }

    return merged;
  }

  let currentRuntime = normalizeRuntime(namespace.getRuntime?.() ?? null);

  function setRuntime(runtime) {
    currentRuntime = normalizeRuntime(mergeObjects(currentRuntime, runtime));
    return getRuntime();
  }

  function applyConfig(config) {
    if (!isPlainObject(config)) {
      return getRuntime();
    }
    const configRuntime = isPlainObject(config._runtime)
      ? config._runtime
      : isPlainObject(config.runtime)
        ? config.runtime
        : null;

    if (!configRuntime) {
      return getRuntime();
    }

    currentRuntime = normalizeRuntime(configRuntime);
    return getRuntime();
  }

  function getRuntime() {
    return clone(currentRuntime);
  }

  function getMode() {
    return currentRuntime.mode;
  }

  function hasCapability(name) {
    if (!name) {
      return false;
    }
    return currentRuntime.capabilities?.[name] !== false;
  }

  function getRoute(name) {
    return currentRuntime.routes?.[name] ?? null;
  }

  function getApiRoute(name) {
    return currentRuntime.routes?.api?.[name] ?? null;
  }

  function toAbsoluteUrl(path, origin) {
    if (!path || typeof path !== "string") {
      return null;
    }
    const baseOrigin =
      typeof origin === "string" && origin.trim()
        ? origin
        : root.location?.origin ?? "http://localhost";
    return new URL(path, baseOrigin).toString();
  }

  function getUrl(name, origin) {
    const route = getRoute(name);
    return toAbsoluteUrl(route, origin);
  }

  function getApiUrl(name, origin) {
    const route = getApiRoute(name);
    return toAbsoluteUrl(route, origin);
  }

  function getWebSocketUrl(locationObject) {
    const locationRef = locationObject || root.location;
    if (!locationRef) {
      return null;
    }
    const route = getRoute("ws") || DEFAULT_RUNTIME.routes.ws;
    const protocol = locationRef.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${locationRef.host}${route}`;
  }

  root.miniPresenterRuntime = {
    ...namespace,
    setRuntime,
    applyConfig,
    getRuntime,
    getMode,
    hasCapability,
    getRoute,
    getApiRoute,
    getUrl,
    getApiUrl,
    getWebSocketUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
