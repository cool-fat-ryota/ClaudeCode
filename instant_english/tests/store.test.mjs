import test from "node:test";
import assert from "node:assert/strict";
import { streakOf } from "../js/store.js";

const day = (date, count = 5) => [date, { date, count }];

test("今日やっていれば今日から数える", () => {
  const days = Object.fromEntries([day("2026-09-19"), day("2026-09-18"), day("2026-09-17")]);
  assert.equal(streakOf(days, "2026-09-19"), 3);
});

test("今日まだでも、昨日までの連続は残る", () => {
  const days = Object.fromEntries([day("2026-09-18"), day("2026-09-17")]);
  assert.equal(streakOf(days, "2026-09-19"), 2);
});

test("一昨日で途切れていれば 0", () => {
  const days = Object.fromEntries([day("2026-09-17"), day("2026-09-16")]);
  assert.equal(streakOf(days, "2026-09-19"), 0);
});

test("月をまたいでも数えられる", () => {
  const days = Object.fromEntries([day("2026-10-01"), day("2026-09-30"), day("2026-09-29")]);
  assert.equal(streakOf(days, "2026-10-01"), 3);
});

test("問題数が 0 の日は続いていない扱い", () => {
  const days = Object.fromEntries([day("2026-09-19", 0), day("2026-09-18")]);
  assert.equal(streakOf(days, "2026-09-19"), 1);
});

test("記録が無ければ 0", () => {
  assert.equal(streakOf({}, "2026-09-19"), 0);
});
