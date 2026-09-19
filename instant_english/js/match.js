/*
 * 音声認識で聞き取った英文と、お手本の英文を照らし合わせる。
 *
 * 話し言葉なので、次のゆれは「同じ」とみなす。
 *   - 大文字小文字・句読点
 *   - 短縮形（I'm / I am、don't / do not、he's は is でも has でも可）
 *   - 数字と数詞（six / 6）
 *   - a と an
 *   - えーと（um / uh）のような言いよどみ
 * a / an / the の有無だけは「惜しい」として残したいので、重みを半分にして数える。
 */

const FILLERS = new Set(["um", "uh", "er", "ah", "hmm", "mm", "eh"]);

// 「〜n't」の前半部分
const NEGATIVE_STEMS = {
  do: "do", does: "does", did: "did",
  is: "is", are: "are", was: "was", were: "were",
  ca: "can", can: "can", could: "could", wo: "will", would: "would", should: "should",
  have: "have", has: "has", had: "had", must: "must", need: "need", ai: "is",
  might: "might", ought: "ought", sha: "shall",
};

// 言い方が割れない短縮形・つづりのゆれ
const FIXED = {
  cannot: [["can"], ["not"]],
  gonna: [["going"], ["to"]],
  wanna: [["want"], ["to"]],
  gotta: [["got"], ["to"]],
  lemme: [["let"], ["me"]],
  ok: [["okay"]],
  o: [["oh"]],
  mr: [["mister"]],
  tv: [["tv"]],
};

const NUMBERS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40",
  fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", first: "1st", second: "2nd", third: "3rd",
};

const LIGHT = new Set(["a", "an", "the"]);

/** 語の前後の記号を落として小文字にする（アポストロフィは残す） */
function clean(word) {
  return word
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/^[^a-z0-9']+/, "")
    .replace(/[^a-z0-9']+$/, "")
    .replace(/\.(?=[a-z])/g, ""); // a.m. → am
}

/** 1語を「照合に使う形」の並びに開く。戻り値は候補の配列の配列。 */
function expand(word) {
  if (!word) return [];
  if (FIXED[word]) return FIXED[word];
  if (NUMBERS[word]) return [[NUMBERS[word]]];
  if (word === "a" || word === "an") return [["a", "an"]];

  const apos = word.indexOf("'");
  if (apos > 0) {
    const head = word.slice(0, apos);
    const tail = word.slice(apos + 1);
    if (tail === "t" && head.endsWith("n")) {
      const stem = NEGATIVE_STEMS[head.slice(0, -1)];
      if (stem) return [[stem], ["not"]];
    }
    if (tail === "m") return [[head], ["am"]];
    if (tail === "re") return [[head], ["are"]];
    if (tail === "ve") return [[head], ["have"]];
    if (tail === "ll") return [[head], ["will"]];
    if (tail === "d") return [[head], ["would", "had"]];
    if (tail === "s") {
      if (head === "let") return [["let"], ["us"]];
      return [[head], ["is", "has"]]; // 所有の 's も同じ枠で扱う
    }
  }
  return [[word]];
}

/**
 * 文を照合用の単位に分ける。
 * 単位は { raw, forms, weight }。raw は画面に出す元の語（開いた2つ目以降は null）。
 */
export function tokenize(text) {
  const units = [];
  for (const source of String(text ?? "").split(/\s+/)) {
    const word = clean(source);
    if (!word || FILLERS.has(word)) continue;
    const parts = expand(word);
    parts.forEach((forms, i) => {
      units.push({
        raw: i === 0 ? source.replace(/^[^\wぁ-ん'"“”‘’]+|[^\w'"“”‘’]+$/g, "") || source : null,
        forms,
        weight: forms.length === 1 && LIGHT.has(forms[0]) ? 0.5 : forms.some((f) => LIGHT.has(f)) ? 0.5 : 1,
      });
    });
  }
  return units;
}

const same = (a, b) => a.forms.some((f) => b.forms.includes(f));

const total = (units) => units.reduce((sum, u) => sum + u.weight, 0);

/**
 * 2つの単位列の共通部分を、重み付きの最長共通部分列で求める。
 * 戻り値は { weight, pairs } （pairs は [aの位置, bの位置] の並び）。
 */
function align(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Float64Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = same(a[i], b[j])
        ? a[i].weight + table[i + 1][j + 1]
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j]) && table[i][j] === a[i].weight + table[i + 1][j + 1]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { weight: table[0][0], pairs };
}

/** 語ごとの一致・不一致。元の語の単位で { word, hit } を返す。 */
function markWords(units, hitIndexes) {
  const words = [];
  units.forEach((unit, index) => {
    const hit = hitIndexes.has(index);
    if (unit.raw !== null) words.push({ word: unit.raw, hit });
    else if (words.length) words[words.length - 1].hit = words[words.length - 1].hit && hit;
  });
  return words;
}

/**
 * 話した英文とお手本を照らし合わせる。
 * score は 0〜1。1 なら言えている。
 */
export function compare(said, answer) {
  const saidUnits = tokenize(said);
  const answerUnits = tokenize(answer);
  if (!answerUnits.length) return { score: 0, heavy: 0, answerWords: [], saidWords: [], missing: [], extra: [] };
  if (!saidUnits.length) {
    return {
      score: 0,
      heavy: answerUnits.filter((u) => u.weight === 1).length,
      answerWords: markWords(answerUnits, new Set()),
      saidWords: [],
      missing: markWords(answerUnits, new Set()).map((w) => w.word),
      extra: [],
    };
  }

  const { weight, pairs } = align(saidUnits, answerUnits);
  const saidHits = new Set(pairs.map(([i]) => i));
  const answerHits = new Set(pairs.map(([, j]) => j));
  const answerWords = markWords(answerUnits, answerHits);
  const saidWords = markWords(saidUnits, saidHits);

  // a / an / the 以外の取りこぼし・言い足しの数。1つでもあれば「言えた」にはしない。
  const heavy =
    answerUnits.filter((u, i) => !answerHits.has(i) && u.weight === 1).length +
    saidUnits.filter((u, i) => !saidHits.has(i) && u.weight === 1).length;

  return {
    score: (2 * weight) / (total(saidUnits) + total(answerUnits)),
    heavy,
    answerWords,
    saidWords,
    missing: answerWords.filter((w) => !w.hit).map((w) => w.word),
    extra: saidWords.filter((w) => !w.hit).map((w) => w.word),
  };
}

export const GOOD = 0.92;
export const CLOSE = 0.7;

/**
 * 「言えた／惜しい／もう一度」を決める。
 * heavy（a / an / the 以外の取りこぼし）が1つでもあれば「言えた」にはしない。
 * 冠詞のうっかりだけなら「言えた」で通す。
 */
export function judge(score, heavy = 0) {
  if (score >= GOOD && heavy === 0) return "good";
  if (score >= CLOSE) return "close";
  return "again";
}

/**
 * 認識結果の候補（複数）と、お手本＋別解を総当たりして、いちばん良い組み合わせを返す。
 * heard   : 認識された文の配列（可能性の高い順）
 * answers : [お手本, ...別解]
 */
export function bestMatch(heard, answers) {
  let best = null;
  for (const said of heard.length ? heard : [""]) {
    for (const answer of answers) {
      const result = compare(said, answer);
      if (!best || result.score > best.score) best = { ...result, said, answer };
    }
  }
  return { ...best, grade: judge(best.score, best.heavy) };
}
