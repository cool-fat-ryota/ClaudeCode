/*
 * 端末の中（IndexedDB）に進み具合を保存する。外には何も送らない。
 * 同じドメインに他のアプリが同居しているので、データベース名は
 * このアプリ専用の "instant-english" にしてある。
 */

const DB_NAME = "instant-english";
const DB_VERSION = 1;
const PROGRESS = "progress"; // 文ごとの進み具合（srs.js の形）
const DAYS = "days";         // 1日ごとの記録（継続日数と今日の問題数）
const SETTINGS = "settings"; // 設定

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new Error("この端末のブラウザでは記録を保存できません。"));
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(PROGRESS)) db.createObjectStore(PROGRESS, { keyPath: "id" });
    if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: "date" });
    if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" });
  };
  return promisify(request);
}

export const DEFAULT_SETTINGS = {
  useRecognition: true,  // 音声認識を使う
  record: true,          // 自分の声を録って聞き比べる
  length: "normal",      // 練習の長さ
  voiceId: "",           // 読み上げの声
  slowRate: 0.75,        // 「ゆっくり」の速さ
  overlapTimes: 3,       // オーバーラップの回数
  showPattern: true,     // 出題のときに文の形のヒントを出す
  autoSpeak: true,       // 答え合わせで自動的にお手本を鳴らす
};

export class Store {
  constructor(db) {
    this.db = db;
  }

  static async open(indexedDB) {
    return new Store(await openDatabase(indexedDB));
  }

  #read(name) {
    return this.db.transaction(name, "readonly").objectStore(name);
  }

  #write(name, action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(name, "readwrite");
      const result = action(tx.objectStore(name));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async loadAll() {
    const [progress, days, settings] = await Promise.all([
      promisify(this.#read(PROGRESS).getAll()),
      promisify(this.#read(DAYS).getAll()),
      promisify(this.#read(SETTINGS).getAll()),
    ]);
    return {
      progress: Object.fromEntries(progress.map((row) => [row.id, row])),
      days: Object.fromEntries(days.map((row) => [row.date, row])),
      settings: {
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries(settings.map((row) => [row.key, row.value])),
      },
    };
  }

  saveProgress(rows) {
    return this.#write(PROGRESS, (store) => {
      for (const row of rows) store.put(row);
    });
  }

  saveDay(day) {
    return this.#write(DAYS, (store) => store.put(day));
  }

  setSetting(key, value) {
    return this.#write(SETTINGS, (store) => store.put({ key, value }));
  }

  /** 書き出したファイルから戻す。今ある記録は置き換わる。 */
  async replaceAll({ progress = {}, days = {}, settings = {} }) {
    await this.#write(PROGRESS, (store) => {
      store.clear();
      for (const row of Object.values(progress)) store.put(row);
    });
    await this.#write(DAYS, (store) => {
      store.clear();
      for (const row of Object.values(days)) store.put(row);
    });
    await this.#write(SETTINGS, (store) => {
      store.clear();
      for (const [key, value] of Object.entries(settings)) store.put({ key, value });
    });
  }

  async clearProgress() {
    await this.#write(PROGRESS, (store) => store.clear());
    await this.#write(DAYS, (store) => store.clear());
  }
}

/** 連続で練習した日数を数える（今日まだなら、昨日までの連続を返す） */
export function streakOf(days, today) {
  const has = (key) => Boolean(days[key] && days[key].count > 0);
  const step = (key, back) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d - back);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  let count = 0;
  let cursor = has(today) ? today : step(today, 1);
  while (has(cursor)) {
    count += 1;
    cursor = step(cursor, 1);
  }
  return count;
}
