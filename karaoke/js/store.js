// 端末内 (IndexedDB) にデータを保存する層。サーバーは使わない。

import { SEED_ARTISTS } from "./artist-seed.js";
import { normalize } from "./text.js";

const DB_NAME = "karaoke-repertory";
const DB_VERSION = 1;
const SONGS = "songs";
const ARTISTS = "artists";
const SETTINGS = "settings";

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new Error("この端末のブラウザではデータを保存できません。"));
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(SONGS)) {
      db.createObjectStore(SONGS, { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains(ARTISTS)) {
      const artists = db.createObjectStore(ARTISTS, { keyPath: "id", autoIncrement: true });
      artists.createIndex("searchKey", "searchKey", { unique: true });
    }
    if (!db.objectStoreNames.contains(SETTINGS)) {
      db.createObjectStore(SETTINGS, { keyPath: "key" });
    }
  };
  return promisify(request);
}

export function makeArtist(name, reading = "") {
  return {
    name: name.trim(),
    reading: reading.trim(),
    searchKey: normalize(name),
    readingKey: normalize(reading),
  };
}

export class Store {
  constructor(db) {
    this.db = db;
  }

  static async open(indexedDB) {
    const store = new Store(await openDatabase(indexedDB));
    await store.seedArtistsIfEmpty();
    return store;
  }

  #tx(storeName, mode = "readonly") {
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  #write(storeName, action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const result = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async seedArtistsIfEmpty() {
    const count = await promisify(this.#tx(ARTISTS).count());
    if (count > 0) return 0;
    await this.#write(ARTISTS, (store) => {
      for (const [name, reading] of SEED_ARTISTS) store.put(makeArtist(name, reading));
    });
    return SEED_ARTISTS.length;
  }

  async loadAll() {
    const [songs, artists, settings] = await Promise.all([
      promisify(this.#tx(SONGS).getAll()),
      promisify(this.#tx(ARTISTS).getAll()),
      promisify(this.#tx(SETTINGS).getAll()),
    ]);
    return {
      songs,
      artists,
      settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
    };
  }

  async saveSong(song) {
    const id = await this.#write(SONGS, (store) => store.put(song));
    return { ...song, id: song.id ?? id };
  }

  deleteSong(id) {
    return this.#write(SONGS, (store) => store.delete(id));
  }

  /**
   * 未登録なら新しいアーティストとして覚える。
   * 既に居てよみがなが空なら、よみがなだけ補う。戻り値は変更後のレコード（変更が無ければ null）。
   */
  async rememberArtist(name, reading = "") {
    const searchKey = normalize(name);
    if (!searchKey) return null;
    const existing = await promisify(this.#tx(ARTISTS).index("searchKey").get(searchKey));
    if (existing) {
      if (!reading.trim() || existing.reading) return null;
      const updated = { ...existing, reading: reading.trim(), readingKey: normalize(reading) };
      await this.#write(ARTISTS, (store) => store.put(updated));
      return updated;
    }
    const artist = makeArtist(name, reading);
    const id = await this.#write(ARTISTS, (store) => store.put(artist));
    return { ...artist, id };
  }

  setSetting(key, value) {
    return this.#write(SETTINGS, (store) => store.put({ key, value }));
  }

  async replaceSongs(songs) {
    await this.#write(SONGS, (store) => {
      store.clear();
      for (const song of songs) store.put(song);
    });
  }

  async addSongs(songs) {
    await this.#write(SONGS, (store) => {
      for (const song of songs) store.put(song);
    });
  }
}
