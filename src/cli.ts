#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";
import qrcode from "qrcode-terminal";
import { generatePin } from "./server/auth.ts";
import { lanAddresses, startServer } from "./server/index.ts";
import { ROUTES } from "./shared/protocol.ts";

function readVersion(): string {
  for (const candidate of ["../package.json", "../../package.json"]) {
    try {
      return (JSON.parse(readFileSync(new URL(candidate, import.meta.url), "utf8")) as { version: string }).version;
    } catch {
      // try next
    }
  }
  return "unknown";
}

const VERSION = readVersion();

const HELP = `mini-presenter ${VERSION}

Lightweight presentation helper with presenter view

Usage:
  mini-presenter [options] <path|url>
  mini-presenter export [options] <path|url>

Server options:
  -p, --port <port>        Port to listen on (default: 8080)
  -H, --host <host>        Interface to bind (default: 127.0.0.1, use 0.0.0.0 for LAN access)
  -w, --watch              Watch for file changes and auto-reload
      --funnel             Create a Cloudflare tunnel for remote access (requires cloudflared)

Export options:
  -o, --output <path>      Output file (PDF) or directory (PNG) [required]
      --format <pdf|png>   Output format (default: pdf)
      --delay <ms>         Delay before capturing each slide (default: 300)
      --chrome-port <port> Use an already running Chrome with remote debugging
      --port <port>        Local server port (default: random)

General options:
  -h, --help               Show this help message
  -V, --version            Show version number

Examples:
  mini-presenter ./slides
  mini-presenter ./slides --port 3000 --watch
  mini-presenter ./slides --host 0.0.0.0
  mini-presenter export ./slides -o presentation.pdf
  mini-presenter export ./slides -o ./images --format png`;

function fail(message: string): never {
  console.error(`error: ${message}\nRun 'mini-presenter --help' for usage.`);
  process.exit(1);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail(`invalid port: ${value}`);
  }
  return port;
}

function resolveTarget(target: string): { rootDir: string } | { rootUrl: string } {
  if (/^https?:\/\//iu.test(target)) {
    return { rootUrl: target };
  }
  return { rootDir: path.resolve(process.cwd(), target) };
}

function presenterUrl(base: string, pin?: string): string {
  const url = new URL(ROUTES.presenter, base);
  if (pin) {
    url.searchParams.set("key", pin);
  }
  return url.toString();
}

function printRow(label: string, value: string): void {
  console.log(`  ${label.padEnd(10)} ${value}`);
}

function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

function printQr(url: string): void {
  qrcode.generate(url, { small: true }, (code: string) => console.log(code));
}

function startFunnel(port: number, onUrl: (url: string) => void): ChildProcess {
  console.log("Connecting tunnel…");
  const child = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let found = false;
  const handleLine = (line: string) => {
    const match = /https:\/\/[\w-]+\.trycloudflare\.com/iu.exec(line);
    if (match && !found) {
      found = true;
      onUrl(match[0]);
    }
  };
  readline.createInterface({ input: child.stdout! }).on("line", handleLine);
  readline.createInterface({ input: child.stderr! }).on("line", handleLine);
  child.on("error", (error) => console.error(`Failed to start cloudflared: ${error.message}`));
  child.on("exit", (code, signal) => {
    if (signal !== "SIGINT" && signal !== "SIGTERM" && code !== 0) {
      console.error(`cloudflared exited with ${signal ?? `code ${code}`}`);
    }
  });
  return child;
}

async function serve(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      port: { type: "string", short: "p" },
      host: { type: "string", short: "H" },
      watch: { type: "boolean", short: "w" },
      funnel: { type: "boolean" },
    },
  });
  if (positionals.length !== 1) {
    fail(positionals.length === 0 ? "missing <path|url>" : `unexpected argument: ${positionals[1]}`);
  }
  const target = resolveTarget(positionals[0]!);
  const port = parsePort(values.port, 8080);
  const host = values.host ?? "127.0.0.1";
  let watch = values.watch ?? false;
  if ("rootUrl" in target && watch) {
    console.warn("--watch is ignored for remote URLs");
    watch = false;
  }

  const pin = generatePin();
  let server;
  try {
    server = await startServer({ ...target, port, host, watch, presenterPin: pin });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    fail(code === "EADDRINUSE" ? `port ${port} is already in use (try --port)` : (error as Error).message);
  }

  console.log(`mini-presenter ${VERSION} serving ${server.source.label}\n`);
  const localBase = isWildcardHost(host) || isLoopbackHost(host) ? "localhost" : formatHost(host);
  const localUrl = `http://${localBase}:${server.port}`;
  printRow("Slides", new URL("/", localUrl).toString());
  printRow("Presenter", presenterUrl(localUrl, isLoopbackHost(localBase) ? undefined : pin));
  if (isWildcardHost(host)) {
    lanAddresses().forEach((address, index) => {
      const base = `http://${address}:${server.port}`;
      printRow(index === 0 ? "Network" : "", `${new URL("/", base)}  (presenter: ${presenterUrl(base, pin)})`);
    });
  }
  printRow("PIN", pin);
  if (isLoopbackHost(host)) {
    console.log("\n  Only reachable from this machine. Use --host 0.0.0.0 to share on the network.");
  }
  console.log("");

  let funnel: ChildProcess | null = null;
  if (values.funnel) {
    funnel = startFunnel(server.port, (url) => {
      server.setExternalUrl(url);
      printRow("Remote", `${new URL("/", url)}  (presenter: ${presenterUrl(url, pin)})`);
      console.log("Presenter QR code:");
      printQr(presenterUrl(url, pin));
    });
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    funnel?.kill("SIGTERM");
    setTimeout(() => process.exit(0), 1500).unref();
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runExport(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      format: { type: "string", default: "pdf" },
      delay: { type: "string" },
      "chrome-port": { type: "string" },
      port: { type: "string" },
    },
  });
  if (positionals.length !== 1) {
    fail(positionals.length === 0 ? "missing <path|url>" : `unexpected argument: ${positionals[1]}`);
  }
  if (!values.output) {
    fail("missing --output");
  }
  const format = values.format?.toLowerCase();
  if (format !== "pdf" && format !== "png") {
    fail(`unsupported format: ${values.format}`);
  }
  const outputPath = path.resolve(process.cwd(), values.output);
  if (format === "png" && path.extname(outputPath).toLowerCase() === ".png") {
    fail("for --format png, --output must be a directory");
  }
  const delay = values.delay === undefined ? 300 : Number(values.delay);
  if (!Number.isFinite(delay) || delay < 0) {
    fail(`invalid delay: ${values.delay}`);
  }

  const { exportPresentation } = await import("./export/export.ts");
  console.log("Exporting slides…");
  try {
    const count = await exportPresentation({
      ...resolveTarget(positionals[0]!),
      outputPath,
      format,
      delay,
      chromePort: values["chrome-port"] ? parsePort(values["chrome-port"], 0) : null,
      port: parsePort(values.port, 0),
      onProgress: (index, slideId) =>
        process.stdout.write(
          process.stdout.isTTY ? `\r  captured ${index} (${slideId})\u001b[K` : `  captured ${index} (${slideId})\n`,
        ),
    });
    if (process.stdout.isTTY) {
      process.stdout.write("\n");
    }
    console.log(`Exported ${count} slide${count === 1 ? "" : "s"} to ${outputPath}`);
  } catch (error) {
    if (process.stdout.isTTY) {
      process.stdout.write("\n");
    }
    fail(`export failed: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  if (argv.includes("-V") || argv.includes("--version")) {
    console.log(VERSION);
    return;
  }
  try {
    if (argv[0] === "export") {
      await runExport(argv.slice(1));
    } else {
      await serve(argv);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      fail((error as Error).message);
    }
    throw error;
  }
}

await main();
