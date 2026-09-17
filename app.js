/* クールダウン貯金 — 欲しいものを寝かせて、見送った金額を貯める */
(function () {
  'use strict';

  var KEY = 'cooldown-wishlist-v1';
  var DAY = 86400000;
  var CATS = ['ガジェット', 'ファッション', '趣味・娯楽', '食・飲みもの', '日用品', 'その他'];

  /* ---- 冷却期間のルール（金額が大きいほど長く寝かせる） ---- */
  function autoCoolDays(price) {
    if (price < 1000) return 1;
    if (price < 5000) return 3;
    if (price < 20000) return 7;
    if (price < 50000) return 14;
    return 30;
  }

  /* ---- 保存 ---- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.items)) return data;
      }
    } catch (e) { /* 使えない環境でも動かす */ }
    return sampleState();
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('保存できませんでした。写真の枚数が多いと容量の上限に達することがあります。古いものを削除してください。');
      return false;
    }
  }

  /* ---- 画像（端末の中だけで縮小して持つ） ---- */
  var MAX_EDGE = 720;
  function readImage(file, done) {
    if (!file || file.type.indexOf('image/') !== 0) {
      toast('画像ファイルを選んでください。');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { toast('画像を読み込めませんでした。'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { toast('この画像は表示できない形式でした。'); };
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          done(canvas.toDataURL('image/jpeg', 0.72));
        } catch (e) {
          toast('この画像は取り込めませんでした。');
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sampleState() {
    var now = Date.now();
    return {
      sample: true,
      goal: { name: '旅行の資金', amount: 100000 },
      items: [
        {
          id: uid(), name: 'ワイヤレスイヤホン', price: 24800, category: 'ガジェット',
          url: '', reason: '今のイヤホンの充電が持たなくなってきたから',
          createdAt: now - 8 * DAY, coolMs: 7 * DAY, status: 'cooling',
          checkins: [
            { at: now - 8 * DAY, urge: 5 },
            { at: now - 5 * DAY, urge: 4 },
            { at: now - 1 * DAY, urge: 2 }
          ]
        },
        {
          id: uid(), name: 'ランニングシューズ', price: 13200, category: 'ファッション',
          url: '', reason: 'セールで30%オフになっていた',
          createdAt: now - 2 * DAY, coolMs: 7 * DAY, status: 'cooling',
          checkins: [{ at: now - 2 * DAY, urge: 4 }, { at: now - 6 * 3600000, urge: 3 }]
        },
        {
          id: uid(), name: '電動コーヒーミル', price: 6480, category: '趣味・娯楽',
          url: '', reason: '動画で見て良さそうだった',
          createdAt: now - 10 * 3600000, coolMs: 3 * DAY, status: 'cooling',
          checkins: [{ at: now - 10 * 3600000, urge: 3 }]
        },
        {
          id: uid(), name: 'ゲーミングチェア', price: 32000, category: '日用品',
          url: '', reason: '座り心地が良さそうだった',
          createdAt: now - 24 * DAY, coolMs: 14 * DAY, status: 'passed',
          decidedAt: now - 10 * DAY, checkins: [{ at: now - 24 * DAY, urge: 4 }]
        },
        {
          id: uid(), name: '写真編集ソフト（買い切り）', price: 9800, category: 'ガジェット',
          url: '', reason: 'セール中だったから',
          createdAt: now - 47 * DAY, coolMs: 7 * DAY, status: 'passed',
          decidedAt: now - 40 * DAY, checkins: [{ at: now - 47 * DAY, urge: 3 }]
        },
        {
          id: uid(), name: '電気圧力鍋', price: 11000, category: '日用品',
          url: '', reason: '平日の自炊がラクになりそう',
          createdAt: now - 27 * DAY, coolMs: 7 * DAY, status: 'bought',
          decidedAt: now - 20 * DAY, satisfaction: 5, checkins: [{ at: now - 27 * DAY, urge: 4 }]
        }
      ]
    };
  }

  /* ---- 表示用のユーティリティ ---- */
  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function human(ms) {
    if (ms <= 0) return '判定できます';
    var d = Math.floor(ms / DAY);
    var h = Math.floor((ms % DAY) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return 'あと ' + d + '日 ' + h + '時間';
    if (h > 0) return 'あと ' + h + '時間 ' + m + '分';
    return 'あと ' + Math.max(m, 1) + '分';
  }

  function dateLabel(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u || '') ? u : '';
  }

  function isReady(item) {
    return item.status === 'cooling' && Date.now() >= item.createdAt + item.coolMs;
  }

  function by(status) {
    return state.items.filter(function (i) { return i.status === status; });
  }

  function savedTotal() {
    return by('passed').reduce(function (s, i) { return s + i.price; }, 0);
  }

  /* ---- 状態 ---- */
  var state = load();
  var tab = 'cooling';
  var pendingDelete = null;
  var draftImage = null;   // 追加シートで選んだ写真
  var photoTarget = null;  // 'new' か item.id
  var lightboxId = null;
  var shownTotal = savedTotal();

  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');

  /* ---- ヘッダーの集計 ---- */
  function renderHero() {
    var total = savedTotal();
    countTo(total);

    var now = new Date();
    var month = by('passed').filter(function (i) {
      var d = new Date(i.decidedAt || i.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).reduce(function (s, i) { return s + i.price; }, 0);

    var passed = by('passed').length;
    var bought = by('bought').length;
    var decided = passed + bought;
    var cooling = by('cooling');
    var coolingSum = cooling.reduce(function (s, i) { return s + i.price; }, 0);

    $('statMonth').textContent = yen(month);
    $('statRate').textContent = decided ? Math.round((passed / decided) * 100) + '%' : '—';
    $('labelCooling').textContent = '冷却中 ' + cooling.length + '件';
    $('statCooling').textContent = yen(coolingSum);
    $('c-cooling').textContent = cooling.length;
    $('c-passed').textContent = passed;
    $('c-bought').textContent = bought;
    $('sampleBanner').hidden = !state.sample;

    var goal = state.goal;
    if (goal && goal.amount > 0) {
      var pct = Math.min(100, (total / goal.amount) * 100);
      var left = Math.max(0, goal.amount - total);
      $('goalBox').innerHTML =
        '<div class="goal-head"><span>目標：<b>' + esc(goal.name) + '</b></span>' +
        '<span class="goal-num">' + (left > 0 ? 'あと ' + yen(left) : '達成！') + ' / ' + yen(goal.amount) + '</span></div>' +
        '<div class="goal-track"><div class="goal-fill" style="width:' + pct.toFixed(1) + '%"></div></div>';
    } else {
      $('goalBox').innerHTML =
        '<button class="goal-set" type="button" data-act="goto-goal">貯めたものの使いみちを決める</button>';
    }
  }

  function countTo(target) {
    var el = $('savedTotal');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var from = shownTotal;
    shownTotal = target;
    if (reduce || from === target) { el.textContent = yen(target); return; }
    var start = performance.now();
    var dur = 650;
    el.classList.add('pop');
    setTimeout(function () { el.classList.remove('pop'); }, 520);
    (function step(t) {
      var p = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = yen(from + (target - from) * e);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---- カード ---- */
  function spark(checkins) {
    if (!checkins || checkins.length < 2) return '';
    var w = 64, h = 20, pad = 3, n = checkins.length;
    var pts = checkins.map(function (c, i) {
      var x = pad + (w - pad * 2) * (i / (n - 1));
      var y = pad + (h - pad * 2) * (1 - (c.urge - 1) / 4);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var last = checkins[n - 1];
    var ly = (pad + (h - pad * 2) * (1 - (last.urge - 1) / 4)).toFixed(1);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + (w - pad) + '" cy="' + ly + '" r="2.5" fill="currentColor"/></svg>';
  }

  function thumb(item, past) {
    if (!item.image || item.image.indexOf('data:image/') !== 0) return '';
    return '<img class="thumb' + (past ? ' is-past' : '') + '" src="' + item.image +
      '" alt="' + esc(item.name) + 'の写真" data-act="zoom" data-id="' + item.id + '">';
  }

  function cardHead(item, past, metaHtml) {
    return '<div class="card-top">' + thumb(item, past) +
      '<div class="card-head"><div class="title-row">' +
      '<h3 class="card-name">' + esc(item.name) + '</h3>' +
      '<span class="card-price">' + yen(item.price) + '</span></div>' +
      metaHtml + '</div></div>';
  }

  function metaLine(item) {
    var bits = ['<span class="chip">' + esc(item.category) + '</span>'];
    bits.push('<span>' + dateLabel(item.createdAt) + 'に保留</span>');
    var u = safeUrl(item.url);
    if (u) bits.push('<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">商品ページ</a>');
    return '<div class="meta">' + bits.join('') + '</div>';
  }

  function reasonBlock(item) {
    if (!item.reason) return '';
    return '<p class="reason"><span class="reason-label">欲しいと思った理由</span>' + esc(item.reason) + '</p>';
  }

  function deleteBtn(item) {
    var armed = pendingDelete === item.id;
    return '<button class="btn btn-sm ' + (armed ? 'btn-danger' : 'btn-quiet') + '" type="button" data-act="' +
      (armed ? 'delete' : 'arm-delete') + '" data-id="' + item.id + '">' +
      (armed ? '本当に消す' : '削除') + '</button>';
  }

  function coolingCard(item) {
    var ready = isReady(item);
    var end = item.createdAt + item.coolMs;
    var left = end - Date.now();
    var pct = Math.min(100, Math.max(0, ((Date.now() - item.createdAt) / item.coolMs) * 100));
    var checkins = item.checkins || [];
    var last = checkins.length ? checkins[checkins.length - 1].urge : null;
    var first = checkins.length ? checkins[0].urge : null;

    var note = '';
    if (last != null && last <= 2) {
      note = '<p class="cooled-note">熱が下がっています。ここで見送れば ' + yen(item.price) + ' が貯まります。</p>';
    } else if (ready) {
      note = '<p class="cooled-note">冷却おわり。いま見ても本当に欲しいですか？</p>';
    }

    var dots = '';
    for (var v = 1; v <= 5; v++) {
      dots += '<button class="dot' + (last === v ? ' is-on' : '') + '" type="button" data-act="urge" data-id="' +
        item.id + '" data-v="' + v + '" aria-label="欲しい度 ' + v + '">' + v + '</button>';
    }

    var trend = '';
    if (checkins.length >= 2) {
      var diff = last - first;
      trend = '<span class="trend">' + spark(checkins) +
        (diff < 0 ? '−' + Math.abs(diff) + ' 下がった' : diff > 0 ? '+' + diff + ' 上がった' : '変化なし') + '</span>';
    }

    return '<article class="card' + (ready ? ' is-ready' : '') + '">' +
      cardHead(item, false, metaLine(item)) + reasonBlock(item) +
      '<div class="cool"><div class="cool-head">' +
      '<span class="cool-left">' + (ready ? '冷却おわり' : '冷却中') + '</span>' +
      '<span class="cool-right">' + human(left) + '</span></div>' +
      '<div class="cool-track"><div class="cool-fill" style="width:' + pct.toFixed(1) + '%"></div></div></div>' +
      note +
      '<div class="urge"><span class="urge-label">いまの欲しい度</span>' +
      '<div class="dots">' + dots + '</div>' + trend + '</div>' +
      '<div class="actions">' +
      '<button class="btn btn-pass" type="button" data-act="pass" data-id="' + item.id + '">見送る（' + yen(item.price) + ' 貯める）</button>' +
      '<button class="btn" type="button" data-act="buy" data-id="' + item.id + '">' + (ready ? '買う' : '待てずに買う') + '</button>' +
      '<span class="spacer"></span>' +
      (item.image ? '' : '<button class="btn btn-sm btn-quiet" type="button" data-act="add-photo" data-id="' + item.id + '">写真を追加</button>') +
      deleteBtn(item) +
      '</div></article>';
  }

  function passedCard(item) {
    var waited = Math.max(0, Math.round(((item.decidedAt || Date.now()) - item.createdAt) / DAY));
    return '<article class="card">' +
      cardHead(item, true, '<div class="meta"><span class="chip">' + esc(item.category) + '</span>' +
        '<span>' + dateLabel(item.decidedAt || item.createdAt) + 'に見送り・' + waited + '日寝かせた</span></div>') +
      reasonBlock(item) +
      '<div class="actions"><button class="btn btn-sm btn-quiet" type="button" data-act="undo" data-id="' + item.id + '">判定をもどす</button>' +
      '<span class="spacer"></span>' + deleteBtn(item) + '</div></article>';
  }

  function boughtCard(item) {
    var dots = '';
    for (var v = 1; v <= 5; v++) {
      dots += '<button class="dot' + (item.satisfaction === v ? ' is-on' : '') + '" type="button" data-act="sat" data-id="' +
        item.id + '" data-v="' + v + '" aria-label="満足度 ' + v + '">' + v + '</button>';
    }
    var verdict = '';
    if (item.satisfaction != null) {
      verdict = item.satisfaction >= 4
        ? '<p class="cooled-note">買ってよかった買い物。こういうものにはお金を使っていい。</p>'
        : item.satisfaction <= 2
          ? '<p class="cooled-note" style="color:var(--alert)">後悔した買い物。次に似たものが欲しくなったら思い出す。</p>'
          : '';
    }
    return '<article class="card">' +
      cardHead(item, false, '<div class="meta"><span class="chip">' + esc(item.category) + '</span>' +
        '<span>' + dateLabel(item.decidedAt || item.createdAt) + 'に購入</span></div>') +
      '<div class="urge"><span class="urge-label">買ってみて満足だった？</span><div class="dots">' + dots + '</div></div>' +
      verdict +
      '<div class="actions"><button class="btn btn-sm btn-quiet" type="button" data-act="undo" data-id="' + item.id + '">判定をもどす</button>' +
      '<span class="spacer"></span>' +
      (item.image ? '' : '<button class="btn btn-sm btn-quiet" type="button" data-act="add-photo" data-id="' + item.id + '">写真を追加</button>') +
      deleteBtn(item) + '</div></article>';
  }

  /* ---- ふりかえり ---- */
  function monthChart() {
    var now = new Date();
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth(), total: 0 });
    }
    by('passed').forEach(function (it) {
      var d = new Date(it.decidedAt || it.createdAt);
      months.forEach(function (mo) {
        if (mo.y === d.getFullYear() && mo.m === d.getMonth()) mo.total += it.price;
      });
    });
    var max = Math.max.apply(null, months.map(function (m) { return m.total; }).concat([1]));
    var bars = months.map(function (mo) {
      var h = mo.total ? Math.max(4, (mo.total / max) * 100) : 2;
      return '<div class="bar-col">' +
        '<span class="bar-val">' + (mo.total ? yen(mo.total) : '') + '</span>' +
        '<div class="bar' + (mo.total ? '' : ' is-empty') + '" style="height:' + h + '%"></div></div>';
    }).join('');
    var labels = months.map(function (mo) { return '<span>' + (mo.m + 1) + '月</span>'; }).join('');
    return '<div class="chart">' + bars + '</div><div class="chart-labels">' + labels + '</div>';
  }

  function reviewPanel() {
    var passed = by('passed');
    var bought = by('bought');
    var rated = bought.filter(function (i) { return i.satisfaction != null; });
    var avg = rated.length ? (rated.reduce(function (s, i) { return s + i.satisfaction; }, 0) / rated.length) : null;
    var regret = rated.filter(function (i) { return i.satisfaction <= 2; });
    var spent = bought.reduce(function (s, i) { return s + i.price; }, 0);

    /* カテゴリ別の見送り額 */
    var catMap = {};
    passed.forEach(function (i) { catMap[i.category] = (catMap[i.category] || 0) + i.price; });
    var cats = Object.keys(catMap).sort(function (a, b) { return catMap[b] - catMap[a]; });

    var html = '';

    html += '<section class="panel"><h3>月ごとに見送った金額</h3>' +
      '<p class="panel-sub">買わずに済んだ金額の推移です。</p>' + monthChart() + '</section>';

    html += '<section class="panel"><h3>数字で見る</h3><div class="rows">' +
      '<div class="row"><span>見送って貯まった合計</span><span class="row-num">' + yen(savedTotal()) + '</span></div>' +
      '<div class="row"><span>買ったものの合計</span><span class="row-num">' + yen(spent) + '</span></div>' +
      '<div class="row"><span>冷却を経て見送った数</span><span class="row-num">' + passed.length + '件 / ' + (passed.length + bought.length) + '件</span></div>' +
      '<div class="row"><span>買ったものの平均満足度</span><span class="row-num">' + (avg ? avg.toFixed(1) + ' / 5' : '—') + '</span></div>' +
      '</div></section>';

    if (cats.length) {
      html += '<section class="panel"><h3>見送れたカテゴリ</h3><div class="rows">' +
        cats.map(function (c) {
          return '<div class="row"><span>' + esc(c) + '</span><span class="row-num">' + yen(catMap[c]) + '</span></div>';
        }).join('') + '</div></section>';
    }

    if (regret.length) {
      html += '<section class="panel"><h3>次に効く学び</h3>' +
        '<p class="panel-sub">満足度が低かった買い物です。似たものが欲しくなったら思い出してください。</p><div class="rows">' +
        regret.map(function (i) {
          return '<div class="row"><span>' + esc(i.name) + (i.reason ? '<br><span class="hint">「' + esc(i.reason) + '」</span>' : '') +
            '</span><span class="row-num">' + yen(i.price) + '</span></div>';
        }).join('') + '</div></section>';
    }

    var g = state.goal || { name: '', amount: '' };
    html += '<section class="panel" id="goalPanel"><h3>貯まったお金の使いみち</h3>' +
      '<p class="panel-sub">目標を決めると、見送るたびにゲージが伸びます。</p>' +
      '<form class="form" id="goalForm">' +
      '<div class="field-row">' +
      '<label class="field"><span class="field-label">なにに使う？</span>' +
      '<input id="g-name" type="text" maxlength="40" placeholder="旅行の資金" value="' + esc(g.name) + '"></label>' +
      '<label class="field"><span class="field-label">目標金額</span><div class="yen-input"><span aria-hidden="true">¥</span>' +
      '<input id="g-amount" type="number" min="0" step="1" inputmode="numeric" placeholder="100000" value="' + (g.amount || '') + '"></div></label>' +
      '</div>' +
      '<div class="data-btns"><button class="btn" type="submit">目標を保存</button>' +
      (state.goal ? '<button class="btn btn-quiet" type="button" data-act="clear-goal">目標を消す</button>' : '') +
      '</div></form></section>';

    html += '<section class="panel"><h3>冷却期間のルール</h3>' +
      '<ul class="rules">' +
      '<li>1,000円未満 → 1日</li><li>5,000円未満 → 3日</li><li>20,000円未満 → 7日</li>' +
      '<li>50,000円未満 → 14日</li><li>50,000円以上 → 30日</li>' +
      '</ul><p class="panel-sub" style="margin-top:8px">保留するときに自分で期間を選ぶこともできます。</p></section>';

    html += '<section class="panel"><h3>データ</h3>' +
      '<p class="panel-sub">この端末のブラウザにだけ保存されます。機種変更の前に書き出してください。</p>' +
      '<div class="data-btns">' +
      '<button class="btn btn-sm" type="button" data-act="export">書き出す</button>' +
      '<button class="btn btn-sm" type="button" data-act="import-open">読み込む</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm ' + (pendingDelete === 'ALL' ? 'btn-danger' : 'btn-quiet') + '" type="button" data-act="' +
      (pendingDelete === 'ALL' ? 'reset' : 'arm-reset') + '">' + (pendingDelete === 'ALL' ? '本当に全部消す' : '全部消す') + '</button>' +
      '</div><div id="dataBox"></div></section>';

    return html;
  }

  /* ---- 描画 ---- */
  function render() {
    renderHero();
    var html = '';

    if (tab === 'cooling') {
      var items = by('cooling').slice().sort(function (a, b) {
        return (a.createdAt + a.coolMs) - (b.createdAt + b.coolMs);
      });
      html = items.length
        ? '<div class="list">' + items.map(coolingCard).join('') + '</div>'
        : '<p class="empty"><strong>いま冷却中のものはありません</strong>欲しいものができたら、買う前にここへ入れてください。</p>';
    } else if (tab === 'passed') {
      var p = by('passed').slice().sort(function (a, b) { return (b.decidedAt || 0) - (a.decidedAt || 0); });
      html = p.length
        ? '<div class="list">' + p.map(passedCard).join('') + '</div>'
        : '<p class="empty"><strong>まだ見送りはありません</strong>冷却が終わったら「見送る」を押すと、ここに貯まります。</p>';
    } else if (tab === 'bought') {
      var b = by('bought').slice().sort(function (a, b2) { return (b2.decidedAt || 0) - (a.decidedAt || 0); });
      html = b.length
        ? '<div class="list">' + b.map(boughtCard).join('') + '</div>'
        : '<p class="empty"><strong>買ったものはまだありません</strong>よく考えて買ったものは、満足度を記録すると次の判断に効きます。</p>';
    } else {
      html = reviewPanel();
    }

    view.innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-on', t.dataset.tab === tab);
    });

    var gf = $('goalForm');
    if (gf) gf.addEventListener('submit', saveGoal);
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function find(id) {
    return state.items.filter(function (i) { return i.id === id; })[0];
  }

  /* ---- 操作 ---- */
  function decide(id, status) {
    var item = find(id);
    if (!item) return;
    item.status = status;
    item.decidedAt = Date.now();
    save();
    render();
    if (status === 'passed') {
      toast(yen(item.price) + ' 貯まりました。よく我慢しました。');
    } else {
      toast('購入として記録しました。届いたら満足度をつけてください。');
    }
  }

  function saveGoal(e) {
    e.preventDefault();
    var name = $('g-name').value.trim();
    var amount = parseInt($('g-amount').value, 10);
    if (!name || !(amount > 0)) { toast('使いみちと目標金額の両方を入れてください。'); return; }
    state.goal = { name: name, amount: amount };
    save();
    render();
    toast('目標を保存しました。');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    var tabBtn = e.target.closest('.tab');

    if (tabBtn) { tab = tabBtn.dataset.tab; pendingDelete = null; render(); return; }
    if (!t) return;

    var act = t.dataset.act;
    var id = t.dataset.id;

    if (act === 'zoom') { openLightbox(id); return; }
    if (act === 'add-photo') { pickImageFor(id); return; }
    if (act === 'pick-new') { pickImageFor('new'); return; }
    if (act === 'clear-photo') { draftImage = null; renderDraftPhoto(); return; }
    if (act === 'replace-photo') { pickImageFor(lightboxId); return; }
    if (act === 'remove-photo') {
      var pit = find(lightboxId);
      if (pit) { delete pit.image; save(); }
      closeLightbox();
      render();
      return;
    }

    if (act === 'pass') { decide(id, 'passed'); return; }
    if (act === 'buy') { decide(id, 'bought'); return; }

    if (act === 'undo') {
      var it = find(id);
      if (it) { it.status = 'cooling'; delete it.decidedAt; save(); render(); }
      return;
    }

    if (act === 'urge') {
      var item = find(id);
      if (item) {
        item.checkins = item.checkins || [];
        var v = parseInt(t.dataset.v, 10);
        var last = item.checkins[item.checkins.length - 1];
        // 直近の記録が1時間以内なら上書き、そうでなければ追加
        if (last && Date.now() - last.at < 3600000) { last.urge = v; last.at = Date.now(); }
        else item.checkins.push({ at: Date.now(), urge: v });
        save(); render();
        if (v <= 2) toast('熱が下がっています。見送りどきかもしれません。');
      }
      return;
    }

    if (act === 'sat') {
      var b = find(id);
      if (b) { b.satisfaction = parseInt(t.dataset.v, 10); save(); render(); }
      return;
    }

    if (act === 'arm-delete') { pendingDelete = id; render(); setTimeout(clearArm, 4000); return; }
    if (act === 'delete') {
      state.items = state.items.filter(function (i) { return i.id !== id; });
      pendingDelete = null; save(); render(); return;
    }
    if (act === 'arm-reset') { pendingDelete = 'ALL'; render(); setTimeout(clearArm, 4000); return; }
    if (act === 'reset') {
      state = { sample: false, goal: null, items: [] };
      pendingDelete = null; shownTotal = 0; save(); render();
      toast('すべて消しました。');
      return;
    }

    if (act === 'goto-goal') {
      tab = 'review'; render();
      var gp = $('goalPanel');
      if (gp) { gp.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('g-name').focus(); }
      return;
    }
    if (act === 'clear-goal') { state.goal = null; save(); render(); return; }

    if (act === 'export') {
      $('dataBox').innerHTML =
        '<label class="field" style="margin-top:12px"><span class="field-label">この文字列をコピーして保管してください</span>' +
        '<textarea id="dataOut" rows="5" readonly></textarea></label>';
      var out = $('dataOut');
      out.value = JSON.stringify(state);
      out.focus(); out.select();
      return;
    }
    if (act === 'import-open') {
      $('dataBox').innerHTML =
        '<label class="field" style="margin-top:12px"><span class="field-label">書き出した文字列を貼り付けてください</span>' +
        '<textarea id="dataIn" rows="5" placeholder="{&quot;items&quot;:[...]}"></textarea></label>' +
        '<div class="data-btns"><button class="btn btn-sm" type="button" data-act="import">読み込む（いまのデータは置き換わります）</button></div>';
      return;
    }
    if (act === 'import') {
      try {
        var data = JSON.parse($('dataIn').value);
        if (!data || !Array.isArray(data.items)) throw new Error('形式が違います');
        state = { sample: false, goal: data.goal || null, items: data.items };
        shownTotal = 0; save(); render();
        toast('読み込みました。');
      } catch (err) {
        toast('読み込めませんでした。書き出した文字列をそのまま貼り付けてください。');
      }
      return;
    }

    if (act === 'clear-sample') {
      state = { sample: false, goal: null, items: [] };
      shownTotal = 0; save(); render();
      return;
    }
  });

  function clearArm() {
    if (pendingDelete) { pendingDelete = null; render(); }
  }

  /* ---- 写真の選択・表示 ---- */
  var fileInput = $('fileInput');

  function pickImageFor(target) {
    if (!target) return;
    photoTarget = target;
    fileInput.value = '';
    fileInput.click();
  }

  function applyImage(dataUrl) {
    if (photoTarget === 'new') {
      draftImage = dataUrl;
      renderDraftPhoto();
      return;
    }
    var it = find(photoTarget);
    if (!it) return;
    var prev = it.image;
    it.image = dataUrl;
    if (!save()) {
      if (prev) it.image = prev; else delete it.image;
    } else if (lightboxId === it.id) {
      $('lightboxImg').src = it.image;
    }
    render();
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (f) readImage(f, applyImage);
  });

  function renderDraftPhoto() {
    var slot = $('photoSlot');
    if (draftImage) {
      slot.classList.add('has-image');
      slot.innerHTML = '<img src="' + draftImage + '" alt="選んだ写真">' +
        '<button class="photo-clear" type="button" data-act="clear-photo" aria-label="写真を消す">✕</button>';
    } else {
      slot.classList.remove('has-image');
      slot.innerHTML = '<span>画像を選ぶ</span>';
    }
  }

  $('photoSlot').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickImageFor('new'); }
  });

  function openLightbox(id) {
    var it = find(id);
    if (!it || !it.image || it.image.indexOf('data:image/') !== 0) return;
    lightboxId = id;
    $('lightboxImg').src = it.image;
    $('lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    $('lightbox').hidden = true;
    lightboxId = null;
    if ($('overlay').hidden) document.body.style.overflow = '';
  }
  $('closeLightbox').addEventListener('click', closeLightbox);
  $('lightbox').addEventListener('click', function (e) { if (e.target === this) closeLightbox(); });

  /* ---- 追加シート ---- */
  var overlay = $('overlay');
  var form = $('addForm');

  CATS.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('f-cat').appendChild(o);
  });

  function openSheet() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('f-name').focus(); }, 30);
  }
  function closeSheet() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    form.reset();
    draftImage = null;
    renderDraftPhoto();
    $('coolHint').textContent = '金額を入れると冷却期間が決まります。';
  }

  $('addBtn').addEventListener('click', openSheet);
  $('closeSheet').addEventListener('click', closeSheet);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('lightbox').hidden) closeLightbox();
    else if (!overlay.hidden) closeSheet();
  });

  // スクリーンショットの貼り付け
  document.addEventListener('paste', function (e) {
    if (overlay.hidden) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) {
          e.preventDefault();
          photoTarget = 'new';
          readImage(f, function (d) { draftImage = d; renderDraftPhoto(); toast('写真を貼り付けました。'); });
        }
        return;
      }
    }
  });

  function updateHint() {
    var price = parseInt($('f-price').value, 10);
    var sel = $('f-cool').value;
    if (sel !== 'auto') {
      $('coolHint').textContent = sel + '日寝かせてから判定します。';
    } else if (price > 0) {
      $('coolHint').textContent = yen(price) + ' なので ' + autoCoolDays(price) + '日 寝かせます。';
    } else {
      $('coolHint').textContent = '金額を入れると冷却期間が決まります。';
    }
  }
  $('f-price').addEventListener('input', updateHint);
  $('f-cool').addEventListener('change', updateHint);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var price = parseInt($('f-price').value, 10);
    if (!(price > 0)) { toast('金額を入れてください。'); return; }
    var sel = $('f-cool').value;
    var days = sel === 'auto' ? autoCoolDays(price) : parseInt(sel, 10);
    state.sample = false;
    state.items.push({
      id: uid(),
      name: $('f-name').value.trim(),
      price: price,
      category: $('f-cat').value,
      url: $('f-url').value.trim(),
      reason: $('f-reason').value.trim(),
      createdAt: Date.now(),
      coolMs: days * DAY,
      status: 'cooling',
      checkins: [],
      image: draftImage || null
    });
    save();
    closeSheet();
    tab = 'cooling';
    render();
    toast(days + '日間の冷却をはじめました。それまで買えません。');
  });

  $('clearSample').addEventListener('click', function () {
    state = { sample: false, goal: null, items: [] };
    shownTotal = 0;
    save();
    render();
  });

  /* ---- 起動 ---- */
  render();
  setInterval(function () { if (tab === 'cooling') render(); }, 30000);
})();
