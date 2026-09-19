/*
 * 言えなかった文ほど早く戻ってくるように、次に出す日を決める（間隔をあけた復習）。
 * 進み具合は文ごとに level 0〜7 で持ち、level が上がるほど間隔が延びる。
 */

/** level ごとの「次に出すまでの日数」 */
export const INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60];

export const MAX_LEVEL = INTERVALS.length - 1;

/** その日の 0 時を指す "YYYY-MM-DD" */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return dayKey(date);
}

export function blankProgress(id) {
  return { id, level: 0, due: "", seen: 0, good: 0, again: 0, last: "", lastGrade: "" };
}

/**
 * 答え合わせの結果から、次の状態を作る。
 *   good  … 一段上げて、level に応じた日数だけ先に送る
 *   close … 段はそのまま。明日また出す
 *   again … 0 に戻して、その日のうちにもう一度出す
 */
export function review(prev, grade, today = dayKey()) {
  const state = { ...blankProgress(prev?.id), ...prev };
  state.seen += 1;
  state.last = today;
  state.lastGrade = grade;

  if (grade === "good") {
    state.good += 1;
    state.level = Math.min(state.level + 1, MAX_LEVEL);
    state.due = addDays(today, INTERVALS[state.level]);
  } else if (grade === "close") {
    state.level = Math.max(state.level, 1);
    state.due = addDays(today, 1);
  } else {
    state.again += 1;
    state.level = 0;
    state.due = today;
  }
  return state;
}

/** 今日出すべき復習か */
export const isDue = (progress, today = dayKey()) =>
  Boolean(progress) && progress.seen > 0 && progress.due !== "" && progress.due <= today;

/** 覚えた扱い（level 4 = 1週間以上あくところ）まで来たか */
export const isLearned = (progress) => Boolean(progress) && progress.level >= 4;
