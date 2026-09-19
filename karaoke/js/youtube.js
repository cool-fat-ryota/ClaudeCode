// YouTube Music のリンクを組み立てる / 自動で探す。

export const MUSIC_SEARCH = "https://music.youtube.com/search?q=";
export const MUSIC_WATCH = "https://music.youtube.com/watch?v=";
const DATA_API_SEARCH = "https://www.googleapis.com/youtube/v3/search";

const VIDEO_ID_RE =
  /(?:youtu\.be\/|(?:www\.|m\.)?(?:youtube\.com|music\.youtube\.com)\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/;

export function searchQuery(title, artist) {
  return [title, artist].map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

/** APIキーが無くても必ず開けるリンク（検索結果ページ）。 */
export function searchUrl(title, artist) {
  return MUSIC_SEARCH + encodeURIComponent(searchQuery(title, artist));
}

export function extractVideoId(url) {
  if (!url) return null;
  const match = VIDEO_ID_RE.exec(String(url).trim());
  return match ? match[1] : null;
}

/** 手入力されたリンクを music.youtube.com の形に揃える（YouTube以外はそのまま）。 */
export function normalizeUrl(url) {
  const trimmed = (url || "").trim();
  const videoId = extractVideoId(trimmed);
  return videoId ? MUSIC_WATCH + videoId : trimmed;
}

/**
 * YouTube Data API v3 で曲を検索し、その曲のページの URL を返す。
 * APIキーが無い・オフライン・見つからない場合は null。
 */
export async function findTrackUrl(title, artist, { apiKey = "", fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey || typeof fetchImpl !== "function") return null;
  const params = new URLSearchParams({
    part: "snippet",
    q: searchQuery(title, artist),
    type: "video",
    videoCategoryId: "10", // 音楽
    maxResults: "1",
    key: apiKey,
  });
  try {
    const res = await fetchImpl(`${DATA_API_SEARCH}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const videoId = data?.items?.[0]?.id?.videoId;
    return videoId ? MUSIC_WATCH + videoId : null;
  } catch {
    return null; // 通信できなければ検索リンクで十分
  }
}

/** 曲に設定するリンクを決める。戻り値の exact は曲ページを特定できたか。 */
export async function resolve(title, artist, options = {}) {
  const found = await findTrackUrl(title, artist, options);
  return found ? { url: found, exact: true } : { url: searchUrl(title, artist), exact: false };
}
