#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { startServer } from "../src/server.js";

const args = process.argv.slice(2);

let port = 8080;
let targetPath = null;

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
  if (!targetPath) {
    targetPath = arg;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  process.exit(1);
}

if (!targetPath) {
  console.log("Usage: mini-presenter <path> [--port <port>]");
  process.exit(1);
}

const rootDir = path.resolve(process.cwd(), targetPath);

await startServer({ rootDir, port });
