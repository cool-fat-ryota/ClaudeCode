// 画像を小さくして端末内に保存できる形（JPEG の Blob）にする。
// 端末の写真はそのままだと大きすぎるため、正方形に切り出して縮小する。

const DEFAULT_SIZE = 320; // 表示は最大160px想定なので、その2倍
const DEFAULT_QUALITY = 0.82;

async function loadImage(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // 古い環境では img 要素で読み込む
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * File / Blob / 画像の URL から、正方形のサムネイル（JPEG の Blob）を作る。
 * URL の場合、取得できない（他のサイトが許可していない）ときは例外になる。
 */
export async function toThumbnail(source, { size = DEFAULT_SIZE, quality = DEFAULT_QUALITY, fetchImpl = globalThis.fetch } = {}) {
  const blob =
    typeof source === "string" ? await fetchImpl(source, { mode: "cors" }).then((res) => {
      if (!res.ok) throw new Error(`画像を取得できませんでした (${res.status})`);
      return res.blob();
    }) : source;

  const image = await loadImage(blob);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const side = Math.min(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  // 中央を正方形に切り出して描く
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
  if (typeof image.close === "function") image.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("画像を作れませんでした。"))),
      "image/jpeg",
      quality
    );
  });
}

/** バックアップに入れられるよう、Blob を data URL の文字列にする。 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
}

/** バックアップから読み込んだ data URL を Blob に戻す。 */
export async function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const response = await fetch(dataUrl);
  return response.blob();
}
