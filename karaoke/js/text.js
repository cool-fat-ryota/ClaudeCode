// 検索用の文字列正規化。
// 「ヨルシカ」「よるしか」「ﾖﾙｼｶ」、「YOASOBI」「ｙｏａｓｏｂｉ」をすべて同じ扱いにする。

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const TO_HIRAGANA = 0x3041 - KATAKANA_START; // ぁ - ァ

export function toHiragana(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code >= KATAKANA_START && code <= KATAKANA_END ? String.fromCodePoint(code + TO_HIRAGANA) : ch;
  }
  return out;
}

export function normalize(text) {
  if (!text) return "";
  return toHiragana(String(text).normalize("NFKC"))
    .toLowerCase()
    .replace(/\s+/g, "");
}
