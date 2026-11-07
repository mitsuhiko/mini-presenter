// Exports a deck to PDF or PNG by stepping through it in headless Chrome.

import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { startServer } from "../server/index.ts";
import { CdpClient, CdpPage } from "./cdp.ts";
import { launchChrome, type ChromeInstance } from "./chrome.ts";

export interface ExportOptions {
  rootDir?: string | null;
  rootUrl?: string | null;
  outputPath: string;
  format?: "pdf" | "png";
  /** Delay before each capture, in ms. */
  delay?: number;
  /** Connect to an already running Chrome instead of launching one. */
  chromePort?: number | null;
  viewport?: { width: number; height: number };
  /** Port for the temporary deck server (0 picks a free one). */
  port?: number;
  onProgress?: (count: number, slideId: string) => void;
}

const PRINT_DPI = 96;
const STALL_LIMIT = 3;
const STEP_GUARD = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The functions below are serialized and evaluated inside the page, so they
// must be self-contained.
interface PageGlobals {
  miniPresenter?: Record<string, unknown>;
  location: { hash: string };
  document: {
    readyState: string;
    fonts?: { ready: Promise<unknown> };
    body: { dispatchEvent(event: unknown): boolean } | null;
    documentElement: { dispatchEvent(event: unknown): boolean };
    head: { appendChild(node: unknown): void };
    createElement(tag: string): { textContent: string };
  };
  KeyboardEvent: new (type: string, init: Record<string, unknown>) => unknown;
}

function pageCurrentSlide(): string {
  const w = globalThis as unknown as PageGlobals;
  const api = w.miniPresenter;
  let id: unknown = null;
  try {
    id = typeof api?.getCurrentSlide === "function" ? (api.getCurrentSlide as () => unknown)() : null;
  } catch {
    id = null;
  }
  return (typeof id === "string" && id) || w.location.hash || "#";
}

function pageSlideList(): string[] | null {
  const w = globalThis as unknown as PageGlobals;
  try {
    const list = typeof w.miniPresenter?.getSlideList === "function" ? (w.miniPresenter.getSlideList as () => unknown)() : null;
    return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : null;
  } catch {
    return null;
  }
}

function pageNavigate(action: string): void {
  const w = globalThis as unknown as PageGlobals;
  const fn = w.miniPresenter?.[action];
  if (typeof fn === "function") {
    (fn as () => void).call(w.miniPresenter);
    return;
  }
  const keys: Record<string, string> = { next: "ArrowRight", prev: "ArrowLeft", first: "Home", last: "End" };
  const target = w.document.body ?? w.document.documentElement;
  target.dispatchEvent(new w.KeyboardEvent("keydown", { key: keys[action] ?? action, bubbles: true }));
}

function pageGoto(hash: string): void {
  const w = globalThis as unknown as PageGlobals;
  const fn = w.miniPresenter?.goto;
  if (typeof fn === "function") {
    (fn as (hash: string) => void).call(w.miniPresenter, hash);
  } else {
    w.location.hash = hash || "#";
  }
}

async function pageReady(): Promise<boolean> {
  const w = globalThis as unknown as PageGlobals;
  if (w.document.readyState !== "complete") {
    return false;
  }
  await w.document.fonts?.ready;
  return true;
}

function pageInstallPrintStyle(css: string): void {
  const w = globalThis as unknown as PageGlobals;
  const style = w.document.createElement("style");
  style.textContent = css;
  w.document.head.appendChild(style);
}

class SlideDriver {
  readonly page: CdpPage;

  constructor(page: CdpPage) {
    this.page = page;
  }

  current(): Promise<string> {
    return this.page.evaluate(pageCurrentSlide);
  }

  slideList(): Promise<string[] | null> {
    return this.page.evaluate(pageSlideList);
  }

  navigate(action: "next" | "prev" | "first" | "last"): Promise<void> {
    return this.page.evaluate(pageNavigate, action);
  }

  goto(hash: string): Promise<void> {
    return this.page.evaluate(pageGoto, hash);
  }

  /** Polls until the current slide satisfies `predicate`. */
  async waitFor(predicate: (slideId: string) => boolean, timeoutMs = 2000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    do {
      const slideId = await this.current();
      if (predicate(slideId)) {
        return slideId;
      }
      await sleep(80);
    } while (Date.now() < deadline);
    return null;
  }

  /** Advances one step; returns the new slide id or `null` if nothing changed. */
  async step(action: "next" | "prev", from: string): Promise<string | null> {
    await this.navigate(action);
    return this.waitFor((slideId) => slideId !== from);
  }
}

async function captureAll(driver: SlideDriver, capture: (slideId: string) => Promise<void>): Promise<void> {
  const slideList = await driver.slideList();

  if (slideList && slideList.length > 0) {
    // With build steps encoded in the list (`#3.1`) every entry is a state.
    // Otherwise advance through each slide's builds and capture the last one.
    const hasSteps = slideList.some((slideId) => slideId.includes("."));
    for (let index = 0; index < slideList.length; index += 1) {
      const slideId = slideList[index]!;
      const nextId = slideList[index + 1] ?? null;
      await driver.goto(slideId);
      let current = (await driver.waitFor((id) => id === slideId, 4000)) ?? (await driver.current());
      if (!hasSteps) {
        let stalled = 0;
        for (let guard = 0; guard < STEP_GUARD && stalled < (nextId ? 1 : STALL_LIMIT); guard += 1) {
          const next = await driver.step("next", current);
          if (!next) {
            stalled += 1;
            continue;
          }
          if (next === nextId) {
            current = (await driver.step("prev", next)) ?? current;
            break;
          }
          current = next;
        }
      }
      await capture(current);
    }
    return;
  }

  // No slide list: walk forward until the slide stops changing or repeats.
  await driver.navigate("first");
  await sleep(300);
  const seen = new Set<string>();
  let stalled = 0;
  let current = await driver.current();
  while (stalled < STALL_LIMIT && seen.size < 1000) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    await capture(current);
    const next = await driver.step("next", current);
    if (next) {
      current = next;
      stalled = 0;
    } else {
      stalled += 1;
    }
  }
}

export async function exportPresentation(options: ExportOptions): Promise<number> {
  const format = options.format ?? "pdf";
  const delay = options.delay ?? 300;
  const viewport = options.viewport ?? { width: 1920, height: 1080 };

  const deckServer = await startServer({
    rootDir: options.rootDir ?? null,
    rootUrl: options.rootUrl ?? null,
    port: options.port ?? 0,
    host: "127.0.0.1",
  });

  let chrome: ChromeInstance | null = null;
  let client: CdpClient | null = null;
  let page: CdpPage | null = null;

  try {
    if (options.chromePort) {
      client = await CdpClient.connect(options.chromePort);
    } else {
      chrome = await launchChrome();
      client = await CdpClient.connect(chrome.port, 10_000);
    }
    page = await CdpPage.create(client);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Emulation.setEmulatedMedia", { media: "screen" });

    const loaded = client.waitForEvent("Page.loadEventFired", page.sessionId, 30_000);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${deckServer.port}/` });
    await loaded;
    const readyDeadline = Date.now() + 10_000;
    while (!(await page.evaluate(pageReady)) && Date.now() < readyDeadline) {
      await sleep(100);
    }

    const paperWidth = viewport.width / PRINT_DPI;
    const paperHeight = viewport.height / PRINT_DPI;
    if (format === "pdf") {
      await page.evaluate(
        pageInstallPrintStyle,
        `@page { size: ${paperWidth}in ${paperHeight}in; margin: 0; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
      );
    }

    const captures: Buffer[] = [];
    const activePage = page;
    await captureAll(new SlideDriver(page), async (slideId) => {
      await sleep(delay);
      if (format === "pdf") {
        const { data } = await activePage.send<{ data: string }>(
          "Page.printToPDF",
          {
            printBackground: true,
            preferCSSPageSize: true,
            paperWidth,
            paperHeight,
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
          },
          60_000,
        );
        captures.push(Buffer.from(data, "base64"));
      } else {
        const { data } = await activePage.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
        captures.push(Buffer.from(data, "base64"));
      }
      options.onProgress?.(captures.length, slideId);
    });

    if (captures.length === 0) {
      throw new Error("No slides were captured");
    }

    if (format === "png") {
      await fs.mkdir(options.outputPath, { recursive: true });
      const digits = Math.max(2, String(captures.length).length);
      await Promise.all(
        captures.map((buffer, index) =>
          fs.writeFile(path.join(options.outputPath, `${String(index + 1).padStart(digits, "0")}.png`), buffer),
        ),
      );
    } else {
      const merged = await PDFDocument.create();
      for (const buffer of captures) {
        const source = await PDFDocument.load(buffer);
        // Each print may spill onto extra pages; keep only the first.
        const [first] = await merged.copyPages(source, [0]);
        merged.addPage(first);
      }
      await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
      await fs.writeFile(options.outputPath, await merged.save());
    }
    return captures.length;
  } finally {
    await page?.close();
    client?.close();
    await chrome?.close();
    await deckServer.close();
  }
}
