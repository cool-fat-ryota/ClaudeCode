import test from "node:test";
import assert from "node:assert/strict";
import { review, blankProgress, isDue, isLearned, dayKey, addDays, INTERVALS } from "../js/srs.js";

const TODAY = "2026-09-19";

test("日付の足し算は月をまたいでも合う", () => {
  assert.equal(addDays("2026-09-19", 14), "2026-10-03");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(addDays(TODAY, 0), TODAY);
});

test("dayKey は年月日だけを見る", () => {
  assert.equal(dayKey(new Date(2026, 8, 19, 23, 59)), "2026-09-19");
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("言えたら段が上がり、間隔が延びる", () => {
  let state = blankProgress("s1-01");
  state = review(state, "good", TODAY);
  assert.equal(state.level, 1);
  assert.equal(state.due, addDays(TODAY, INTERVALS[1]));
  state = review(state, "good", TODAY);
  assert.equal(state.level, 2);
  assert.equal(state.due, addDays(TODAY, INTERVALS[2]));
  assert.equal(state.seen, 2);
  assert.equal(state.good, 2);
});

test("段は上限で止まる", () => {
  let state = blankProgress("x");
  for (let i = 0; i < 20; i++) state = review(state, "good", TODAY);
  assert.equal(state.level, INTERVALS.length - 1);
  assert.equal(state.due, addDays(TODAY, 60));
});

test("惜しいときは明日もう一度", () => {
  let state = review(blankProgress("x"), "good", TODAY);
  state = review(state, "close", TODAY);
  assert.equal(state.due, addDays(TODAY, 1));
  assert.equal(state.level, 1, "段は下げない");
});

test("言えなかったら段が 0 に戻り、その日のうちにまた出る", () => {
  let state = blankProgress("x");
  for (let i = 0; i < 4; i++) state = review(state, "good", TODAY);
  assert.equal(state.level, 4);
  state = review(state, "again", TODAY);
  assert.equal(state.level, 0);
  assert.equal(state.due, TODAY);
  assert.equal(state.again, 1);
  assert.ok(isDue(state, TODAY));
});

test("まだ出していない文は復習の対象にならない", () => {
  assert.equal(isDue(blankProgress("x"), TODAY), false);
  assert.equal(isDue(undefined, TODAY), false);
});

test("期限が来ていなければ出さない", () => {
  const state = review(blankProgress("x"), "good", TODAY); // 1日後
  assert.equal(isDue(state, TODAY), false);
  assert.equal(isDue(state, addDays(TODAY, 1)), true);
  assert.equal(isDue(state, addDays(TODAY, 5)), true, "過ぎた分も拾う");
});

test("段4 まで来たら覚えた扱い", () => {
  let state = blankProgress("x");
  for (let i = 0; i < 3; i++) state = review(state, "good", TODAY);
  assert.equal(isLearned(state), false);
  state = review(state, "good", TODAY);
  assert.equal(isLearned(state), true);
});
