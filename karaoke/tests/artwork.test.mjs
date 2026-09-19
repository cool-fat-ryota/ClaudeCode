import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSearchUrl,
  findArtworkUrl,
  pickResult,
  upgradeArtworkUrl,
  youtubeThumbnailUrl,
} from "../js/artwork.js";

const result = (trackName, artistName, artworkUrl100 = "https://is1-ssl.mzstatic.com/image/thumb/aaa/100x100bb.jpg") => ({
  trackName,
  artistName,
  artworkUrl100,
});

const okResponse = (payload) => ({ ok: true, json: async () => payload });

describe("検索 URL", () => {
  it("曲名とアーティストを1つの語として渡す", () => {
    const url = new URL(buildSearchUrl("Lemon", "米津玄師"));
    assert.equal(url.searchParams.get("term"), "Lemon 米津玄師");
    assert.equal(url.searchParams.get("country"), "JP");
    assert.equal(url.searchParams.get("entity"), "song");
  });

  it("JSONP のときだけ callback が付く", () => {
    assert.equal(new URL(buildSearchUrl("A", "B")).searchParams.get("callback"), null);
    assert.equal(new URL(buildSearchUrl("A", "B", { callback: "cb" })).searchParams.get("callback"), "cb");
  });
});

describe("画像 URL の大きさ", () => {
  it("100x100 を指定の大きさに差し替える", () => {
    assert.equal(
      upgradeArtworkUrl("https://is1-ssl.mzstatic.com/image/thumb/aaa/100x100bb.jpg", 600),
      "https://is1-ssl.mzstatic.com/image/thumb/aaa/600x600bb.jpg"
    );
    assert.equal(
      upgradeArtworkUrl("https://is1-ssl.mzstatic.com/image/thumb/aaa/60x60bb.png", 300),
      "https://is1-ssl.mzstatic.com/image/thumb/aaa/300x300bb.png"
    );
  });

  it("空なら空のまま", () => {
    assert.equal(upgradeArtworkUrl(""), "");
  });
});

describe("検索結果の選び方", () => {
  it("曲名とアーティストが一致するものを選ぶ", () => {
    const chosen = pickResult(
      [result("Lemon", "だれか"), result("Lemon", "米津玄師"), result("パプリカ", "米津玄師")],
      "Lemon",
      "米津玄師"
    );
    assert.equal(chosen.artistName, "米津玄師");
    assert.equal(chosen.trackName, "Lemon");
  });

  it("表記ゆれ（カタカナ・大文字小文字）でも拾える", () => {
    const chosen = pickResult([result("ヨルシカ", "ヨルシカ"), result("花に亡霊", "ヨルシカ")], "花に亡霊", "よるしか");
    assert.equal(chosen.trackName, "花に亡霊");
  });

  it("かすりもしない結果は採用しない", () => {
    assert.equal(pickResult([result("まったく別の曲", "別のアーティスト")], "Lemon", "米津玄師"), null);
  });

  it("画像が無い結果は無視する", () => {
    assert.equal(pickResult([{ trackName: "Lemon", artistName: "米津玄師" }], "Lemon", "米津玄師"), null);
  });

  it("空の結果", () => {
    assert.equal(pickResult([], "Lemon", "米津玄師"), null);
    assert.equal(pickResult(undefined, "Lemon", "米津玄師"), null);
  });
});

describe("ジャケット画像を探す", () => {
  it("見つかれば大きい画像の URL を返す", async () => {
    const url = await findArtworkUrl("Lemon", "米津玄師", {
      fetchImpl: async () => okResponse({ results: [result("Lemon", "米津玄師")] }),
      jsonpImpl: null,
    });
    assert.equal(url, "https://is1-ssl.mzstatic.com/image/thumb/aaa/600x600bb.jpg");
  });

  it("ブラウザから直接読めないときは JSONP で取り直す", async () => {
    let jsonpCalled = false;
    const url = await findArtworkUrl("Lemon", "米津玄師", {
      fetchImpl: async () => {
        throw new Error("CORS");
      },
      jsonpImpl: async (requested) => {
        jsonpCalled = true;
        assert.ok(requested.includes("callback="));
        return { results: [result("Lemon", "米津玄師")] };
      },
    });
    assert.ok(jsonpCalled);
    assert.equal(url, "https://is1-ssl.mzstatic.com/image/thumb/aaa/600x600bb.jpg");
  });

  it("どちらも失敗したら null", async () => {
    const url = await findArtworkUrl("Lemon", "米津玄師", {
      fetchImpl: async () => {
        throw new Error("offline");
      },
      jsonpImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(url, null);
  });

  it("曲名が空なら探さない", async () => {
    let called = false;
    const url = await findArtworkUrl("  ", "米津玄師", {
      fetchImpl: async () => {
        called = true;
        return okResponse({ results: [] });
      },
    });
    assert.equal(url, null);
    assert.equal(called, false);
  });

  it("該当する曲が無ければ null", async () => {
    const url = await findArtworkUrl("Lemon", "米津玄師", {
      fetchImpl: async () => okResponse({ results: [result("別の曲", "別の人")] }),
      jsonpImpl: null,
    });
    assert.equal(url, null);
  });
});

describe("YouTube のサムネイル", () => {
  it("動画 ID から URL を作る", () => {
    assert.equal(youtubeThumbnailUrl("SX_ViT4Ra7k"), "https://i.ytimg.com/vi/SX_ViT4Ra7k/hqdefault.jpg");
    assert.equal(youtubeThumbnailUrl(null), "");
  });
});
