// 曲のジャケット画像を探す。
//
// 取得元は iTunes Search API（APIキー不要）。ブラウザから直接呼べない場合
// （CORS が許可されていない環境）に備えて、JSONP でも取れるようにしてある。
// 見つからないときは null を返し、利用者が写真から選べるようにする。

import { normalize } from "./text.js";

const SEARCH_ENDPOINT = "https://itunes.apple.com/search";
const YOUTUBE_THUMBNAIL = "https://i.ytimg.com/vi/";

export function buildSearchUrl(title, artist, { country = "JP", limit = 5, callback = "" } = {}) {
  const params = new URLSearchParams({
    term: [title, artist].map((part) => (part || "").trim()).filter(Boolean).join(" "),
    country,
    media: "music",
    entity: "song",
    limit: String(limit),
    lang: "ja_jp",
  });
  if (callback) params.set("callback", callback);
  return `${SEARCH_ENDPOINT}?${params}`;
}

/** artworkUrl100 のような URL を、指定した大きさのものに差し替える。 */
export function upgradeArtworkUrl(url, size = 600) {
  if (!url) return "";
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

/** 検索結果から、曲名とアーティストが一番近いものを選ぶ。 */
export function pickResult(results, title, artist) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const score = (item) => {
    const itemTitle = normalize(item.trackName);
    const itemArtist = normalize(item.artistName);
    let points = 0;
    if (itemTitle === wantedTitle) points += 4;
    else if (itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle)) points += 2;
    if (itemArtist === wantedArtist) points += 3;
    else if (itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist)) points += 1;
    return points;
  };
  const best = results
    .filter((item) => item && item.artworkUrl100)
    .map((item) => ({ item, points: score(item) }))
    .sort((a, b) => b.points - a.points)[0];
  // 曲名もアーティストもかすらない結果は採用しない（別の曲を貼ってしまうため）
  return best && best.points >= 3 ? best.item : null;
}

/** script タグを使って JSON を取る（CORS が許可されていないとき用）。 */
export function jsonp(url, { timeout = 8000, doc = globalThis.document } = {}) {
  return new Promise((resolve, reject) => {
    if (!doc) return reject(new Error("document がありません"));
    const name = `__artworkCallback${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const script = doc.createElement("script");
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      delete globalThis[name];
      script.remove();
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("時間切れ"));
    }, timeout);
    globalThis[name] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("読み込めません"));
    };
    script.src = url.includes("callback=") ? url : `${url}&callback=${name}`;
    script.src = script.src.replace(/callback=[^&]*/, `callback=${name}`);
    doc.head.appendChild(script);
  });
}

/**
 * 曲名とアーティスト名から、ジャケット画像の URL を探す。
 * 見つからなければ null。
 */
export async function findArtworkUrl(
  title,
  artist,
  { fetchImpl = globalThis.fetch, jsonpImpl = jsonp, size = 600, country = "JP" } = {}
) {
  if (!(title || "").trim()) return null;

  let payload = null;
  if (typeof fetchImpl === "function") {
    try {
      const res = await fetchImpl(buildSearchUrl(title, artist, { country }));
      if (res.ok) payload = await res.json();
    } catch {
      payload = null; // CORS で読めない場合などは JSONP を試す
    }
  }
  if (!payload && typeof jsonpImpl === "function") {
    try {
      payload = await jsonpImpl(buildSearchUrl(title, artist, { country, callback: "cb" }));
    } catch {
      return null;
    }
  }

  const match = pickResult(payload?.results, title, artist);
  return match ? upgradeArtworkUrl(match.artworkUrl100, size) : null;
}

/** YouTube の動画 ID からサムネイルの URL を作る（曲ページのリンクがあるとき用）。 */
export function youtubeThumbnailUrl(videoId) {
  return videoId ? `${YOUTUBE_THUMBNAIL}${videoId}/hqdefault.jpg` : "";
}
