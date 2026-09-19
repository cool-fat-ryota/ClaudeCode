import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalize, toHiragana } from "../js/text.js";

describe("normalize", () => {
  it("カタカナをひらがなに揃える", () => {
    assert.equal(normalize("ヨルシカ"), "よるしか");
    assert.equal(toHiragana("ミセス"), "みせす");
  });

  it("全角英数と大文字小文字を揃える", () => {
    assert.equal(normalize("ＹＯＡＳＯＢＩ"), "yoasobi");
    assert.equal(normalize("YOASOBI"), "yoasobi");
  });

  it("半角カナも扱える", () => {
    assert.equal(normalize("ﾖﾙｼｶ"), "よるしか");
  });

  it("空白を無視する", () => {
    assert.equal(normalize(" back  number "), "backnumber");
  });

  it("漢字はそのまま残す", () => {
    assert.equal(normalize("米津玄師"), "米津玄師");
  });

  it("空の入力は空文字になる", () => {
    assert.equal(normalize(""), "");
    assert.equal(normalize(null), "");
  });
});
