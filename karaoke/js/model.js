// 曲とアーティストのデータを扱う純粋な関数群（保存先や画面には依存しない）。

import { normalize } from "./text.js";

export const STATUSES = ["repertoire", "practice"];
export const KEY_MIN = -12;
export const KEY_MAX = 12;

export class ValidationError extends Error {}

export function formatKey(key) {
  if (!key) return "原キー";
  return key > 0 ? `+${key}` : `${key}`;
}

/** 曲カードのバッジ用。原キーは ±0 と書く。 */
export function formatKeyBadge(key) {
  if (!key) return "KEY ±0";
  return key > 0 ? `KEY +${key}` : `KEY ${key}`;
}

export function validateKey(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const key = Number(String(value).trim().replace(/^\+/, ""));
  if (!Number.isInteger(key)) throw new ValidationError("キーは数値で指定してください。");
  if (key < KEY_MIN || key > KEY_MAX) {
    throw new ValidationError(`キーは ${KEY_MIN} 〜 +${KEY_MAX} の範囲で指定してください。`);
  }
  return key;
}

export function validateRating(value) {
  if (value === "" || value === null || value === undefined) return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError("自信度は 1〜5 で指定してください。");
  }
  return rating;
}

export function validateStatus(value) {
  const status = (value || "repertoire").trim();
  if (!STATUSES.includes(status)) throw new ValidationError(`未知のリストです: ${value}`);
  return status;
}

/** 入力値を保存できる形の曲データに整える。 */
export function buildSong(input = {}, { now = new Date().toISOString() } = {}) {
  const title = (input.title || "").trim();
  if (!title) throw new ValidationError("曲名を入力してください。");
  const artist = (input.artist || "").trim();
  if (!artist) throw new ValidationError("アーティスト名を入力してください。");
  const youtubeUrl = (input.youtubeUrl || "").trim();
  return {
    title,
    artist,
    key: validateKey(input.key),
    status: validateStatus(input.status),
    rating: validateRating(input.rating),
    impression: (input.impression || "").trim(),
    youtubeUrl,
    youtubeAuto: youtubeUrl ? false : true,
    lastSungOn: input.lastSungOn || null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

/** 曲の部分更新。未知の項目は無視する。 */
export function applyChanges(song, changes = {}, { now = new Date().toISOString() } = {}) {
  const updated = { ...song };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case "title": {
        const title = (value || "").trim();
        if (!title) throw new ValidationError("曲名を入力してください。");
        updated.title = title;
        break;
      }
      case "artist": {
        const artist = (value || "").trim();
        if (!artist) throw new ValidationError("アーティスト名を入力してください。");
        updated.artist = artist;
        break;
      }
      case "key":
        updated.key = validateKey(value);
        break;
      case "status":
        updated.status = validateStatus(value);
        break;
      case "rating":
        updated.rating = validateRating(value);
        break;
      case "impression":
        updated.impression = (value || "").trim();
        break;
      case "youtubeUrl":
        // 自分で貼ったリンクは自動更新しない。空にすると自動取得に戻る。
        updated.youtubeUrl = (value || "").trim();
        updated.youtubeAuto = !updated.youtubeUrl;
        break;
      case "youtubeAuto":
        updated.youtubeAuto = Boolean(value);
        break;
      case "lastSungOn":
        updated.lastSungOn = value || null;
        break;
      default:
        break;
    }
  }
  updated.updatedAt = now;
  return updated;
}

/**
 * 曲を絞り込む。artists を渡すと、アーティストのよみがな（「ゆうり」など）でも探せる。
 */
export function filterSongs(songs, { status = "", query = "" } = {}, artists = []) {
  const keyword = normalize(query);
  const readings = new Map(
    artists.map((artist) => [artist.searchKey ?? normalize(artist.name), artist.readingKey ?? normalize(artist.reading || "")])
  );
  return songs.filter((song) => {
    if (status && song.status !== status) return false;
    if (!keyword) return true;
    const reading = readings.get(normalize(song.artist)) || "";
    const haystack = normalize(`${song.title} ${song.artist} ${song.impression}`) + reading;
    return haystack.includes(keyword);
  });
}

const COMPARE = new Intl.Collator("ja");

export const SORTS = {
  updated: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
  created: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  title: (a, b) => COMPARE.compare(a.title, b.title),
  artist: (a, b) => COMPARE.compare(a.artist, b.artist) || COMPARE.compare(a.title, b.title),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || String(b.updatedAt).localeCompare(String(a.updatedAt)),
};

export function sortSongs(songs, sort = "updated") {
  return [...songs].sort(SORTS[sort] || SORTS.updated);
}

export function computeStats(songs) {
  return {
    total: songs.length,
    repertoire: songs.filter((s) => s.status === "repertoire").length,
    practice: songs.filter((s) => s.status === "practice").length,
    artists: new Set(songs.map((s) => normalize(s.artist))).size,
  };
}

/** アーティスト候補を作る。前方一致を先に、よく歌っている順に並べる。 */
export function suggestArtists(artists, query, songs = [], limit = 8) {
  const key = normalize(query);
  const counts = new Map();
  for (const song of songs) {
    const name = normalize(song.artist);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const scored = [];
  for (const artist of artists) {
    const searchKey = artist.searchKey ?? normalize(artist.name);
    const readingKey = artist.readingKey ?? normalize(artist.reading || "");
    if (key && !searchKey.includes(key) && !(readingKey && readingKey.includes(key))) continue;
    scored.push({
      ...artist,
      songCount: counts.get(searchKey) || 0,
      matchRank: key && (searchKey.startsWith(key) || (readingKey && readingKey.startsWith(key))) ? 0 : 1,
    });
  }
  scored.sort(
    (a, b) =>
      a.matchRank - b.matchRank ||
      b.songCount - a.songCount ||
      a.name.length - b.name.length ||
      COMPARE.compare(a.name, b.name)
  );
  return scored.slice(0, limit);
}

/** 曲一覧から、まだ登録されていないアーティストを拾う（取り込み時に使う）。 */
export function missingArtists(artists, songs) {
  const known = new Set(artists.map((a) => a.searchKey ?? normalize(a.name)));
  const missing = new Map();
  for (const song of songs) {
    const key = normalize(song.artist);
    if (key && !known.has(key) && !missing.has(key)) missing.set(key, song.artist);
  }
  return [...missing.values()];
}
