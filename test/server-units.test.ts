import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { clientAddress, isLocalRequest, isSameOrigin, PresenterAuth } from "../src/server/auth.ts";
import { normalizeRemoteUrl, remoteUrlFor, resolveInside } from "../src/server/deck.ts";
import { injectBase, injectDisplayScript } from "../src/server/inject.ts";
import { QuestionStore } from "../src/server/questions.ts";

function request(remoteAddress: string, headers: Record<string, string> = {}): IncomingMessage {
  return { socket: { remoteAddress }, headers: { host: "localhost:8080", ...headers } } as unknown as IncomingMessage;
}

describe("auth", () => {
  test("only trusts direct loopback requests", () => {
    assert.ok(isLocalRequest(request("127.0.0.1")));
    assert.ok(isLocalRequest(request("::1", { host: "[::1]:8080" })));
    assert.ok(isLocalRequest(request("::ffff:127.0.0.1", { host: "127.0.0.1:8080" })));
    assert.ok(!isLocalRequest(request("192.168.1.5")));
    // Relayed through a local tunnel.
    assert.ok(!isLocalRequest(request("127.0.0.1", { "x-forwarded-for": "8.8.8.8" })));
    assert.ok(!isLocalRequest(request("127.0.0.1", { "cf-connecting-ip": "8.8.8.8" })));
    // DNS rebinding.
    assert.ok(!isLocalRequest(request("127.0.0.1", { host: "evil.example:8080" })));
  });

  test("honors proxy headers only from loopback peers", () => {
    assert.equal(clientAddress(request("127.0.0.1", { "x-forwarded-for": "8.8.8.8, 1.1.1.1" })), "8.8.8.8");
    assert.equal(clientAddress(request("10.0.0.2", { "x-forwarded-for": "8.8.8.8" })), "10.0.0.2");
    assert.equal(clientAddress(request("::ffff:10.0.0.2")), "10.0.0.2");
  });

  test("checks the Origin header", () => {
    assert.ok(isSameOrigin(request("10.0.0.2")));
    assert.ok(isSameOrigin(request("10.0.0.2", { origin: "http://localhost:8080" })));
    assert.ok(!isSameOrigin(request("10.0.0.2", { origin: "http://evil.example" })));
    assert.ok(!isSameOrigin(request("10.0.0.2", { origin: "null" })));
  });

  test("logs in with the PIN and rate limits failures", () => {
    const auth = new PresenterAuth("123456");
    const remote = request("10.0.0.2");
    assert.ok(!auth.isAuthorized(remote));
    for (let attempt = 1; attempt < 5; attempt += 1) {
      assert.deepEqual(auth.login(remote, "000000", 0), { ok: false, reason: "invalid", remaining: 5 - attempt });
    }
    const blocked = auth.login(remote, "000000", 0);
    assert.equal(blocked.ok ? null : blocked.reason, "blocked");
    // Even the right PIN is refused while blocked.
    assert.equal(auth.login(remote, "123456", 1000).ok, false);
    assert.ok(auth.blockedFor(remote, 1000) > 0);
    // Other clients are unaffected.
    const other = request("10.0.0.3");
    const result = auth.login(other, " 123456 ", 1000);
    assert.ok(result.ok);
    const cookie = result.cookie.split(";")[0]!;
    assert.match(result.cookie, /HttpOnly; SameSite=Lax$/u);
    assert.ok(auth.isAuthorized(request("10.0.0.9", { cookie })));
    assert.ok(!auth.isAuthorized(request("10.0.0.9", { cookie: "mp_presenter=forged" })));
    // The block expires.
    assert.ok(auth.login(remote, "123456", 10 * 60_000).ok);
  });

  test("disables login without a PIN", () => {
    assert.deepEqual(new PresenterAuth(null).login(request("10.0.0.2"), ""), { ok: false, reason: "disabled" });
  });
});

describe("deck", () => {
  const root = path.resolve("/srv/deck");

  test("resolves paths inside the deck only", () => {
    assert.equal(resolveInside(root, "/index.html"), path.join(root, "index.html"));
    assert.equal(resolveInside(root, "/"), root);
    assert.equal(resolveInside(root, "/a//b\\c.css"), path.join(root, "a", "b", "c.css"));
    assert.equal(resolveInside(root, "/../deck-secrets/x"), null);
    assert.equal(resolveInside(root, "/.git/config"), null);
    assert.equal(resolveInside(root, "/notes/.env"), null);
    assert.equal(resolveInside(root, "/a\0b"), null);
  });

  test("maps remote URLs", () => {
    const base = normalizeRemoteUrl("https://example.com/talks/deck");
    assert.equal(base.toString(), "https://example.com/talks/deck/");
    assert.equal(remoteUrlFor(base, "/", "").toString(), "https://example.com/talks/deck/");
    assert.equal(remoteUrlFor(base, "/style.css", "?v=1").toString(), "https://example.com/talks/deck/style.css?v=1");
    assert.equal(remoteUrlFor(base, "/talks/deck/img.png", "").toString(), "https://example.com/talks/deck/img.png");
    const file = normalizeRemoteUrl("https://example.com/slides.html");
    assert.equal(remoteUrlFor(file, "/", "").toString(), "https://example.com/slides.html");
    assert.throws(() => normalizeRemoteUrl("file:///etc/passwd"));
  });

  test("injects scripts and base tags", () => {
    assert.equal(
      injectDisplayScript("<html><BODY>x</BODY></html>"),
      '<html><BODY>x<script src="/_/client/display.js"></script></BODY></html>',
    );
    assert.equal(injectDisplayScript("x"), 'x<script src="/_/client/display.js"></script>');
    assert.equal(injectBase('<head lang="en"><title>', "/b/"), '<head lang="en"><base href="/b/"><title>');
  });
});

describe("questions", () => {
  test("adds, votes, answers and removes", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-questions-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const store = new QuestionStore(dir);

    const added = await Promise.all(["one", "two", "three"].map((text) => store.add(text)));
    assert.equal(added[2]!.questions.length, 3, "concurrent adds are serialized");
    const id = added[0]!.result.id;

    assert.equal((await store.vote(id, "voter-a")).result?.voted, true);
    assert.equal((await store.vote(id, "voter-a")).result?.voted, false);
    assert.equal((await store.vote(id, "voter-b")).result?.question.votes, 2);
    assert.equal((await store.vote("missing", "voter-a")).result, null);

    const listed = await store.list("voter-a");
    assert.equal(listed[0]?.voted, true);
    assert.equal(listed[1]?.voted, false);
    assert.ok(!("voters" in listed[0]!), "voter tokens are not exposed");

    await store.setAnswered(id, true);
    assert.equal((await store.vote(id, "voter-c")).result?.voted, false, "answered questions take no votes");

    assert.equal((await store.remove(id)).result, true);
    assert.equal((await store.list()).length, 2);
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, "questions.json"), "utf8"));
    assert.equal(onDisk.questions.length, 2);
  });
});
