#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { startServer } from "../src/server.js";

const args = process.argv.slice(2);

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
  console.log(
    "Usage: mini-presenter <path> [--port <port>] [--watch] [--funnel]"
  );
  process.exit(1);
}

const rootDir = path.resolve(process.cwd(), targetPath);

function buildUrlBlock(label, baseUrl) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const slidesUrl = `${normalizedBase}/`;
  const presenterUrl = `${normalizedBase}/_/presenter`;
  return `${label}:\n  slides ${slidesUrl}\n  presenter ${presenterUrl}`;
}

function startFunnel({ port }) {
  console.log("Connecting tunnel...");
  const child = spawn(
    "cloudflared",
    [
      "tunnel",
      "--url",
      `http://localhost:${port}`,
      "--no-autoupdate",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let printedUrl = false;
  const urlPattern = /https?:\/\/[^\s]+\.trycloudflare\.com/iu;

  const handleLine = (line) => {
    const match = line.match(urlPattern);
    if (match && !printedUrl) {
      printedUrl = true;
      console.log(buildUrlBlock("remote", match[0]));
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

const server = await startServer({ rootDir, port, watch, quiet: true });

console.log(buildUrlBlock("local", `http://localhost:${port}`));

let funnelProcess = null;
if (funnel) {
  funnelProcess = startFunnel({ port });
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
