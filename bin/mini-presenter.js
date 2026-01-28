#!/usr/bin/env node
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import qrcode from "qrcode-terminal";
import { exportPresentation } from "../src/export.js";
import { startServer } from "../src/server.js";

import fs from "node:fs";

const args = process.argv.slice(2);
const command = args[0] === "export" ? "export" : "serve";

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

function printHelp() {
  console.log(`mini-presenter ${pkg.version}

Lightweight presentation helper with presenter view

Usage:
  mini-presenter [options] <path>
  mini-presenter export [options] <path>

Commands:
  (default)   Start the presentation server
  export      Export slides to PDF or PNG

Server options:
  -p, --port <port>   Port to listen on (default: 8080)
  -w, --watch         Watch for file changes and auto-reload
  --funnel            Create a cloudflare tunnel for remote access

Export options:
  -o, --output <path>      Output file (PDF) or directory (PNG) [required]
  --format <pdf|png>       Output format (default: pdf)
  --delay <ms>             Delay between slides in ms (default: 300)
  --chrome-port <port>     Chrome DevTools port (default: 9222)
  --port <port>            Local server port (default: random)

General options:
  -h, --help          Show this help message
  -V, --version       Show version number

Examples:
  mini-presenter ./slides
  mini-presenter ./slides --port 3000 --watch
  mini-presenter export ./slides -o presentation.pdf
  mini-presenter export ./slides -o ./images --format png
`);
}

function printVersion() {
  console.log(pkg.version);
}

function usage() {
  console.log(
    "Usage:\n" +
      "  mini-presenter <path> [--port <port>] [--watch] [--funnel]\n" +
      "  mini-presenter export <path> --output <file|dir> [--format pdf|png] [--delay <ms>] [--chrome-port <port>]\n\n" +
      "Run 'mini-presenter --help' for more information."
  );
}

function generatePresenterKey() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function buildPresenterUrl(baseUrl, { presenterKey, includeKey = false } = {}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = new URL(`${normalizedBase}/_/presenter`);
  if (includeKey && presenterKey) {
    url.searchParams.set("key", presenterKey);
  }
  return url.toString();
}

function buildUrlBlock(label, baseUrl, { presenterKey, includeKey = false } = {}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const slidesUrl = `${normalizedBase}/`;
  const presenterUrl = buildPresenterUrl(normalizedBase, {
    presenterKey,
    includeKey,
  });
  return `${label}:\n  slides ${slidesUrl}\n  presenter ${presenterUrl}`;
}

function printPresenterQr(url) {
  console.log("Presenter QR code:");
  qrcode.generate(url, { small: true });
}

function startFunnel({ port, presenterKey }) {
  console.log("Connecting tunnel...");
  const child = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let printedUrl = false;
  const urlPattern = /https?:\/\/[^\s]+\.trycloudflare\.com/iu;

  const handleLine = (line) => {
    const match = line.match(urlPattern);
    if (match && !printedUrl) {
      printedUrl = true;
      console.log(
        buildUrlBlock("remote", match[0], {
          presenterKey,
          includeKey: true,
        })
      );
      const presenterUrl = buildPresenterUrl(match[0], {
        presenterKey,
        includeKey: true,
      });
      printPresenterQr(presenterUrl);
    }
  };

  readline
    .createInterface({ input: child.stdout })
    .on("line", (line) => handleLine(line));
  readline
    .createInterface({ input: child.stderr })
    .on("line", (line) => handleLine(line));

  child.on("error", (error) => {
    console.error(`Failed to start cloudflared: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`cloudflared tunnel exited with signal ${signal}`);
      return;
    }
    if (code !== 0) {
      console.error(`cloudflared tunnel exited with code ${code}`);
    }
  });

  return child;
}

async function runServeCommand() {
  let port = 8080;
  let targetPath = null;
  let watch = false;
  let funnel = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      const value = args[i + 1];
      if (!value) {
        console.error("Missing port value after --port");
        process.exit(1);
      }
      port = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (arg === "--watch" || arg === "-w") {
      watch = true;
      continue;
    }
    if (arg === "--funnel") {
      funnel = true;
      continue;
    }
    if (!targetPath) {
      targetPath = arg;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  if (!targetPath) {
    usage();
    process.exit(1);
  }

  const rootDir = path.resolve(process.cwd(), targetPath);
  const presenterKey = generatePresenterKey();

  const server = await startServer({
    rootDir,
    port,
    watch,
    quiet: true,
    presenterKey,
  });

  console.log(`Presenter code: ${presenterKey}`);
  console.log(
    buildUrlBlock("local", `http://localhost:${port}`, {
      presenterKey,
      includeKey: false,
    })
  );

  let funnelProcess = null;
  if (funnel) {
    funnelProcess = startFunnel({ port, presenterKey });
  }

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    if (funnelProcess) {
      funnelProcess.kill("SIGINT");
      funnelProcess = null;
    }
    const forceExitTimer = setTimeout(() => {
      process.exit(0);
    }, 1500);
    server.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runExportCommand() {
  const exportArgs = args.slice(1);
  let targetPath = null;
  let outputPath = null;
  let format = "pdf";
  let delay = 300;
  let chromePort = 9222;
  let port = 0;

  for (let i = 0; i < exportArgs.length; i += 1) {
    const arg = exportArgs[i];
    if (arg === "--output" || arg === "-o") {
      outputPath = exportArgs[i + 1];
      if (!outputPath) {
        console.error("Missing value after --output");
        process.exit(1);
      }
      i += 1;
      continue;
    }
    if (arg === "--format") {
      format = exportArgs[i + 1] || format;
      i += 1;
      continue;
    }
    if (arg === "--delay") {
      const value = exportArgs[i + 1];
      if (!value) {
        console.error("Missing value after --delay");
        process.exit(1);
      }
      delay = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (arg === "--chrome-port") {
      const value = exportArgs[i + 1];
      if (!value) {
        console.error("Missing value after --chrome-port");
        process.exit(1);
      }
      chromePort = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (arg === "--port") {
      const value = exportArgs[i + 1];
      if (!value) {
        console.error("Missing value after --port");
        process.exit(1);
      }
      port = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (!targetPath) {
      targetPath = arg;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  if (!targetPath || !outputPath) {
    usage();
    process.exit(1);
  }

  format = format.toLowerCase();
  if (!["pdf", "png"].includes(format)) {
    console.error(`Unsupported format: ${format}`);
    process.exit(1);
  }

  const rootDir = path.resolve(process.cwd(), targetPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (format === "png" && resolvedOutput.endsWith(".png")) {
    console.error("For --format png, --output must be a directory");
    process.exit(1);
  }

  console.log("Exporting slides...");
  try {
    await exportPresentation({
      rootDir,
      outputPath: resolvedOutput,
      delay,
      format,
      chromePort,
      port,
    });
  } catch (error) {
    console.error(`Export failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Export completed: ${resolvedOutput}`);
}

// Handle global flags
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-V")) {
  printVersion();
  process.exit(0);
}

if (command === "export") {
  await runExportCommand();
} else {
  await runServeCommand();
}
