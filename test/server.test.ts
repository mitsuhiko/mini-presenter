// Integration tests against a real server on an ephemeral port. Requires the
// client bundle (`npm run build`, run automatically by `npm test`).

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { WebSocket } from "ws";
import { startServer, type PresenterServer } from "../src/server/index.ts";

interface Response {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: PresenterServer;
let deckDir: string;
let parentDir: string;

function request(
  pathname: string,
  { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: server.port, path: pathname, method, headers: { host: `localhost:${server.port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

/** Simulates a visitor coming in through a tunnel / from the network. */
const REMOTE = { "x-forwarded-for": "203.0.113.7" };
const JSON_HEADERS = { "content-type": "application/json" };

before(async () => {
  parentDir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-server-"));
  deckDir = path.join(parentDir, "deck");
  await fs.mkdir(path.join(deckDir, "notes"), { recursive: true });
  await fs.mkdir(path.join(parentDir, "deck-private"));
  await fs.writeFile(path.join(parentDir, "deck-private", "secret.txt"), "secret");
  await fs.writeFile(path.join(deckDir, "index.html"), "<html><body><section>1</section></body></html>");
  await fs.writeFile(path.join(deckDir, "video.bin"), "0123456789");
  await fs.writeFile(path.join(deckDir, ".env"), "TOKEN=x");
  await fs.writeFile(path.join(deckDir, "notes", "2.md"), "Notes for two");
  await fs.writeFile(path.join(deckDir, "presenter.json"), JSON.stringify({ title: "Test deck" }));
  server = await startServer({ rootDir: deckDir, port: 0, presenterPin: "424242" });
});

after(async () => {
  await server.close();
  await fs.rm(parentDir, { recursive: true, force: true });
});

describe("static deck", () => {
  test("injects the display script into HTML", async () => {
    const res = await request("/");
    assert.equal(res.status, 200);
    assert.match(res.body, /<script src="\/_\/client\/display\.js"><\/script><\/body>/u);
  });

  test("serves byte ranges and conditional requests", async () => {
    const range = await request("/video.bin", { headers: { range: "bytes=2-5" } });
    assert.equal(range.status, 206);
    assert.equal(range.body, "2345");
    assert.equal(range.headers["content-range"], "bytes 2-5/10");
    const suffix = await request("/video.bin", { headers: { range: "bytes=-3" } });
    assert.equal(suffix.body, "789");
    assert.equal((await request("/video.bin", { headers: { range: "bytes=20-" } })).status, 416);
    const full = await request("/video.bin");
    const cached = await request("/video.bin", { headers: { "if-modified-since": full.headers["last-modified"]! } });
    assert.equal(cached.status, 304);
  });

  test("does not leak files", async () => {
    assert.equal((await request("/.env")).status, 404);
    assert.equal((await request("/../deck-private/secret.txt")).status, 404);
    assert.equal((await request("/%2e%2e/deck-private/secret.txt")).status, 404);
    assert.equal((await request("/questions.json")).status, 404);
    assert.equal((await request("/%E0%A4%A")).status, 400);
    assert.equal((await request("/_/client/presenter.html")).status, 404);
    assert.equal((await request("/_/client/display.js")).status, 200);
  });
});

describe("api", () => {
  test("returns config, session and notes", async () => {
    const config = JSON.parse((await request("/_/api/config")).body);
    assert.equal(config.title, "Test deck");
    const session = JSON.parse((await request("/_/api/session")).body);
    assert.equal(session.sessionId, config.sessionId);
    assert.equal(session.capabilities.questions, true);
    assert.deepEqual(JSON.parse((await request("/_/api/notes?hash=%232.1")).body), { notes: "Notes for two" });
    assert.deepEqual(JSON.parse((await request("/_/api/notes?hash=%23..%2Fx")).body), { notes: null });
  });

  test("protects config writes", async () => {
    const body = JSON.stringify({ title: "Changed", sessionId: "dropped" });
    assert.equal((await request("/_/api/config", { method: "PUT", headers: { ...JSON_HEADERS, ...REMOTE }, body })).status, 401);
    const crossSite = { ...JSON_HEADERS, origin: "http://evil.example" };
    assert.equal((await request("/_/api/config", { method: "PUT", headers: crossSite, body })).status, 403);
    const textPlain = { "content-type": "text/plain" };
    assert.equal((await request("/_/api/config", { method: "PUT", headers: textPlain, body })).status, 415);
    assert.equal((await request("/_/api/config", { method: "PUT", headers: JSON_HEADERS, body })).status, 200);
    const saved = JSON.parse(await fs.readFile(path.join(deckDir, "presenter.json"), "utf8"));
    assert.deepEqual(saved, { title: "Changed" });
  });

  test("requires the presenter for recordings", async () => {
    assert.equal((await request("/_/api/recording", { headers: REMOTE })).status, 401);
    assert.equal((await request("/_/api/recording/audio", { headers: REMOTE })).status, 401);
    assert.deepEqual(JSON.parse((await request("/_/api/recording")).body), { available: false });
  });
});

describe("presenter login", () => {
  test("asks remote visitors for the PIN", async () => {
    const page = await request("/_/presenter", { headers: REMOTE });
    assert.equal(page.status, 401);
    assert.match(page.body, /Presenter PIN required/u);
    assert.equal((await request("/_/presenter")).status, 200, "local requests are trusted");
  });

  test("exchanges the PIN for a session cookie", async () => {
    const login = await request("/_/presenter?key=424242", { headers: { "x-forwarded-for": "203.0.113.8" } });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/_/presenter", "the PIN is stripped from the URL");
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    assert.ok(cookie?.startsWith("mp_presenter="));
    const page = await request("/_/presenter", { headers: { ...REMOTE, cookie } });
    assert.equal(page.status, 200);
    assert.match(page.body, /<base href="\/_\/client\/">/u);
  });

  test("rate limits wrong PINs", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9", "content-type": "application/x-www-form-urlencoded" };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await request("/_/presenter", { method: "POST", headers, body: "key=000000" })).status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429]);
  });
});

describe("questions", () => {
  test("lets the audience ask and vote, and the presenter answer", async () => {
    const page = await request("/_/questions", { headers: REMOTE });
    assert.equal(page.status, 200);
    const voter = page.headers["set-cookie"]?.[0]?.split(";")[0];
    assert.ok(voter);
    const audience = { ...JSON_HEADERS, ...REMOTE, cookie: voter };

    assert.equal((await request("/_/api/questions", { method: "POST", headers: audience, body: '{"text":"  "}' })).status, 400);
    const long = JSON.stringify({ text: "x".repeat(501) });
    assert.equal((await request("/_/api/questions", { method: "POST", headers: audience, body: long })).status, 400);
    const created = await request("/_/api/questions", { method: "POST", headers: audience, body: '{"text":"Why?"}' });
    const { question } = JSON.parse(created.body);

    const vote = JSON.stringify({ id: question.id });
    assert.equal(JSON.parse((await request("/_/api/questions/vote", { method: "POST", headers: audience, body: vote })).body).voted, true);
    assert.equal(JSON.parse((await request("/_/api/questions/vote", { method: "POST", headers: audience, body: vote })).body).voted, false);
    const listed = JSON.parse((await request("/_/api/questions", { headers: audience })).body);
    assert.equal(listed.questions[0].votes, 1);
    assert.equal(listed.questions[0].voted, true);

    const answer = JSON.stringify({ id: question.id, answered: true });
    assert.equal((await request("/_/api/questions/answer", { method: "POST", headers: audience, body: answer })).status, 401);
    assert.equal((await request("/_/api/questions/answer", { method: "POST", headers: JSON_HEADERS, body: answer })).status, 200);
    assert.equal((await request("/_/api/questions/delete", { method: "POST", headers: audience, body: vote })).status, 401);

    const qr = await request("/_/api/questions/qr");
    assert.equal(qr.headers["content-type"], "image/svg+xml");
  });
});

describe("websocket", () => {
  function connect(headers: Record<string, string> = {}): WebSocket {
    return new WebSocket(`ws://127.0.0.1:${server.port}/_/ws`, { headers: { host: `localhost:${server.port}`, ...headers } });
  }

  function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
  }

  test("rejects cross-site upgrades", async () => {
    const socket = connect({ origin: "http://evil.example" });
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    assert.match(error.message, /403/u);
  });

  test("rejects unauthenticated presenters", async () => {
    const socket = connect(REMOTE);
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "register", role: "presenter" }));
    const code = await new Promise<number>((resolve) => socket.once("close", resolve));
    assert.equal(code, 4001);
  });

  test("relays presenter commands to displays", async (t) => {
    const display = connect();
    const presenter = connect();
    t.after(() => {
      display.close();
      presenter.close();
    });
    await Promise.all([display, presenter].map((socket) => new Promise((resolve) => socket.once("open", resolve))));

    const displayConfig = nextMessage(display);
    display.send(JSON.stringify({ type: "register", role: "display" }));
    assert.equal((await displayConfig).type, "config");

    presenter.send(JSON.stringify({ type: "register", role: "presenter" }));
    // Skip the initial config/sync messages.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const command = nextMessage(display);
    presenter.send(JSON.stringify({ type: "command", action: "next" }));
    assert.deepEqual(await command, { type: "navigate", action: "next" });
  });
});
