import test from "node:test";
import assert from "node:assert/strict";
import { buildSession, filterPhrases, summarize, lengthOf, LENGTHS } from "../js/session.js";
import { review, blankProgress, addDays } from "../js/srs.js";
import { PHRASES } from "../js/data/phrases.js";

const TODAY = "2026-09-19";
// テストでは混ぜ方を固定する
const fixed = () => 0.5;

test("練習の長さから問題数が決まる", () => {
  assert.equal(lengthOf("short").count, 8);
  assert.equal(lengthOf("normal").count, 14);
  assert.equal(lengthOf("long").count, 28);
  assert.equal(lengthOf("なぞ").key, "normal", "知らない値はふつうの長さ");
  assert.ok(LENGTHS.every((l) => l.count > 0 && l.minutes > 0));
});

test("ステップやシチュエーションで絞り込める", () => {
  assert.ok(filterPhrases(PHRASES, { mode: "step", value: 3 }).every((p) => p.step === 3));
  assert.ok(filterPhrases(PHRASES, { mode: "tag", value: "travel" }).every((p) => p.tags.includes("travel")));
  assert.equal(filterPhrases(PHRASES, { mode: "auto" }).length, PHRASES.length);
  assert.equal(filterPhrases(PHRASES, null).length, PHRASES.length);
});

test("まっさらなら新しい文が、やさしいステップから出る", () => {
  const picked = buildSession({ phrases: PHRASES, progress: {}, today: TODAY, count: 14, random: fixed });
  assert.equal(picked.length, 14);
  assert.ok(picked.every((p) => p.step <= 2), "最初はステップ1から順に出る");
  assert.equal(new Set(picked.map((p) => p.id)).size, 14, "同じ文は出ない");
});

test("期限が来た復習が優先して入る", () => {
  const progress = {};
  // 30問を「昨日 言えなかった」状態にする
  for (const phrase of PHRASES.slice(100, 130)) {
    progress[phrase.id] = review(blankProgress(phrase.id), "again", addDays(TODAY, -1));
  }
  const picked = buildSession({ phrases: PHRASES, progress, today: TODAY, count: 14, random: fixed });
  const reviews = picked.filter((p) => progress[p.id]);
  assert.equal(reviews.length, Math.round(14 * 0.6), "復習は6割まで");
  assert.equal(picked.length, 14);
});

test("復習が少なければ新しい文で埋まる", () => {
  const progress = {
    [PHRASES[0].id]: review(blankProgress(PHRASES[0].id), "again", addDays(TODAY, -1)),
  };
  const picked = buildSession({ phrases: PHRASES, progress, today: TODAY, count: 10, random: fixed });
  assert.equal(picked.length, 10);
  assert.ok(picked.some((p) => p.id === PHRASES[0].id));
});

test("全部やり終えていても、問題数はそろう", () => {
  const progress = {};
  for (const phrase of PHRASES) {
    progress[phrase.id] = review(blankProgress(phrase.id), "good", addDays(TODAY, -1));
  }
  const picked = buildSession({ phrases: PHRASES, progress, today: TODAY, count: 14, random: fixed });
  assert.equal(picked.length, 14);
  assert.equal(new Set(picked.map((p) => p.id)).size, 14);
});

test("絞り込んだ数より多く求めても、あるぶんだけ返る", () => {
  const picked = buildSession({
    phrases: PHRASES,
    progress: {},
    today: TODAY,
    count: 500,
    filter: { mode: "tag", value: "home" },
    random: fixed,
  });
  assert.ok(picked.length > 0);
  assert.ok(picked.every((p) => p.tags.includes("home")));
  assert.equal(picked.length, PHRASES.filter((p) => p.tags.includes("home")).length);
});

test("結果の集計", () => {
  const results = [
    { grade: "good" }, { grade: "good" }, { grade: "close" }, { grade: "again" },
  ];
  assert.deepEqual(summarize(results), { total: 4, good: 2, close: 1, again: 1, rate: 0.5 });
  assert.deepEqual(summarize([]), { total: 0, good: 0, close: 0, again: 0, rate: 0 });
});
