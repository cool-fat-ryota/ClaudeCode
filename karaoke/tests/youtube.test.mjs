import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractVideoId, findTrackUrl, normalizeUrl, resolve, searchQuery, searchUrl } from "../js/youtube.js";

const WATCH = "https://music.youtube.com/watch?v=SX_ViT4Ra7k";

describe("検索リンク", () => {
  it("曲名とアーティストを含む", () => {
    const url = searchUrl("Lemon", "米津玄師");
    assert.ok(url.startsWith("https://music.youtube.com/search?q="));
    assert.ok(decodeURIComponent(url).includes("Lemon 米津玄師"));
  });

  it("アーティストが空でも組み立てられる", () => {
    assert.equal(searchQuery("Lemon", "  "), "Lemon");
  });
});

describe("リンクの正規化", () => {
  it("いろいろな形の YouTube リンクから ID を取り出す", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=SX_ViT4Ra7k",
      "https://www.youtube.com/watch?app=desktop&v=SX_ViT4Ra7k",
      "https://youtu.be/SX_ViT4Ra7k?t=30",
      "https://music.youtube.com/watch?v=SX_ViT4Ra7k&list=RDAMVM",
      "https://m.youtube.com/watch?v=SX_ViT4Ra7k",
      "https://www.youtube.com/shorts/SX_ViT4Ra7k",
    ]) {
      assert.equal(normalizeUrl(url), WATCH, url);
    }
  });

  it("YouTube 以外のリンクはそのまま", () => {
    assert.equal(normalizeUrl(" https://example.com/song "), "https://example.com/song");
  });

  it("空の入力", () => {
    assert.equal(normalizeUrl(""), "");
    assert.equal(extractVideoId(""), null);
  });
});

describe("リンクの自動取得", () => {
  const okResponse = {
    ok: true,
    json: async () => ({ items: [{ id: { videoId: "SX_ViT4Ra7k" } }] }),
  };

  it("APIキーが無ければ検索リンクを返す", async () => {
    const { url, exact } = await resolve("Lemon", "米津玄師");
    assert.equal(exact, false);
    assert.ok(url.includes("/search?q="));
  });

  it("APIキーがあれば曲ページを返す", async () => {
    const { url, exact } = await resolve("Lemon", "米津玄師", { apiKey: "dummy", fetchImpl: async () => okResponse });
    assert.equal(exact, true);
    assert.equal(url, WATCH);
  });

  it("検索クエリをAPIへ渡す", async () => {
    let requested = "";
    await findTrackUrl("Lemon", "米津玄師", {
      apiKey: "dummy",
      fetchImpl: async (url) => {
        requested = url;
        return okResponse;
      },
    });
    const params = new URL(requested).searchParams;
    assert.equal(params.get("q"), "Lemon 米津玄師");
    assert.equal(params.get("videoCategoryId"), "10");
    assert.equal(params.get("key"), "dummy");
  });

  it("オフラインなら検索リンクに退避する", async () => {
    const { url, exact } = await resolve("Lemon", "米津玄師", {
      apiKey: "dummy",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(exact, false);
    assert.ok(url.includes("/search?q="));
  });

  it("エラー応答や該当なしでも落ちない", async () => {
    assert.equal(await findTrackUrl("x", "y", { apiKey: "k", fetchImpl: async () => ({ ok: false }) }), null);
    assert.equal(
      await findTrackUrl("x", "y", { apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) }),
      null
    );
  });
});
