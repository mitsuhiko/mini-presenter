import assert from "node:assert/strict";
import { test } from "node:test";
import { presenterWindowFeatures } from "../src/client/lib/popup.ts";

test("centers the presenter in the screen's usable area", () => {
  assert.equal(presenterWindowFeatures({ availWidth: 1920, availHeight: 1080, availLeft: 0, availTop: 25 }),
    "popup,width=1280,height=800,left=320,top=165");
});

test("centers on monitors with negative or offset coordinates", () => {
  assert.equal(presenterWindowFeatures({ availWidth: 1920, availHeight: 1080, availLeft: -1920, availTop: -1080 }),
    "popup,width=1280,height=800,left=-1600,top=-940");
});

test("fits small screens and defaults missing screen origins to zero", () => {
  assert.equal(presenterWindowFeatures({ availWidth: 1024, availHeight: 768 }),
    "popup,width=1024,height=768,left=0,top=0");
});
