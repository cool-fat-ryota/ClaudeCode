import test from "node:test";
import assert from "node:assert/strict";
import { compare, judge, bestMatch, tokenize } from "../js/match.js";

const score = (said, answer) => compare(said, answer).score;

test("同じ文なら満点", () => {
  assert.equal(score("I get up at six every morning.", "I get up at six every morning."), 1);
});

test("大文字小文字と句読点は無視する", () => {
  assert.equal(score("where is the restroom", "Where's the restroom?"), 1);
});

test("短縮形を開いても同じ扱い", () => {
  assert.equal(score("I am not ready yet", "I'm not ready yet."), 1);
  assert.equal(score("do not watch TV much", "I don't watch TV much."), 10 / 11); // 主語が抜けた分だけ減る
  assert.equal(score("I do not watch TV much", "I don't watch TV much."), 1);
});

test("he's は is でも has でも通る", () => {
  assert.equal(score("He has already gone home.", "He's already gone home."), 1);
  assert.equal(score("He is already gone home.", "He's already gone home."), 1);
});

test("数字と数詞は同じ", () => {
  assert.equal(score("I get up at 6 every morning", "I get up at six every morning."), 1);
});

test("a と an は同じ、a / the の有無は軽く減点", () => {
  assert.equal(score("It is an ten-minute walk from here", "It's a ten-minute walk from here."), 1);
  const dropped = score("It's ten-minute walk from here", "It's a ten-minute walk from here.");
  assert.ok(dropped > 0.9 && dropped < 1, `冠詞落ちは惜しいどまり: ${dropped}`);
  assert.equal(judge(dropped), "good");
});

test("言いよどみは無視する", () => {
  assert.equal(score("um I lost my wallet", "I lost my wallet."), 1);
});

test("語が足りないと下がる", () => {
  assert.ok(score("I lost wallet", "I lost my wallet.") < 0.92);
  assert.equal(judge(score("I lost wallet", "I lost my wallet.")), "close");
});

test("まるで違う文は もう一度", () => {
  assert.equal(judge(score("Good morning everyone", "I lost my wallet.")), "again");
  assert.equal(judge(score("", "I lost my wallet.")), "again");
});

test("足りない語・余分な語を拾える", () => {
  const result = compare("I lost the big wallet", "I lost my wallet.");
  assert.deepEqual(result.missing, ["my"]);
  assert.ok(result.extra.includes("big"));
});

test("答え合わせの表示用に、お手本の語ごとの当たり外れが出る", () => {
  const result = compare("She lives near station", "She lives near the station.");
  assert.deepEqual(
    result.answerWords.map((w) => [w.word, w.hit]),
    [["She", true], ["lives", true], ["near", true], ["the", false], ["station", true]]
  );
});

test("別解があればいちばん近いもので採点する", () => {
  const best = bestMatch(["I prefer tea to coffee"], [
    "I like tea better than coffee.",
    "I prefer tea to coffee.",
  ]);
  assert.equal(best.score, 1);
  assert.equal(best.grade, "good");
  assert.equal(best.answer, "I prefer tea to coffee.");
});

test("認識候補が複数あるときは、いちばん良いものを使う", () => {
  const best = bestMatch(["I lost my wallace", "I lost my wallet"], ["I lost my wallet."]);
  assert.equal(best.grade, "good");
  assert.equal(best.said, "I lost my wallet");
});

test("tokenize は短縮形を2つに開く", () => {
  assert.deepEqual(tokenize("I'm").map((u) => u.forms), [["i"], ["am"]]);
  assert.deepEqual(tokenize("don't").map((u) => u.forms), [["do"], ["not"]]);
  assert.deepEqual(tokenize("won't").map((u) => u.forms), [["will"], ["not"]]);
  assert.deepEqual(tokenize("can't").map((u) => u.forms), [["can"], ["not"]]);
});

test("内容語が1つでも欠けたら「言えた」にはしない", () => {
  const result = compare("I'm going to move next", "I'm going to move next month.");
  assert.ok(result.score >= 0.92, "点数だけ見ると高い");
  assert.equal(result.heavy, 1);
  assert.equal(judge(result.score, result.heavy), "close");
  assert.equal(bestMatch(["I'm going to move next"], ["I'm going to move next month."]).grade, "close");
});

test("冠詞のうっかりだけなら「言えた」で通す", () => {
  const result = compare("It's ten-minute walk from here", "It's a ten-minute walk from here.");
  assert.equal(result.heavy, 0);
  assert.equal(judge(result.score, result.heavy), "good");
});

test("余分に言い足したときも heavy に数える", () => {
  const result = compare("I really lost my wallet", "I lost my wallet.");
  assert.equal(result.heavy, 1);
  assert.equal(judge(result.score, result.heavy), "close");
});
