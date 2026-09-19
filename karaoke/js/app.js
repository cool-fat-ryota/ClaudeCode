// 画面の組み立てと操作。データは端末内 (IndexedDB) に保存する。

import {
  applyChanges,
  buildSong,
  computeStats,
  filterSongs,
  formatKey,
  formatKeyBadge,
  hasArtwork,
  KEY_MAX,
  KEY_MIN,
  missingArtists,
  sortSongs,
  suggestArtists,
  ValidationError,
} from "./model.js";
import { findArtworkUrl, youtubeThumbnailUrl } from "./artwork.js";
import { blobToDataUrl, dataUrlToBlob, toThumbnail } from "./image.js";
import { Store } from "./store.js";
import { normalize } from "./text.js";
import { extractVideoId, normalizeUrl, resolve } from "./youtube.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  store: null,
  songs: [],
  artists: [],
  settings: {},
  filter: { status: "", query: "", sort: "updated" },
  expanded: new Set(), // 開いているカードの id
  editingId: null,
  sheetArtwork: null, // シートで選び直した画像 { artwork, artworkUrl, artworkSource }
};

// 画像を表示するために作った URL。描き直すたびに開放する。
const objectUrls = [];

function artworkSrc(song) {
  if (song.artwork) {
    const url = URL.createObjectURL(song.artwork);
    objectUrls.push(url);
    return url;
  }
  return song.artworkUrl || "";
}

function showArtwork(container, image, src) {
  image.src = src || "";
  image.hidden = !src;
  container.classList.toggle("has-image", Boolean(src));
}

const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

// 編集中の感想。入力が止まった / 入力欄を離れた / アプリを閉じるときに保存する。
let pendingImpression = null;

async function flushImpression() {
  const pending = pendingImpression;
  pendingImpression = null;
  if (!pending) return;
  const current = state.songs.find((song) => song.id === pending.id);
  if (!current || current.impression === pending.value) return;
  await update(pending.id, { impression: pending.value }, { quiet: true });
  toast("保存しました");
}

const flushImpressionSoon = debounce(flushImpression, 600);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushImpression();
});
window.addEventListener("pagehide", () => flushImpression());

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2200);
}

/* ------------------------------------------------------------------ */
/* アーティスト名の入力補完                                             */
/* ------------------------------------------------------------------ */

class ArtistAutocomplete {
  constructor(input, list, onChange = () => {}) {
    this.input = input;
    this.list = list;
    this.onChange = onChange;
    this.items = [];
    this.active = -1;

    input.addEventListener("input", () => {
      this.update();
      this.onChange();
    });
    input.addEventListener("focus", () => this.update());
    input.addEventListener("keydown", (event) => this.onKeyDown(event));
    input.addEventListener("blur", () =>
      setTimeout(() => {
        this.close();
        this.onChange();
      }, 150)
    );
    list.addEventListener("pointerdown", (event) => {
      const li = event.target.closest("li");
      if (!li) return;
      event.preventDefault(); // 入力欄のフォーカスを外さない
      this.choose(Number(li.dataset.index));
    });
  }

  update() {
    this.items = suggestArtists(state.artists, this.input.value, state.songs, 8);
    this.active = -1;
    this.render();
  }

  render() {
    if (!this.items.length) return this.close();
    this.list.innerHTML = this.items
      .map(
        (artist, index) =>
          `<li role="option" data-index="${index}" aria-selected="${index === this.active}">` +
          `<span>${escapeHtml(artist.name)}</span>` +
          `<span class="reading">${artist.songCount ? `${artist.songCount}曲` : escapeHtml(artist.reading || "")}</span></li>`
      )
      .join("");
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
  }

  close() {
    this.list.replaceChildren();
    this.list.hidden = true;
    this.active = -1;
    this.input.setAttribute("aria-expanded", "false");
  }

  choose(index) {
    const artist = this.items[index];
    if (!artist) return;
    this.input.value = artist.name;
    this.close();
    this.onChange();
  }

  onKeyDown(event) {
    if (this.list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.active = (this.active + delta + this.items.length) % this.items.length;
      this.render();
    } else if (event.key === "Enter" && this.active >= 0) {
      event.preventDefault();
      this.choose(this.active);
    } else if (event.key === "Escape") {
      this.close();
    }
  }
}

const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/* ------------------------------------------------------------------ */
/* 一覧の描画                                                           */
/* ------------------------------------------------------------------ */

const listEl = $("#song-list");
const emptyEl = $("#empty");
const template = $("#song-template");

function render() {
  const stats = computeStats(state.songs);
  $("#stats").textContent =
    `レパートリー ${stats.repertoire} ／ 練習したい ${stats.practice} ／ アーティスト ${stats.artists}`;

  while (objectUrls.length) URL.revokeObjectURL(objectUrls.pop());
  const visible = sortSongs(filterSongs(state.songs, state.filter, state.artists), state.filter.sort);
  listEl.replaceChildren(...visible.map(renderSong));
  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = state.songs.length
    ? "条件に合う曲が見つかりませんでした。"
    : "右下の ＋ から、歌える曲や練習したい曲を登録しましょう。";
}

function renderSong(song) {
  const node = template.content.firstElementChild.cloneNode(true);
  const pick = (selector) => $(selector, node);
  node.dataset.id = song.id;

  // 開いているカードは再描画をまたいでも開いたままにする
  const details = pick("details");
  details.open = state.expanded.has(song.id);
  pick("summary").addEventListener("click", (event) => {
    event.preventDefault();
    details.open = !details.open;
    if (details.open) state.expanded.add(song.id);
    else state.expanded.delete(song.id);
  });
  pick(".title").textContent = song.title;
  pick(".artist").textContent = song.artist;
  pick(".key-badge").textContent = formatKeyBadge(song.key);
  pick(".impression").value = song.impression;
  showArtwork(pick(".thumb"), pick(".thumb-img"), artworkSrc(song));

  const isRepertoire = song.status === "repertoire";
  const statusBadge = pick(".status-badge");
  statusBadge.textContent = isRepertoire ? "レパートリー" : "練習したい";
  statusBadge.classList.add(song.status);
  node.classList.add(song.status); // カード左端の発光ラインの色
  pick(".move").textContent = isRepertoire ? "練習したいへ" : "レパートリーへ";

  const link = pick(".yt-link");
  link.href = song.youtubeUrl;
  const notes = [];
  if (song.lastSungOn) notes.push(`最後に歌った日: ${song.lastSungOn}`);
  notes.push(song.youtubeUrl.includes("/search?") ? "リンク: 検索結果ページ" : "リンク: 曲ページ");
  pick(".song-note").textContent = notes.join(" ／ ");

  renderStars(pick(".rating"), song);
  bindSongEvents(node, song);
  return node;
}

function renderStars(container, song) {
  container.replaceChildren(
    ...[1, 2, 3, 4, 5].map((value) => {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star" + (song.rating >= value ? " on" : "");
      star.textContent = "★";
      star.setAttribute("aria-label", `自信度 ${value}`);
      star.addEventListener("click", () => update(song.id, { rating: song.rating === value ? null : value }));
      return star;
    })
  );
}

function bindSongEvents(node, song) {
  const pick = (selector) => $(selector, node);

  pick(".move").addEventListener("click", () =>
    update(song.id, { status: song.status === "repertoire" ? "practice" : "repertoire" })
  );

  pick(".sang-today").addEventListener("click", () => update(song.id, { lastSungOn: today() }));

  // 感想は入力が止まったタイミングで自動保存する
  const impression = pick(".impression");
  impression.addEventListener("input", () => {
    pendingImpression = { id: song.id, value: impression.value };
    flushImpressionSoon();
  });
  impression.addEventListener("blur", () => {
    pendingImpression = { id: song.id, value: impression.value };
    flushImpression();
  });

  pick(".edit").addEventListener("click", () => openSongSheet(song));

  pick(".delete").addEventListener("click", async () => {
    if (!confirm(`「${song.title}」を削除しますか？`)) return;
    await state.store.deleteSong(song.id);
    state.songs = state.songs.filter((s) => s.id !== song.id);
    state.expanded.delete(song.id);
    render();
    toast("削除しました");
  });
}

/* ------------------------------------------------------------------ */
/* データ更新                                                           */
/* ------------------------------------------------------------------ */

function replaceSong(song) {
  state.songs = state.songs.map((s) => (s.id === song.id ? song : s));
}

async function update(id, changes, { quiet = false } = {}) {
  const current = state.songs.find((song) => song.id === id);
  if (!current) return;
  try {
    const updated = applyChanges(current, changes);
    await state.store.saveSong(updated);
    replaceSong(updated);
    if (!quiet) render();
    if ("title" in changes || "artist" in changes) {
      refreshAutoLink(updated);
      refreshAutoArtwork(updated);
    }
    return updated;
  } catch (error) {
    alert(error instanceof ValidationError ? error.message : "保存できませんでした。");
  }
}

/** 自動リンクの曲について、YouTube Music のリンクを貼り直す。 */
async function refreshAutoLink(song) {
  if (!song.youtubeAuto) return;
  const { url } = await resolve(song.title, song.artist, { apiKey: state.settings.apiKey || "" });
  const current = state.songs.find((s) => s.id === song.id);
  if (!current || current.youtubeUrl === url || !current.youtubeAuto) return;
  const updated = { ...current, youtubeUrl: url };
  await state.store.saveSong(updated);
  replaceSong(updated);
  render();
}

/** 曲名とアーティストからジャケット画像を探す。見つからなければ null。 */
async function fetchArtwork(title, artist, { youtubeUrl = "" } = {}) {
  const url =
    (await findArtworkUrl(title, artist)) || youtubeThumbnailUrl(extractVideoId(youtubeUrl));
  if (!url) return null;
  try {
    return { artwork: await toThumbnail(url), artworkUrl: url, artworkSource: "auto" };
  } catch {
    // 画像そのものを読めない場合（配信元が許可していないとき）は URL だけ覚えておく
    return { artwork: null, artworkUrl: url, artworkSource: "auto" };
  }
}

const autoArtworkEnabled = () => state.settings.autoArtwork !== false;

/** 自動で入れた画像を、曲名やアーティストに合わせて入れ直す。 */
async function refreshAutoArtwork(song) {
  if (!autoArtworkEnabled() || song.artworkSource === "manual") return;
  const found = await fetchArtwork(song.title, song.artist, { youtubeUrl: song.youtubeUrl });
  if (!found) return;
  const current = state.songs.find((s) => s.id === song.id);
  if (!current || current.artworkSource === "manual") return;
  const updated = { ...current, ...found };
  await state.store.saveSong(updated);
  replaceSong(updated);
  render();
}

async function rememberArtist(name, reading = "") {
  const saved = await state.store.rememberArtist(name, reading);
  if (!saved) return;
  const index = state.artists.findIndex((artist) => artist.id === saved.id);
  if (index >= 0) state.artists[index] = saved;
  else state.artists.push(saved);
}

/* ------------------------------------------------------------------ */
/* 追加・編集シート                                                     */
/* ------------------------------------------------------------------ */

const sheet = $("#song-sheet");
const form = $("#song-form");
const keyInput = $("#key");
const keyDisplay = $("#key-display");
const formMessage = $("#form-message");

function setFormKey(value) {
  const key = Math.max(KEY_MIN, Math.min(KEY_MAX, value));
  keyInput.value = String(key);
  keyDisplay.textContent = formatKey(key);
}

$$(".key-btn").forEach((btn) =>
  btn.addEventListener("click", () => setFormKey(Number(keyInput.value) + Number(btn.dataset.step)))
);
$("#key-reset").addEventListener("click", () => setFormKey(0));
const readingField = $("#reading-field");

/** 初めて登録するアーティストのときだけ、よみがな欄を出す。 */
function updateReadingField() {
  const name = normalize($("#artist").value);
  const known = state.artists.some((artist) => (artist.searchKey ?? normalize(artist.name)) === name);
  const isNewArtist = Boolean(name) && !known;
  // 候補リストが開いている間は重なるので出さない
  readingField.hidden = !isNewArtist || !$("#artist-suggestions").hidden;
  if (!isNewArtist) $("#artist-reading").value = "";
}

new ArtistAutocomplete($("#artist"), $("#artist-suggestions"), updateReadingField);

const artworkPreview = $("#artwork-preview");
const artworkStatus = $("#artwork-status");

function showSheetArtwork(song) {
  const chosen = state.sheetArtwork ?? song ?? {};
  const src = chosen.artwork ? URL.createObjectURL(chosen.artwork) : chosen.artworkUrl || "";
  if (chosen.artwork) objectUrls.push(src);
  showArtwork(artworkPreview.parentElement, artworkPreview, src);
  $("#artwork-clear").hidden = !src;
}

$("#artwork-search").addEventListener("click", async () => {
  const title = $("#title").value.trim();
  const artist = $("#artist").value.trim();
  if (!title) {
    artworkStatus.textContent = "先に曲名を入れてください。";
    return;
  }
  artworkStatus.textContent = "探しています…";
  const found = await fetchArtwork(title, artist);
  if (found) {
    state.sheetArtwork = found;
    showSheetArtwork();
    artworkStatus.textContent = "見つかりました。";
  } else {
    artworkStatus.textContent = "見つかりませんでした。写真から選べます。";
  }
});

$("#artwork-pick").addEventListener("click", () => $("#artwork-file").click());

$("#artwork-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  artworkStatus.textContent = "読み込んでいます…";
  try {
    state.sheetArtwork = { artwork: await toThumbnail(file), artworkUrl: "", artworkSource: "manual" };
    showSheetArtwork();
    artworkStatus.textContent = "写真を設定しました。";
  } catch (error) {
    artworkStatus.textContent = `読み込めませんでした（${error.message}）`;
  }
});

$("#artwork-clear").addEventListener("click", () => {
  state.sheetArtwork = { artwork: null, artworkUrl: "", artworkSource: null };
  showSheetArtwork();
  artworkStatus.textContent = "画像を消しました。";
});

function openSongSheet(song = null) {
  state.editingId = song?.id ?? null;
  $("#sheet-title").textContent = song ? "曲を編集" : "曲を追加";
  form.reset();
  formMessage.textContent = "";
  $("#title").value = song?.title ?? "";
  $("#artist").value = song?.artist ?? "";
  $("#impression").value = song?.impression ?? "";
  $("#youtube-url").value = song && !song.youtubeAuto ? song.youtubeUrl : "";
  $("#youtube-url").placeholder = song?.youtubeAuto ? "自動で設定されています" : "https://music.youtube.com/watch?v=...";
  $$("input[name='status']").forEach((radio) => (radio.checked = radio.value === (song?.status ?? "repertoire")));
  setFormKey(song?.key ?? 0);
  state.sheetArtwork = null;
  artworkStatus.textContent = "";
  showSheetArtwork(song);
  updateReadingField();
  sheet.showModal();
  if (!song) $("#title").focus(); // 遅らせると入力中にフォーカスを奪ってしまう
}

$("#open-add").addEventListener("click", () => openSongSheet());
$$("[data-close]").forEach((btn) => btn.addEventListener("click", () => btn.closest("dialog").close()));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.key = keyInput.value;
  data.youtubeUrl = normalizeUrl(data.youtubeUrl);
  if (state.sheetArtwork) Object.assign(data, state.sheetArtwork);
  try {
    if (state.editingId === null) {
      const song = await state.store.saveSong(buildSong(data));
      state.songs.push(song);
      await rememberArtist(song.artist, $("#artist-reading").value);
      render();
      sheet.close();
      toast("追加しました");
      refreshAutoLink(song);
      if (!hasArtwork(song)) refreshAutoArtwork(song);
    } else {
      const updated = await update(state.editingId, data, { quiet: true });
      if (!updated) return;
      await rememberArtist(updated.artist, $("#artist-reading").value);
      render();
      sheet.close();
      toast("保存しました");
    }
  } catch (error) {
    formMessage.textContent = error instanceof ValidationError ? error.message : "保存できませんでした。";
  }
});

/* ------------------------------------------------------------------ */
/* 絞り込み                                                             */
/* ------------------------------------------------------------------ */

$$(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$(".tab").forEach((other) => other.classList.toggle("is-active", other === tab));
    state.filter.status = tab.dataset.status;
    render();
  })
);
$("#search").addEventListener(
  "input",
  debounce((event) => {
    state.filter.query = event.target.value;
    render();
  }, 150)
);
$("#sort").addEventListener("change", (event) => {
  state.filter.sort = event.target.value;
  render();
});

/* ------------------------------------------------------------------ */
/* 設定・バックアップ                                                   */
/* ------------------------------------------------------------------ */

const settingsSheet = $("#settings-sheet");

$("#open-settings").addEventListener("click", () => {
  $("#api-key").value = state.settings.apiKey || "";
  $("#auto-artwork").checked = autoArtworkEnabled();
  const stats = computeStats(state.songs);
  $("#about-text").textContent =
    `登録されている曲は ${stats.total} 曲、候補のアーティストは ${state.artists.length} 組です。` +
    "記録はこの端末の中だけに保存され、オフラインでも使えます。";
  settingsSheet.showModal();
});

$("#api-key").addEventListener(
  "change",
  debounce(async (event) => {
    const apiKey = event.target.value.trim();
    state.settings.apiKey = apiKey;
    await state.store.setSetting("apiKey", apiKey);
    toast(apiKey ? "APIキーを保存しました" : "APIキーを消しました");
  }, 100)
);

$("#auto-artwork").addEventListener("change", async (event) => {
  state.settings.autoArtwork = event.target.checked;
  await state.store.setSetting("autoArtwork", state.settings.autoArtwork);
  toast(event.target.checked ? "自動で探します" : "自動では探しません");
});

$("#artwork-fill").addEventListener("click", async (event) => {
  const button = event.target;
  const targets = state.songs.filter((song) => !hasArtwork(song));
  if (targets.length === 0) {
    toast("すべての曲に画像があります");
    return;
  }
  button.disabled = true;
  let found = 0;
  for (const [index, song] of targets.entries()) {
    toast(`探しています… ${index + 1}/${targets.length}`);
    const artwork = await fetchArtwork(song.title, song.artist, { youtubeUrl: song.youtubeUrl });
    if (!artwork) continue;
    const current = state.songs.find((s) => s.id === song.id);
    if (!current || hasArtwork(current)) continue;
    const updated = { ...current, ...artwork };
    await state.store.saveSong(updated);
    replaceSong(updated);
    found += 1;
  }
  button.disabled = false;
  render();
  toast(`${found} 曲に画像を設定しました`);
});

$("#export-btn").addEventListener("click", async () => {
  const payload = {
    app: "karaoke-repertory",
    version: 2,
    exportedAt: new Date().toISOString(),
    // 画像は Blob のままでは書き出せないので、文字列（data URL）に直す
    songs: await Promise.all(
      state.songs.map(async ({ id, artwork, ...song }) => ({
        ...song,
        artwork: artwork ? await blobToDataUrl(artwork) : null,
      }))
    ),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `karaoke-repertory-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("書き出しました");
});

$("#import-btn").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const songs = Array.isArray(payload) ? payload : payload.songs;
    if (!Array.isArray(songs)) throw new Error("形式が違います");
    const restored = songs.map((song) => buildSong({ ...song, artwork: null, youtubeUrl: song.youtubeUrl || "" }));
    for (const [index, song] of restored.entries()) {
      const source = songs[index];
      song.youtubeAuto = source.youtubeAuto ?? !source.youtubeUrl;
      song.createdAt = source.createdAt || song.createdAt;
      song.updatedAt = source.updatedAt || song.updatedAt;
      song.artwork = typeof source.artwork === "string" ? await dataUrlToBlob(source.artwork) : null;
    }
    if (!confirm(`${restored.length} 曲を読み込みます。今ある ${state.songs.length} 曲は置き換えられます。よろしいですか？`)) {
      return;
    }
    await state.store.replaceSongs(restored);
    for (const name of missingArtists(state.artists, restored)) await rememberArtist(name);
    ({ songs: state.songs, artists: state.artists } = await state.store.loadAll());
    render();
    settingsSheet.close();
    toast(`${restored.length} 曲を読み込みました`);
  } catch (error) {
    alert(`読み込めませんでした: ${error.message}`);
  }
});

/* ------------------------------------------------------------------ */
/* ホーム画面への追加 (PWA)                                             */
/* ------------------------------------------------------------------ */

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("#install-btn").hidden = false;
  $("#install-hint").textContent = "下のボタンから、アプリとしてホーム画面に追加できます。";
});
$("#install-btn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-btn").hidden = true;
});
window.addEventListener("appinstalled", () => toast("ホーム画面に追加しました"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  // 初回登録では何もしない。新しい版に入れ替わったときだけ読み込み直す。
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

/* ------------------------------------------------------------------ */
/* 起動                                                                 */
/* ------------------------------------------------------------------ */

async function start() {
  try {
    // 端末の空き容量が減ったときに記録が消されにくくなるよう、保存の維持を申請する
    navigator.storage?.persist?.().catch(() => {});
    state.store = await Store.open();
    const data = await state.store.loadAll();
    state.songs = data.songs;
    state.artists = data.artists;
    state.settings = data.settings;
    render();
  } catch (error) {
    $("#stats").textContent = "データを読み込めませんでした。";
    emptyEl.hidden = false;
    emptyEl.textContent = `保存領域を開けませんでした（${error.message}）。プライベートブラウズを解除すると使えることがあります。`;
  }
}

start();
