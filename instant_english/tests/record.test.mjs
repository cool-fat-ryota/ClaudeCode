import test from "node:test";
import assert from "node:assert/strict";
import { pickMimeType } from "../js/record.js";

test("Safari なら audio/mp4 を選ぶ", () => {
  assert.equal(pickMimeType((type) => type === "audio/mp4"), "audio/mp4");
});

test("Chrome なら webm/opus を選ぶ", () => {
  assert.equal(
    pickMimeType((type) => type.startsWith("audio/webm")),
    "audio/webm;codecs=opus"
  );
});

test("mp4 と webm の両方が使えるなら mp4 を優先する", () => {
  assert.equal(pickMimeType(() => true), "audio/mp4");
});

test("どれも使えなければ空（ブラウザ任せ）", () => {
  assert.equal(pickMimeType(() => false), "");
});

test("isTypeSupported が無い端末でも落ちない", () => {
  assert.equal(pickMimeType(undefined), "");
  assert.equal(pickMimeType(null), "");
});
