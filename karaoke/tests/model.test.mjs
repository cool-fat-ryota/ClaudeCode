import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyChanges,
  buildSong,
  computeStats,
  filterSongs,
  formatKey,
  formatKeyBadge,
  hasArtwork,
  missingArtists,
  sortSongs,
  suggestArtists,
  validateKey,
  validateRating,
  ValidationError,
  validateStatus,
} from "../js/model.js";
import { SEED_ARTISTS } from "../js/artist-seed.js";
import { normalize } from "../js/text.js";

const artists = SEED_ARTISTS.map(([name, reading], index) => ({
  id: index + 1,
  name,
  reading,
  searchKey: normalize(name),
  readingKey: normalize(reading),
}));

const song = (overrides = {}) => buildSong({ title: "Lemon", artist: "米津玄師", ...overrides });

describe("キーの表示と検証", () => {
  it("原キーとプラスマイナスを表示し分ける", () => {
    assert.equal(formatKey(0), "原キー");
    assert.equal(formatKey(2), "+2");
    assert.equal(formatKey(-3), "-3");
  });

  it("バッジでは原キーを ±0 と書く", () => {
    assert.equal(formatKeyBadge(0), "KEY ±0");
    assert.equal(formatKeyBadge(2), "KEY +2");
    assert.equal(formatKeyBadge(-3), "KEY -3");
  });

  it("文字列の +2 も受け付ける", () => {
    assert.equal(validateKey("+2"), 2);
    assert.equal(validateKey("-3"), -3);
    assert.equal(validateKey(""), 0);
    assert.equal(validateKey(undefined), 0);
  });

  it("範囲外や数値以外は弾く", () => {
    assert.throws(() => validateKey(13), ValidationError);
    assert.throws(() => validateKey(-13), ValidationError);
    assert.throws(() => validateKey("たかい"), ValidationError);
    assert.throws(() => validateKey(1.5), ValidationError);
  });
});

describe("自信度とリストの検証", () => {
  it("1〜5 と未設定を受け付ける", () => {
    assert.equal(validateRating(3), 3);
    assert.equal(validateRating(""), null);
    assert.equal(validateRating(null), null);
    assert.throws(() => validateRating(0), ValidationError);
    assert.throws(() => validateRating(6), ValidationError);
  });

  it("既定はレパートリー", () => {
    assert.equal(validateStatus(""), "repertoire");
    assert.equal(validateStatus("practice"), "practice");
    assert.throws(() => validateStatus("someday"), ValidationError);
  });
});

describe("曲の組み立て", () => {
  it("入力を整えて保存できる形にする", () => {
    const built = song({ key: "-2", impression: "  サビが高い  ", status: "practice" });
    assert.equal(built.title, "Lemon");
    assert.equal(built.key, -2);
    assert.equal(built.impression, "サビが高い");
    assert.equal(built.status, "practice");
    assert.equal(built.rating, null);
    assert.equal(built.lastSungOn, null);
  });

  it("曲名とアーティストは必須", () => {
    assert.throws(() => buildSong({ title: " ", artist: "米津玄師" }), ValidationError);
    assert.throws(() => buildSong({ title: "Lemon", artist: "  " }), ValidationError);
  });

  it("リンクを指定しなければ自動取得の対象になる", () => {
    assert.equal(song().youtubeAuto, true);
    assert.equal(song({ youtubeUrl: "https://music.youtube.com/watch?v=abcdefghijk" }).youtubeAuto, false);
  });
});

describe("ジャケット画像", () => {
  it("既定では画像なし", () => {
    const built = song();
    assert.equal(built.artwork, null);
    assert.equal(built.artworkUrl, "");
    assert.equal(built.artworkSource, null);
    assert.equal(hasArtwork(built), false);
  });

  it("URL だけでも画像ありとみなす", () => {
    assert.equal(hasArtwork(song({ artworkUrl: "https://example.com/a.jpg" })), true);
  });

  it("あとから設定・削除できる", () => {
    const withArt = applyChanges(song(), {
      artwork: "（Blob のかわり）",
      artworkUrl: "https://example.com/a.jpg",
      artworkSource: "manual",
    });
    assert.equal(withArt.artworkSource, "manual");
    assert.equal(hasArtwork(withArt), true);

    const cleared = applyChanges(withArt, { artwork: null, artworkUrl: "", artworkSource: null });
    assert.equal(hasArtwork(cleared), false);
  });
});

describe("曲の更新", () => {
  it("指定した項目だけ書き換える", () => {
    const before = song({ impression: "むずかしい" });
    const after = applyChanges(before, { rating: 5, key: "+1" });
    assert.equal(after.rating, 5);
    assert.equal(after.key, 1);
    assert.equal(after.impression, "むずかしい");
    assert.equal(after.title, before.title);
  });

  it("未知の項目は無視する", () => {
    const after = applyChanges(song(), { nonsense: 1 });
    assert.equal(after.title, "Lemon");
  });

  it("自分でリンクを入れると自動更新を止め、空にすると戻る", () => {
    const manual = applyChanges(song(), { youtubeUrl: "https://music.youtube.com/watch?v=abcdefghijk" });
    assert.equal(manual.youtubeAuto, false);
    assert.equal(applyChanges(manual, { youtubeUrl: "" }).youtubeAuto, true);
  });

  it("更新日時が進む", () => {
    const before = song();
    const after = applyChanges(before, { rating: 3 }, { now: "2030-01-01T00:00:00.000Z" });
    assert.equal(after.updatedAt, "2030-01-01T00:00:00.000Z");
    assert.equal(after.createdAt, before.createdAt);
  });

  it("不正な値は弾く", () => {
    assert.throws(() => applyChanges(song(), { title: "" }), ValidationError);
    assert.throws(() => applyChanges(song(), { key: 99 }), ValidationError);
  });
});

describe("絞り込みと並び替え", () => {
  const songs = [
    song({ title: "Lemon", impression: "高音がつらい" }),
    song({ title: "群青", artist: "YOASOBI", status: "practice" }),
    song({ title: "ドライフラワー", artist: "優里", status: "practice", rating: 5 }),
  ];

  it("リストで絞り込む", () => {
    assert.deepEqual(filterSongs(songs, { status: "practice" }).map((s) => s.title), ["群青", "ドライフラワー"]);
  });

  it("曲名・アーティスト・感想を横断して検索する", () => {
    assert.deepEqual(filterSongs(songs, { query: "高音" }).map((s) => s.title), ["Lemon"]);
    assert.deepEqual(filterSongs(songs, { query: "yoasobi" }).map((s) => s.title), ["群青"]);
  });

  it("アーティストのよみがなでも探せる", () => {
    assert.deepEqual(filterSongs(songs, { query: "ゆうり" }, artists).map((s) => s.title), ["ドライフラワー"]);
    assert.deepEqual(filterSongs(songs, { query: "ユウリ" }, artists).map((s) => s.title), ["ドライフラワー"]);
    assert.deepEqual(filterSongs(songs, { query: "よねづ" }, artists).map((s) => s.title), ["Lemon"]);
  });

  it("リストと検索を組み合わせられる", () => {
    assert.deepEqual(filterSongs(songs, { status: "practice", query: "ゆうり" }, artists).map((s) => s.title), ["ドライフラワー"]);
  });

  it("曲名順・アーティスト順・自信度順に並べ替える", () => {
    // 日本語の並び順（英字 → かな → 漢字）
    assert.deepEqual(sortSongs(songs, "title").map((s) => s.title), ["Lemon", "ドライフラワー", "群青"]);
    assert.deepEqual(sortSongs(songs, "artist")[0].artist, "YOASOBI");
    assert.equal(sortSongs(songs, "rating")[0].title, "ドライフラワー");
  });

  it("元の配列を壊さない", () => {
    const original = [...songs];
    sortSongs(songs, "title");
    assert.deepEqual(songs, original);
  });
});

describe("集計", () => {
  it("リストごとの曲数とアーティスト数を数える", () => {
    const stats = computeStats([
      song({ title: "Lemon" }),
      song({ title: "感電" }),
      song({ title: "群青", artist: "YOASOBI", status: "practice" }),
    ]);
    assert.deepEqual(stats, { total: 3, repertoire: 2, practice: 1, artists: 2 });
  });

  it("空でも数えられる", () => {
    assert.deepEqual(computeStats([]), { total: 0, repertoire: 0, practice: 0, artists: 0 });
  });
});

describe("アーティストの入力補完", () => {
  const names = (query, songs = []) => suggestArtists(artists, query, songs).map((a) => a.name);

  it("漢字・ひらがな・カタカナ・ローマ字のどれでも探せる", () => {
    assert.ok(names("米津").includes("米津玄師"));
    assert.ok(names("よねづ").includes("米津玄師"));
    assert.ok(names("ヨル").includes("ヨルシカ"));
    assert.ok(names("よる").includes("ヨルシカ"));
    assert.ok(names("yoas").includes("YOASOBI"));
    assert.ok(names("ＹＯＡＳＯＢＩ").includes("YOASOBI"));
  });

  it("途中の文字でも拾える", () => {
    assert.ok(names("髭男").includes("Official髭男dism"));
  });

  it("前方一致を先に出す", () => {
    assert.equal(names("ばっく")[0], "back number");
  });

  it("よく歌っているアーティストを優先する", () => {
    const songs = [song({ artist: "YOASOBI" }), song({ artist: "YOASOBI" })];
    assert.equal(names("", songs)[0], "YOASOBI");
  });

  it("よみがな未登録のアーティストが上位を占めない", () => {
    const withoutReading = [...artists, { id: 999, name: "新しいバンド", reading: "", searchKey: "新しいばんど", readingKey: "" }];
    const top = suggestArtists(withoutReading, "", [song({ artist: "YOASOBI" })])[0];
    assert.equal(top.name, "YOASOBI");
  });

  it("件数を絞れる", () => {
    assert.equal(suggestArtists(artists, "", [], 3).length, 3);
  });

  it("該当が無ければ空", () => {
    assert.deepEqual(names("そんなアーティストはいない"), []);
  });

  it("曲数を一緒に返す", () => {
    const [top] = suggestArtists(artists, "米津", [song(), song({ title: "感電" })]);
    assert.equal(top.songCount, 2);
  });
});

describe("取り込み時の未登録アーティスト", () => {
  it("候補に無い名前だけを拾う", () => {
    const songs = [song({ artist: "米津玄師" }), song({ artist: "架空バンド" }), song({ artist: "架空バンド" })];
    assert.deepEqual(missingArtists(artists, songs), ["架空バンド"]);
  });
});
