// Minimal Chrome DevTools Protocol client on top of Node's built-in WebSocket.

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

type EventHandler = (params: Record<string, unknown>, sessionId: string | null) => void;

export class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<EventHandler>>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
    socket.addEventListener("close", () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("CDP connection closed"));
        this.pending.delete(id);
      }
    });
  }

  static async connect(port: number, timeoutMs = 5000): Promise<CdpClient> {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { webSocketDebuggerUrl } = (await response.json()) as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Chrome"));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to connect to Chrome"));
      });
    });
    return new CdpClient(socket);
  }

  private onMessage(raw: string): void {
    let message: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }
    if (message.method) {
      for (const handler of this.handlers.get(message.method) ?? []) {
        handler(message.params ?? {}, message.sessionId ?? null);
      }
    }
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    { sessionId, timeoutMs = 30_000 }: { sessionId?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  waitForEvent(method: string, sessionId: string | null, timeoutMs = 15_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const handlers = this.handlers.get(method) ?? new Set();
      this.handlers.set(method, handlers);
      const timer = setTimeout(() => {
        handlers.delete(handler);
        reject(new Error(`CDP timeout waiting for ${method}`));
      }, timeoutMs);
      const handler: EventHandler = (params, eventSession) => {
        if (sessionId && eventSession !== sessionId) {
          return;
        }
        clearTimeout(timer);
        handlers.delete(handler);
        resolve(params);
      };
      handlers.add(handler);
    });
  }

  close(): void {
    this.socket.close();
  }
}

/** A page target attached in flat session mode. */
export class CdpPage {
  readonly client: CdpClient;
  readonly sessionId: string;
  readonly targetId: string;

  constructor(client: CdpClient, targetId: string, sessionId: string) {
    this.client = client;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  static async create(client: CdpClient): Promise<CdpPage> {
    const { targetId } = await client.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await client.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    return new CdpPage(client, targetId, sessionId);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    return this.client.send<T>(method, params, { sessionId: this.sessionId, ...(timeoutMs ? { timeoutMs } : {}) });
  }

  /** Evaluates `fn(arg)` in the page and returns its JSON result. */
  async evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const result = await this.send<{ result?: { value?: R }; exceptionDetails?: { text: string } }>("Runtime.evaluate", {
      expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Page evaluation failed: ${result.exceptionDetails.text}`);
    }
    return result.result?.value as R;
  }

  async close(): Promise<void> {
    await this.client.send("Target.closeTarget", { targetId: this.targetId }).catch(() => undefined);
  }
}
