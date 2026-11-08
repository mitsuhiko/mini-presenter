import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { findChrome } from "../src/export/chrome.ts";
import { exportPresentation } from "../src/export/export.ts";

let chromeAvailable = false;
try {
  findChrome();
  chromeAvailable = true;
} catch {
  // Browser integration tests are optional on machines without Chrome.
}

test("PDF preserves viewport-centered slides without shrinking or clipping", {
  skip: !chromeAvailable && "Chrome not installed",
  timeout: 30_000,
}, async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-presenter-export-test-"));
  try {
    await fs.writeFile(path.join(rootDir, "index.html"), `<!doctype html>
<html><head><style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
.deck { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px;
  transform: translate(-50%, -50%); }
a { position: absolute; display: block; width: 40px; height: 40px; }
.first { left: 10px; top: 10px; }
.last { right: 10px; bottom: 10px; }
</style></head><body><div class="deck">
<a class="first" href="https://example.com/first">First</a>
<a class="last" href="https://example.com/last">Last</a>
</div><script>
location.hash = "#1.0";
window.miniPresenter = {
  getSlideList: () => ["#1.0"],
  getCurrentSlide: () => "#1.0",
  goto() {},
};
</script></body></html>`);
    const outputPath = path.join(rootDir, "slides.pdf");
    assert.equal(await exportPresentation({ rootDir, outputPath, delay: 0 }), 1);
    const pdf = await PDFDocument.load(await fs.readFile(outputPath));
    assert.equal(pdf.getPageCount(), 1);
    const page = pdf.getPage(0);
    assert.deepEqual(page.getSize(), { width: 1440, height: 810 });

    // Link annotation rectangles give us the actual printed geometry without
    // rasterizing the PDF or depending on platform-specific rendering tools.
    const annotations = page.node.Annots()!;
    assert.equal(annotations.size(), 2);
    const expected = [[7.5, 772.5, 37.5, 802.5], [1402.5, 7.5, 1432.5, 37.5]];
    for (let i = 0; i < annotations.size(); i += 1) {
      const annotation = annotations.lookup(i, PDFDict);
      const rect = annotation.lookup(PDFName.of("Rect"), PDFArray);
      for (let j = 0; j < 4; j += 1) {
        assert.ok(Math.abs(rect.lookup(j, PDFNumber).asNumber() - expected[i]![j]!) < 0.1,
          `annotation ${i}, coordinate ${j}: ${rect.toString()}`);
      }
    }
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
