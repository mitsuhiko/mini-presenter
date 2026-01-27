import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function getChromeExecutable() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  return "google-chrome";
}

async function waitForChromeReady(port, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) {
        return true;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function startChrome({ port = 9222 } = {}) {
  const chromePath = getChromeExecutable();
  const userDataDir = path.join(os.homedir(), ".cache", "mini-presenter");
  await fs.mkdir(userDataDir, { recursive: true });

  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--profile-directory=Default",
      "--disable-search-engine-choice-screen",
      "--no-first-run",
      "--disable-features=ProfilePicker",
    ],
    { stdio: "ignore" }
  );

  const ready = await waitForChromeReady(port);
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error("Failed to start Chrome with remote debugging");
  }

  return child;
}
