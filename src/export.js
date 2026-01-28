import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { connectToChrome } from "./cdp.js";
import { startChrome } from "./chrome.js";
import { startServer } from "./server.js";

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
const MAX_STALLED_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForSlideChange(getSlideInfo, previousId, timeout = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { slideId } = await getSlideInfo();
    if (slideId !== previousId) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function waitForSlideId(getSlideInfo, targetId, timeout = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { slideId } = await getSlideInfo();
    if (slideId === targetId) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function ensurePresentationReady(cdp, sessionId) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const ready = await cdp.send(
      "Runtime.evaluate",
      {
        expression: "document.readyState",
        returnByValue: true,
      },
      sessionId
    );
    if (ready.result?.value === "complete") {
      return;
    }
    await sleep(100);
  }
}

async function getSlideInfo(cdp, sessionId) {
  return cdp.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const api = window.miniPresenter;
        let slideId = null;
        if (api && typeof api.getCurrentSlide === "function") {
          try {
            slideId = api.getCurrentSlide();
          } catch {
            slideId = null;
          }
        }
        const hash = location.hash || "#";
        return {
          slideId: slideId || hash,
          hash,
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
    30000
  ).then((result) => result.result?.value);
}

async function getSlideList(cdp, sessionId) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const api = window.miniPresenter;
        if (api && typeof api.getSlideList === "function") {
          try {
            const list = api.getSlideList();
            return Array.isArray(list) ? list : null;
          } catch {
            return null;
          }
        }
        return null;
      })()`,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
    30000
  );
  return result.result?.value;
}

async function navigateSlide(cdp, sessionId, action) {
  await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(action => {
        const api = window.miniPresenter;
        if (api && typeof api[action] === "function") {
          api[action]();
          return "api";
        }
        const keyMap = { next: "ArrowRight", prev: "ArrowLeft", first: "Home", last: "End" };
        const key = keyMap[action] || action;
        const target = document.body || document.documentElement || document;
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        return "key";
      })(${JSON.stringify(action)})`,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
    30000
  );
}

async function gotoSlide(cdp, sessionId, slideId) {
  await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(hash => {
        const api = window.miniPresenter;
        if (api && typeof api.goto === "function") {
          api.goto(hash);
          return;
        }
        if (hash) {
          location.hash = hash;
        } else {
          location.hash = "#";
        }
      })(${JSON.stringify(slideId)})`,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
    30000
  );
}

async function captureSlides({
  cdp,
  sessionId,
  delay,
  format,
  outputPath,
}) {
  const slideList = await getSlideList(cdp, sessionId);
  const buffers = [];
  const getInfo = () => getSlideInfo(cdp, sessionId);

  if (slideList && slideList.length > 0) {
    for (let index = 0; index < slideList.length; index += 1) {
      const slideId = slideList[index];
      await gotoSlide(cdp, sessionId, slideId);
      await waitForSlideId(getInfo, slideId, 4000);
      await sleep(delay);
      const { data } = await cdp.send(
        "Page.captureScreenshot",
        { format: "png", fromSurface: true },
        sessionId,
        10000
      );
      buffers.push(Buffer.from(data, "base64"));
    }
  } else {
    const seen = new Set();
    let stalled = 0;
    await navigateSlide(cdp, sessionId, "first");
    const initial = await getInfo();
    await waitForSlideChange(getInfo, initial.slideId, 1500);

    while (stalled < MAX_STALLED_ATTEMPTS) {
      const { slideId } = await getInfo();
      if (seen.has(slideId)) {
        break;
      }
      seen.add(slideId);
      await sleep(delay);
      const { data } = await cdp.send(
        "Page.captureScreenshot",
        { format: "png", fromSurface: true },
        sessionId,
        10000
      );
      buffers.push(Buffer.from(data, "base64"));
      await navigateSlide(cdp, sessionId, "next");
      const changed = await waitForSlideChange(getInfo, slideId, 2000);
      if (!changed) {
        stalled += 1;
      } else {
        stalled = 0;
      }
    }
  }

  if (format === "png") {
    await ensureDir(outputPath);
    const total = buffers.length;
    const digits = Math.max(2, String(total).length);
    for (let i = 0; i < buffers.length; i += 1) {
      const fileName = `${String(i + 1).padStart(digits, "0")}.png`;
      await fs.writeFile(path.join(outputPath, fileName), buffers[i]);
    }
    return;
  }

  await ensureDir(path.dirname(outputPath));
  const pdfDoc = await PDFDocument.create();
  for (const buffer of buffers) {
    const image = await pdfDoc.embedPng(buffer);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
}

export async function exportPresentation({
  rootDir,
  rootUrl,
  outputPath,
  delay = 300,
  format = "pdf",
  chromePort = 9222,
  viewport = DEFAULT_VIEWPORT,
  port = 0,
}) {
  const server = await startServer({
    rootDir,
    rootUrl,
    port,
    watch: false,
    quiet: true,
    presenterKey: null,
  });

  const address = server.address();
  const serverPort = typeof address === "object" && address ? address.port : port;
  const baseUrl = `http://localhost:${serverPort}/`;

  let cdp;
  let sessionId;
  let targetId;
  let chromeProcess;

  try {
    try {
      cdp = await connectToChrome({ port: chromePort });
    } catch (error) {
      chromeProcess = await startChrome({ port: chromePort });
      cdp = await connectToChrome({ port: chromePort, timeout: 10000 });
    }

    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    targetId = target.targetId;
    sessionId = await cdp.send(
      "Target.attachToTarget",
      { targetId, flatten: true },
      null,
      10000
    ).then((result) => result.sessionId);

    await cdp.send("Page.enable", {}, sessionId, 10000);
    await cdp.send("Runtime.enable", {}, sessionId, 10000);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId, 10000);

    await cdp.send("Page.navigate", { url: baseUrl }, sessionId, 30000);
    await cdp.waitForEvent("Page.loadEventFired", sessionId, 15000);
    await ensurePresentationReady(cdp, sessionId);

    await captureSlides({ cdp, sessionId, delay, format, outputPath });
  } finally {
    if (cdp && targetId) {
      try {
        await cdp.send("Target.closeTarget", { targetId });
      } catch {
        // Ignore cleanup errors.
      }
    }
    if (cdp) {
      cdp.close();
    }
    if (chromeProcess) {
      chromeProcess.kill("SIGTERM");
    }
    server.close();
  }
}
