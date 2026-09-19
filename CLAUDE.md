# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリについて

スマホ（主に iPhone）で使う PWA を並べて置く場所。**1アプリ＝直下の1フォルダ**で、
リポジトリ直下はアプリ一覧（入口ページ）。ビルドも依存パッケージもなく、
GitHub Pages が静的ファイルをそのまま配信する。

- 公開 URL: <https://cool-fat-ryota.github.io/ClaudeCode/>
- 各アプリの URL: `https://cool-fat-ryota.github.io/ClaudeCode/<アプリ名>/`
- 今あるアプリの一覧は `README.md`。アプリごとの中身の説明は各フォルダの `README.md` に置く
  （このファイルには個々のアプリの事情は書かない）

## 公開のしくみ

- **Settings → Pages** は「Deploy from a branch」で、`claude/impulse-purchase-app-sif3y5` の `/ (root)` を配信
- このブランチが公開ブランチ兼デフォルトブランチ。**push するとそのまま本番に出る**
  （Actions の "pages build and deployment" が走り、1分ほどで反映）
- PR は挟まず、このブランチへ直接 push している。コミットメッセージは日本語
- `.nojekyll` があるので Jekyll の処理は入らない

## アプリを増やすとき

1. 直下に `<アプリ名>/`（英小文字・スネークケース）を作り、そのアプリのファイルを**すべてその中に**入れる
   （`index.html` `sw.js` `manifest.webmanifest` `icons/` など。他のアプリと共有しない）
2. 参照はすべて相対パス（`./`）。サブディレクトリ配信で動くことが前提
3. `manifest` は `start_url` と `scope` を `"./"`、`display` は `standalone`
4. `sw.js` はそのアプリのフォルダに置く（Service Worker のスコープがそのフォルダに限定される）
5. 入口ページ `index.html` の一覧にカードを1つ足す（アイコンは `./<アプリ名>/icons/icon-192.png`）
6. 直下の `README.md` の表に1行足す
7. そのアプリに別の開発用リポジトリがある場合は、**そのアプリの README に明記**し、
   直したときは両方へ反映する

アプリを消す・名前を変えるときは、入口ページのカードと README の行も一緒に直す。
URL が変わるとホーム画面のアイコンは古い URL を指したままになるので、その旨を利用者に伝える。

## 全アプリが同じオリジンを共有している（いちばん注意する点）

`cool-fat-ryota.github.io` の配下に全アプリが同居するため、保存領域が全アプリで共有される。

- **Cache Storage**: 各 `sw.js` の後片付けは自分の接頭辞（`CACHE_PREFIX`、例 `<アプリ名>-`）のものだけにする。
  `caches.keys()` を全部消す実装にすると、他のアプリのオフライン用キャッシュまで消える（実際に起きた）
- **localStorage / IndexedDB**: 名前が衝突しないよう、アプリ名を含む固有の名前を付ける
- **Service Worker のスコープ**: アプリの `sw.js` は必ず自分のフォルダに置く。
  直下に置くとスコープが全アプリに及ぶ

## 入口ページ（直下）

`index.html` `manifest.webmanifest` `sw.js` `icons/` が入口ページ自身のファイル。
直下の `sw.js` はスコープが全体に及ぶため、**入口ページ自身のファイル以外には `respondWith` しない**
（それ以外はネットワークにそのまま任せる）。過去にここへ置かれていたアプリの
古いキャッシュを片付ける処理もここに入っている。

## iPhone (Safari) 向けの共通ルール

- `viewport` に `viewport-fit=cover`、余白は `env(safe-area-inset-*)`
- 入力欄の `font-size` は 16px（下回ると入力時に画面が拡大される）
- `backdrop-filter` は `-webkit-` を併記、`dvh` は `vh` のフォールバックを先に書く、`color-mix()` は使わない
- `[hidden] { display: none !important; }` を入れる（`.field { display: flex }` などに負けて効かなくなる）
- `<dialog>` + `showModal()` は iOS 15.4 以上。タップ領域は 40px 以上
- 記録は端末内だけに保存し、外部へは送らない。JSON の書き出し・読み込みを付け、
  `navigator.storage.persist()` も申請する

## アイコンの作り方

SVG を書き、Chromium で PNG にする（192 / 512 / maskable 512 / apple-touch 180 / favicon 32）。
`/opt/pw-browsers/chromium-*/chrome-linux/chrome` と `playwright-core` を使い、
サイズを指定したページに SVG を貼ってスクリーンショットを撮る。
Python だけで生成する例は `bubble_money/tools/make-icons.py`。

## 動作確認

GitHub Pages と同じ**サブディレクトリ配信**を再現して確認する
（`file://` では ES モジュールも Service Worker も動かない）。

```bash
mkdir -p /tmp/site && cp -r . /tmp/site/ClaudeCode
(cd /tmp/site && python3 -m http.server 8765)   # http://127.0.0.1:8765/ClaudeCode/
```

Service Worker まわりは Playwright（`playwright-core` ＋ 上記 Chromium）で、
iPhone サイズのビューポートを使い、次の2点を必ず見る。

- `context.setOffline(true)` でオフライン起動できること
- **複数のアプリを順に開いた後も、それぞれのキャッシュが残っていること**（消し合っていないこと）
