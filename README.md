# ClaudeCode

Claude Code で作ったアプリを置いている場所です。
GitHub Pages で配信していて、それぞれホーム画面に追加すると
アプリとして全画面で起動します（PWA）。

| アプリ | URL | 説明 |
| --- | --- | --- |
| [カラオケ レパートリー帳](karaoke/) | https://cool-fat-ryota.github.io/ClaudeCode/karaoke/ | 歌える曲と練習したい曲を、キーと感想つきで記録する |
| [あわ貯金](bubble_money/) | https://cool-fat-ryota.github.io/ClaudeCode/bubble_money/ | ほしいものを泡に閉じこめて、見送った金額をコインに変える |

入口ページ（https://cool-fat-ryota.github.io/ClaudeCode/ ）には両方へのリンクが並びます。

## ホーム画面に追加する

- **iPhone / iPad（Safari）**: 使いたいアプリの URL を開き、共有ボタン（□に↑）→「ホーム画面に追加」
- **Android（Chrome）**: メニュー（⋮）→「アプリをインストール」

記録はどちらも端末の中だけに保存され、外部のサーバーには送られません。

## 公開のしくみ

**Settings → Pages** で「Deploy from a branch」を選び、`claude/impulse-purchase-app-sif3y5` の
`/ (root)` を配信しています。このブランチに push すると、1分ほどで反映されます。

> `sw.js` は後片付け用です。以前ここ（直下）にあった「あわ貯金」の Service Worker が
> 端末に残っている場合に、古い登録とキャッシュを消すために置いています。
