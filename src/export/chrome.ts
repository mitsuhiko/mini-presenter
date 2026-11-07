import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  win32: [
    `${process.env.PROGRAMFILES ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"],
};

function findOnPath(command: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, command);
    if (dir && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findChrome(): string {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  for (const candidate of CANDIDATES[process.platform] ?? CANDIDATES.linux!) {
    const resolved = path.isAbsolute(candidate) ? (existsSync(candidate) ? candidate : null) : findOnPath(candidate);
    if (resolved) {
      return resolved;
    }
  }
  throw new Error("Could not find Chrome. Set CHROME_PATH to a Chrome or Chromium executable.");
}

export interface ChromeInstance {
  port: number;
  close(): Promise<void>;
}

/** Launches a headless Chrome with a throwaway profile on a free debugging port. */
export async function launchChrome({ timeoutMs = 15_000 } = {}): Promise<ChromeInstance> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-presenter-chrome-"));
  const child: ChildProcess = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-search-engine-choice-screen",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const cleanup = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  };

  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      break;
    }
    try {
      const port = Number((await fs.readFile(portFile, "utf8")).split("\n")[0]);
      if (port > 0) {
        return { port, close: cleanup };
      }
    } catch {
      // not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await cleanup();
  throw new Error("Failed to start Chrome with remote debugging");
}
