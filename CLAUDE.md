# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリについて

スマホ（主に iPhone）で使う PWA を並べて置く場所。各アプリはビルド不要の静的ファイルで、
GitHub Pages がそのまま配信している。記録はすべて利用者の端末内に保存し、外部へは送らない。

- 公開 URL: <https://cool-fat-ryota.github.io/ClaudeCode/>（直下が入口ページ＝アプリ一覧）
- `karaoke/` … カラオケ レパートリー帳
- `bubble_money/` … あわ貯金

## 公開のしくみ

- **Settings → Pages** は「Deploy from a branch」で、`claude/impulse-purchase-app-sif3y5` の `/ (root)` を配信している
- このブランチが公開ブランチ兼デフォルトブランチ。**push するとそのまま本番に出る**
  （Actions の "pages build and deployment" が走り、1分ほどで反映）
- PR は挟まず、このブランチへ直接 push している。コミットメッセージは日本語
- `.nojekyll` があるので Jekyll の処理は入らない

## 全アプリが同じオリジンを共有している（いちばん注意する点）

`cool-fat-ryota.github.io` 配下に全アプリが同居するため、次が全アプリで共有される。

- **Cache Storage**: 各 `sw.js` の後片付けは自分の接頭辞（`CACHE_PREFIX`）のものだけにする。
  `caches.keys()` を全部消す実装にすると、他のアプリのオフライン用キャッシュまで消える（実際に起きた）
- **localStorage / IndexedDB**: 名前が衝突しないよう、アプリ固有の名前を付ける
  （例: IndexedDB `karaoke-repertory` / Cache `karaoke-repertory-v2`・`awa-chokin-v1`）
- **Service Worker のスコープ**: 各アプリの `sw.js` は自分のフォルダに置く（スコープがそのフォルダに限定される）。
  直下の `sw.js` はスコープが全体に及ぶので、入口ページ自身のファイル以外には `respondWith` しない

## アプリを追加するとき

1. `アプリ名/`（英小文字・スネークケース）を作り、`index.html` `sw.js` `manifest` `icons/` をその中に入れる
2. 参照はすべて相対パス（`./`）。サブディレクトリ配信で動くことが前提
3. manifest は `start_url` と `scope` を `"./"`、`display` は `standalone`
4. 入口ページ `index.html` の一覧にカードを1つ足す（アイコンは `./アプリ名/icons/icon-192.png`）
5. ルートの `README.md` の表にも1行足す

## iPhone (Safari) 向けの決まりごと

- `viewport` に `viewport-fit=cover`、余白は `env(safe-area-inset-*)`
- 入力欄の `font-size` は 16px（下回ると入力時に画面が拡大される）
- `backdrop-filter` は `-webkit-` を併記、`dvh` は `vh` のフォールバックを先に書く、`color-mix()` は使わない
- `[hidden] { display: none !important; }` を入れる（`.field { display: flex }` などに負けて効かなくなる）
- `<dialog>` + `showModal()` は iOS 15.4 以上。タップ領域は 40px 以上
- 記録は端末内だけなので、JSON の書き出し・読み込みを付ける。`navigator.storage.persist()` も申請する

## アイコンの作り方

SVG を書き、Chromium で PNG にする（192 / 512 / maskable 512 / apple-touch 180 / favicon 32）。
`/opt/pw-browsers/chromium-*/chrome-linux/chrome` と `playwright-core` を使って、
サイズ指定のページに SVG を貼ってスクリーンショットを撮る。
`bubble_money/tools/make-icons.py` は Python だけで生成する版。

## 動作確認

GitHub Pages と同じ**サブディレクトリ配信**を再現して確認する
（`file://` では ES モジュールも Service Worker も動かない）。

```bash
mkdir -p /tmp/site && cp -r . /tmp/site/ClaudeCode
(cd /tmp/site && python3 -m http.server 8765)   # http://127.0.0.1:8765/ClaudeCode/
```

Service Worker まわりは Playwright（`playwright-core` ＋ 上記 Chromium）で、
`context.setOffline(true)` でのオフライン起動と、
複数アプリを順に開いた後もそれぞれのキャッシュが残っていることを確認する。

## 各アプリのメモ

### karaoke/ — カラオケ レパートリー帳

- 開発用リポジトリは private の `cool-fat-ryota/karaoke_repertory`（テストと履歴はそちら）。
  **直したら両方に反映する**。公開側へ持ってくるのは
  `index.html` `styles.css` `sw.js` `manifest.webmanifest` `js/` `icons/` `fonts/`
- テスト: `cd karaoke && npm test`（Node 標準のテストランナー、依存パッケージなし）
- データは IndexedDB `karaoke-repertory`。見出しに Bebas Neue を同梱（`fonts/`, SIL OFL）

### bubble_money/ — あわ貯金

- 単一の `app.js`。データは localStorage、写真は縮小して端末内に保存
- 以前はリポジトリ直下にあったため、直下の `sw.js` にその頃の古いキャッシュを片付ける処理が入っている
