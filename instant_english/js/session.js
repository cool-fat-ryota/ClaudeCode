/*
 * 1回分の練習（5分・10分など）に出す文を組み立てる。
 * 復習（今日が期限のもの）を先に、残りを新しい文で埋める。
 */

import { isDue } from "./srs.js";

/** 練習の長さ。1問おおよそ20秒（考える→言う→お手本→重ねる）で見積もる。 */
export const LENGTHS = [
  { key: "short", minutes: 3, count: 8, label: "3分" },
  { key: "normal", minutes: 5, count: 14, label: "5分" },
  { key: "long", minutes: 10, count: 28, label: "10分" },
];

export const lengthOf = (key) => LENGTHS.find((l) => l.key === key) ?? LENGTHS[1];

/** filter: { mode: "auto" | "step" | "tag", value } */
export function filterPhrases(phrases, filter) {
  if (!filter || filter.mode === "auto") return phrases;
  if (filter.mode === "step") return phrases.filter((p) => p.step === Number(filter.value));
  if (filter.mode === "tag") return phrases.filter((p) => p.tags.includes(filter.value));
  return phrases;
}

function shuffle(items, random) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * 出題リストを作る。
 *   phrases  … 全問題
 *   progress … id をキーにした進み具合
 *   count    … 出す数
 * 復習は最大で全体の 6 割まで。復習が少なければ新しい文で埋める（逆も同じ）。
 */
export function buildSession({ phrases, progress = {}, today, count = 14, filter, random = Math.random }) {
  const pool = filterPhrases(phrases, filter);

  const due = pool
    .filter((p) => isDue(progress[p.id], today))
    .sort((a, b) => {
      const pa = progress[a.id];
      const pb = progress[b.id];
      return pa.due === pb.due ? pa.level - pb.level : pa.due < pb.due ? -1 : 1;
    });

  const fresh = pool.filter((p) => !progress[p.id] || progress[p.id].seen === 0);
  // 新しい文はステップ順のまま、同じステップの中だけを混ぜる
  const freshMixed = [];
  for (const step of [...new Set(fresh.map((p) => p.step))].sort((a, b) => a - b)) {
    freshMixed.push(...shuffle(fresh.filter((p) => p.step === step), random));
  }

  const reviewQuota = Math.min(due.length, Math.max(1, Math.round(count * 0.6)));
  const picked = due.slice(0, reviewQuota);
  for (const phrase of freshMixed) {
    if (picked.length >= count) break;
    picked.push(phrase);
  }
  for (const phrase of due.slice(reviewQuota)) {
    if (picked.length >= count) break;
    picked.push(phrase);
  }
  if (picked.length < count) {
    // 全部やり終えている場合は、期限が近い順にもう一巡する
    const rest = pool
      .filter((p) => !picked.includes(p))
      .sort((a, b) => (progress[a.id]?.level ?? 0) - (progress[b.id]?.level ?? 0));
    for (const phrase of rest) {
      if (picked.length >= count) break;
      picked.push(phrase);
    }
  }

  return shuffle(picked, random);
}

/** 練習の途中経過をまとめる */
export function summarize(results) {
  const good = results.filter((r) => r.grade === "good").length;
  const close = results.filter((r) => r.grade === "close").length;
  const again = results.filter((r) => r.grade === "again").length;
  return { total: results.length, good, close, again, rate: results.length ? good / results.length : 0 };
}
