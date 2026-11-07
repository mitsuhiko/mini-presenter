import { createRequire } from "node:module";

interface QRCodeModel {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  modules: boolean[][];
}

type QRCodeConstructor = new (typeNumber: number, errorCorrectLevel: number) => QRCodeModel;

let qrModules: { QRCode: QRCodeConstructor; levels: { L: number; M: number } } | null = null;

function loadQrModules() {
  if (!qrModules) {
    const require = createRequire(import.meta.url);
    qrModules = {
      QRCode: require("qrcode-terminal/vendor/QRCode") as QRCodeConstructor,
      levels: require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel") as { L: number; M: number },
    };
  }
  return qrModules;
}

/** Renders a QR code as a compact SVG (one path, crisp edges). */
export function renderQrSvg(content: string, { margin = 2 } = {}): string {
  const { QRCode, levels } = loadQrModules();
  const qr = new QRCode(-1, levels.M);
  qr.addData(content);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + margin * 2;
  let pathData = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.modules[row]?.[col]) {
        pathData += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${pathData}"/></svg>`
  );
}
