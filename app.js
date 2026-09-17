/* あわ貯金 — ほしいものを泡に閉じこめて、見送ったらコインに変える */
(function () {
  'use strict';

  var KEY = 'awa-chokin-v2';
  var OLD_KEY = 'cooldown-wishlist-v1';
  var DAY = 86400000;

  /* ふくらんでいる期間は金額から自動で決まる（利用者は選ばない） */
  function coolDays(price) {
    if (price < 1000) return 1;
    if (price < 5000) return 3;
    if (price < 20000) return 7;
    if (price < 50000) return 14;
    return 30;
  }

  /* ---- 状態 ---------------------------------------------------------- */
  var state = load();
  var sheetMode = null;      // 'add' | 'detail' | 'menu'
  var sheetId = null;
  var draftImage = null;
  var photoTarget = null;    // 'new' か item.id
  var pendingDelete = null;
  var newCoinId = null;
  var bubbleKey = '';
  var trayKey = '';

  var $ = function (id) { return document.getElementById(id); };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function load() {
    var raw = read(KEY);
    if (raw) return raw;
    var old = read(OLD_KEY);
    if (old) return migrate(old);
    return sampleState();
  }

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && Array.isArray(data.items) ? data : null;
    } catch (e) { return null; }
  }

  /* 旧バージョン（クールダウン貯金）のデータを引き継ぐ */
  function migrate(old) {
    return {
      sample: false,
      items: old.items.map(function (i) {
        var log = [];
        if (i.reason) log.push({ at: i.createdAt, text: i.reason, mood: '' });
        (i.checkins || []).forEach(function (c) {
          log.push({ at: c.at, text: '', mood: c.urge >= 4 ? 'hot' : c.urge <= 2 ? 'cold' : 'mid' });
        });
        return {
          id: i.id, name: i.name || '', price: i.price, image: i.image || null,
          createdAt: i.createdAt, coolMs: i.coolMs, status: i.status,
          decidedAt: i.decidedAt || null,
          log: log.sort(function (a, b) { return a.at - b.at; })
        };
      })
    };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('保存できませんでした。写真が多いと容量がいっぱいになります。');
      return false;
    }
  }

  function sampleState() {
    var now = Date.now();
    return {
      sample: true,
      items: [
        {
          id: uid(), name: 'ワイヤレスイヤホン', price: 24800, image: null,
          createdAt: now - 8 * DAY, coolMs: 7 * DAY, status: 'cooling', decidedAt: null,
          log: [
            { at: now - 8 * DAY, text: '今のイヤホン、充電が持たなくなってきた', mood: 'hot' },
            { at: now - 5 * DAY, text: '', mood: 'mid' },
            { at: now - 1 * DAY, text: '別に今のままでも困ってないかも', mood: 'cold' }
          ]
        },
        {
          id: uid(), name: 'ランニングシューズ', price: 13200, image: null,
          createdAt: now - 2 * DAY, coolMs: 7 * DAY, status: 'cooling', decidedAt: null,
          log: [{ at: now - 2 * DAY, text: 'セールで30%オフだった', mood: 'hot' }]
        },
        {
          id: uid(), name: 'コーヒーミル', price: 6480, image: null,
          createdAt: now - 10 * 3600000, coolMs: 3 * DAY, status: 'cooling', decidedAt: null,
          log: [{ at: now - 10 * 3600000, text: '動画で見て良さそうだった', mood: 'mid' }]
        },
        {
          id: uid(), name: 'ゲーミングチェア', price: 32000, image: null,
          createdAt: now - 24 * DAY, coolMs: 14 * DAY, status: 'passed', decidedAt: now - 10 * DAY,
          log: [{ at: now - 11 * DAY, text: '座り心地は気になるけど、今の椅子で足りてる', mood: 'cold' }]
        },
        {
          id: uid(), name: '写真編集ソフト', price: 9800, image: null,
          createdAt: now - 47 * DAY, coolMs: 7 * DAY, status: 'passed', decidedAt: now - 40 * DAY, log: []
        },
        {
          id: uid(), name: '電気圧力鍋', price: 11000, image: null,
          createdAt: now - 27 * DAY, coolMs: 7 * DAY, status: 'bought', decidedAt: now - 20 * DAY,
          log: [{ at: now - 27 * DAY, text: '平日の自炊がラクになりそう', mood: 'hot' }]
        }
      ]
    };
  }

  /* ---- 小さな道具 ---------------------------------------------------- */
  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function imgSrc(item) {
    return item.image && item.image.indexOf('data:image/') === 0 ? item.image : '';
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function rnd(id, salt) { return hash(id + ':' + salt); }

  function find(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }
  function by(status) { return state.items.filter(function (i) { return i.status === status; }); }
  function isReady(i) { return i.status === 'cooling' && Date.now() >= i.createdAt + i.coolMs; }

  function thisYear() { return new Date().getFullYear(); }
  function yearOf(ts) { return new Date(ts).getFullYear(); }
  function coinsOfYear(y) {
    return by('passed').filter(function (i) { return yearOf(i.decidedAt || i.createdAt) === y; })
      .sort(function (a, b) { return (b.decidedAt || 0) - (a.decidedAt || 0); });
  }
  function sum(items) { return items.reduce(function (s, i) { return s + i.price; }, 0); }

  function roughLeft(ms) {
    if (ms <= 0) return 'そろそろ決めどき';
    var d = Math.ceil(ms / DAY);
    if (ms >= DAY) return 'あと' + d + '日';
    var h = Math.ceil(ms / 3600000);
    if (ms >= 3600000) return 'あと' + h + '時間';
    return 'あと' + Math.max(1, Math.ceil(ms / 60000)) + '分';
  }

  function dateLabel(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function lastMood(item) {
    for (var i = item.log.length - 1; i >= 0; i--) if (item.log[i].mood) return item.log[i].mood;
    return '';
  }

  var MOOD_LABEL = { hot: 'まだ欲しい', mid: 'ふつう', cold: '冷めた' };

  /* ---- ドット絵 ------------------------------------------------------ */
  function pixelArt(rows, palette, px, cls) {
    var w = rows[0].length, h = rows.length, out = '';
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var color = palette[rows[y][x]];
        if (color) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + color + '"/>';
      }
    }
    return '<svg class="chr ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + (w * px) +
      '" height="' + (h * px) + '" shape-rendering="crispEdges" aria-hidden="true">' + out + '</svg>';
  }

  var CAT = [
    '..KK........KK..',
    '..KPK......KPK..',
    '..KKPKKKKKKPKK..',
    '.KWWWWWWWWWWWWK.',
    '.KWWKKWWWWKKWWK.',
    '.KWWKKWWWWKKWWK.',
    '.KWWWWWPPWWWWWK.',
    '.KWWWKWWWWKWWWK.',
    '.KWWWWKKKKWWWWK.',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWKWWWWWWKWK..',
    '..KKKKKKKKKKKK..'
  ];
  var PIG = [
    '................',
    '...PP......PP...',
    '..PPPPPPPPPPPP..',
    '.PPPPPPPPPPPPPP.',
    '.PPKPPPPPPPPKPP.',
    '.PPPPRRRRRRPPPP.',
    '.PPPPRKRRKRPPPP.',
    '.PPPPRRRRRRPPPP.',
    '.PPPPPPPPPPPPPP.',
    '..PPPPPPPPPPPP..',
    '...PP......PP...',
    '................'
  ];
  var BIRD = [
    '.....BBBB.....',
    '...BBBBBBBB...',
    '..BBKBBBBBBB..',
    '..BBBBBBBBBBYY',
    '..BBBBBBBBBBY.',
    '...BBBBBBBB...',
    '....B....B....',
    '..............'
  ];

  var CLOUD = [
    '....WWWW....',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    '.WWWWWWWWWW.'
  ];

  function renderScenery() {
    var cloud = pixelArt(CLOUD, { W: '#ffffff' }, 4, '');
    $('skyChars').innerHTML =
      '<div class="chr-cloud-a">' + cloud + '</div>' +
      '<div class="chr-cloud-b">' + cloud + '</div>' +
      '<div class="chr-bird">' + pixelArt(BIRD, { B: '#5ac8f5', K: '#3b3560', Y: '#ffb03a' }, 3, '') + '</div>' +
      '<div class="chr-pig">' + pixelArt(PIG, { P: '#ffa9cd', R: '#ff5f9e', K: '#3b3560' }, 3, '') + '</div>';
    $('groundChar').innerHTML = pixelArt(CAT, { K: '#3b3560', W: '#fffaf4', P: '#ff9ec4' }, 4, '');
  }

  /* ---- 上部の合計 ---------------------------------------------------- */
  function renderTop() {
    var y = thisYear();
    var coins = coinsOfYear(y);
    var floating = by('cooling');
    $('yearLabel').textContent = y + '年のがまん貯金';
    $('total').textContent = yen(sum(coins));
    $('sub').textContent = floating.length
      ? '泡 ' + floating.length + 'コ（' + yen(sum(floating)) + '）が ふわふわ中 ・ コイン ' + coins.length + '枚'
      : 'コイン ' + coins.length + '枚';
  }

  /* ---- 泡 ------------------------------------------------------------ */
  function bubbleHtml(item) {
    var size = Math.round(78 + Math.min(66, Math.sqrt(item.price) * 0.55));
    var left = item.createdAt + item.coolMs - Date.now();
    var ready = isReady(item);
    var mood = lastMood(item);
    var src = imgSrc(item);
    var shards = '';
    for (var s = 0; s < 8; s++) {
      var a = (Math.PI * 2 / 8) * s;
      shards += '<span class="shard" style="--dx:' + Math.round(Math.cos(a) * size * 0.8) +
        'px;--dy:' + Math.round(Math.sin(a) * size * 0.8) + 'px"></span>';
    }
    return '<button class="bubble' + (ready ? ' is-ready' : '') + (mood === 'cold' ? ' is-cold' : '') +
      '" type="button" data-act="open-detail" data-id="' + item.id + '"' +
      ' style="--size:' + size + 'px;--y:' + Math.round(rnd(item.id, 'y') * 26) +
      'px;--drift:' + (3.6 + rnd(item.id, 'd') * 3).toFixed(2) + 's;--delay:-' + (rnd(item.id, 'l') * 4).toFixed(2) + 's">' +
      '<span class="bubble-in">' +
      (src ? '<img class="bubble-photo" src="' + src + '" alt="">' : '') +
      (item.name ? '<span class="bubble-name">' + esc(item.name) + '</span>' : '') +
      '<span class="bubble-price">' + yen(item.price) + '</span>' +
      '<span class="bubble-time">' + roughLeft(left) + '</span>' +
      '</span>' +
      (ready ? '<span class="badge">わりごろ</span>' : '') +
      '<span class="shards">' + shards + '</span>' +
      '</button>';
  }

  function renderBubbles() {
    var items = by('cooling').sort(function (a, b) {
      return (a.createdAt + a.coolMs) - (b.createdAt + b.coolMs);
    });
    var key = items.map(function (i) { return i.id + (isReady(i) ? '!' : '') + lastMood(i) + (i.image ? 'p' : ''); }).join(',');
    if (key === bubbleKey) { refreshTimes(items); return; }
    bubbleKey = key;
    $('bubbles').innerHTML = items.length
      ? items.map(bubbleHtml).join('')
      : '<p class="empty-sky"><strong>空っぽです</strong>ほしくなったら、買う前に泡にしてみてください。</p>';
  }

  /* 再描画するとふわふわが途切れるので、残り時間だけ書き換える */
  function refreshTimes(items) {
    items.forEach(function (i) {
      var el = document.querySelector('.bubble[data-id="' + i.id + '"] .bubble-time');
      if (el) el.textContent = roughLeft(i.createdAt + i.coolMs - Date.now());
    });
  }

  /* ---- コイン -------------------------------------------------------- */
  function coinSize(price) {
    if (price < 3000) return 24;
    if (price < 10000) return 29;
    if (price < 30000) return 35;
    return 41;
  }

  function renderTray() {
    var coins = coinsOfYear(thisYear());
    var key = coins.map(function (c) { return c.id; }).join(',') + '|' + newCoinId;
    if (key === trayKey) return;
    trayKey = key;

    if (!coins.length) {
      $('tray').innerHTML = '<span class="tray-empty">見送るとここにコインが落ちてきます</span>';
      return;
    }
    var shown = coins.slice(0, 48);
    var html = shown.map(function (c) {
      return '<button class="coin' + (c.id === newCoinId ? ' is-new' : '') + '" type="button" data-act="open-detail" data-id="' +
        c.id + '" style="--c:' + coinSize(c.price) + 'px" title="' + esc(c.name || '名前なし') + ' ' + yen(c.price) + '">¥</button>';
    }).join('');
    if (coins.length > shown.length) html += '<span class="coin-more">＋' + (coins.length - shown.length) + '枚</span>';
    $('tray').innerHTML = html;
    newCoinId = null;
  }

  function render() {
    renderTop();
    renderBubbles();
    renderTray();
  }

  /* ---- シート -------------------------------------------------------- */
  function sheetHead(title) {
    return '<div class="sheet-head"><span class="sheet-title">' + title +
      '</span><button class="close-btn" type="button" data-act="close" aria-label="閉じる">✕</button></div>';
  }

  function addSheet() {
    return sheetHead('ほしいもの') +
      '<form id="addForm">' +
      '<div class="field"><span class="field-label">いくら？</span>' +
      '<div class="yen-field"><span aria-hidden="true">¥</span>' +
      '<input id="f-price" type="number" min="1" step="1" inputmode="numeric" placeholder="0" required></div></div>' +
      '<div class="field"><span class="field-label">写真</span>' +
      '<div class="photo-row">' +
      '<div class="photo-slot" id="photoSlot" data-act="pick-new" role="button" tabindex="0"><span>写真を<br>えらぶ</span></div>' +
      '<p class="hint">画面を撮ったものでOK。貼り付け（Ctrl / ⌘ + V）もできます。</p>' +
      '</div></div>' +
      '<div class="field"><span class="field-label">なにか一言<span class="hint">（なくてもOK）</span></span>' +
      '<input id="f-name" type="text" maxlength="40" placeholder="ワイヤレスイヤホン" autocomplete="off"></div>' +
      '<div class="actions"><button class="btn btn-big btn-pop" type="submit">泡にする</button>' +
      '<p class="hint" id="coolHint" style="text-align:center">金額に合わせて、ふくらんでいる期間が決まります。</p></div>' +
      '</form>';
  }

  function detailSheet(item) {
    var src = imgSrc(item);
    var cooling = item.status === 'cooling';
    var left = item.createdAt + item.coolMs - Date.now();
    var days = Math.max(0, Math.round((Date.now() - item.createdAt) / DAY));
    var mood = lastMood(item);

    var meta = cooling
      ? (isReady(item) ? days + '日ふわふわさせました。もう割れます。' : days + '日ふわふわ中 ・ ' + roughLeft(left))
      : item.status === 'passed'
        ? dateLabel(item.decidedAt) + 'に見送ってコインになりました'
        : dateLabel(item.decidedAt) + 'に買いました';

    var log = item.log.slice().sort(function (a, b) { return b.at - a.at; }).map(function (c) {
      return '<div class="log-item"><div class="log-head"><span>' + dateLabel(c.at) + '</span>' +
        (c.mood ? '<span class="tag tag-' + c.mood + '">' + MOOD_LABEL[c.mood] + '</span>' : '') + '</div>' +
        (c.text ? esc(c.text) : '') + '</div>';
    }).join('');

    var moods = ['hot', 'mid', 'cold'].map(function (m) {
      return '<button class="mood' + (mood === m ? ' is-on' : '') + '" type="button" data-act="mood" data-id="' +
        item.id + '" data-mood="' + m + '">' + MOOD_LABEL[m] + '</button>';
    }).join('');

    var actions = cooling
      ? '<button class="btn btn-big btn-pop" type="button" data-act="pass" data-id="' + item.id + '">泡をわって ' + yen(item.price) + ' 貯める</button>' +
        '<button class="btn btn-buy" type="button" data-act="buy" data-id="' + item.id + '">買うことにした</button>'
      : '<button class="btn" type="button" data-act="unpop" data-id="' + item.id + '">泡にもどす</button>';

    return sheetHead(cooling ? 'この泡' : (item.status === 'passed' ? '見送ったもの' : '買ったもの')) +
      (src ? '<img class="detail-photo" src="' + src + '" alt="' + esc(item.name || 'ほしいもの') + '">' : '') +
      '<p class="big-price">' + yen(item.price) + '</p>' +
      (item.name ? '<p class="detail-name">' + esc(item.name) + '</p>' : '') +
      '<p class="detail-meta">' + meta + '</p>' +
      (cooling ? '<div class="field"><span class="field-label">いまの気持ち</span><div class="moods">' + moods + '</div></div>' : '') +
      '<div class="field"><span class="field-label">メモ</span>' +
      '<div class="comment-row"><textarea id="commentInput" rows="2" maxlength="200" placeholder="ほんとに要る？ 思ったことを書く"></textarea>' +
      '<button class="btn btn-sm" type="button" data-act="comment" data-id="' + item.id + '">書く</button></div></div>' +
      (log ? '<div class="log">' + log + '</div>' : '') +
      '<div class="actions">' + actions +
      '<div class="actions-row">' +
      (src ? '' : '<button class="btn btn-sm btn-quiet" type="button" data-act="add-photo" data-id="' + item.id + '">写真をつける</button>') +
      (src ? '<button class="btn btn-sm btn-quiet" type="button" data-act="add-photo" data-id="' + item.id + '">写真を変える</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm ' + (pendingDelete === item.id ? 'btn-danger' : 'btn-quiet') + '" type="button" data-act="' +
      (pendingDelete === item.id ? 'delete' : 'arm-delete') + '" data-id="' + item.id + '">' +
      (pendingDelete === item.id ? 'ほんとに消す' : '消す') + '</button>' +
      '</div></div>';
  }

  function menuSheet() {
    var y = thisYear();
    var coins = coinsOfYear(y);
    var bought = by('bought').sort(function (a, b) { return (b.decidedAt || 0) - (a.decidedAt || 0); });

    var years = {};
    by('passed').forEach(function (i) {
      var yy = yearOf(i.decidedAt || i.createdAt);
      if (yy !== y) { years[yy] = years[yy] || { total: 0, n: 0 }; years[yy].total += i.price; years[yy].n++; }
    });
    var pastKeys = Object.keys(years).sort().reverse();

    var html = sheetHead('きろく') +
      '<div class="menu-list">' +
      '<div class="menu-row"><span>' + y + '年に見送った</span><span class="menu-num">' + yen(sum(coins)) + ' / ' + coins.length + '件</span></div>' +
      '<div class="menu-row"><span>いま泡になっている</span><span class="menu-num">' + yen(sum(by('cooling'))) + '</span></div>' +
      '<div class="menu-row"><span>買ったもの</span><span class="menu-num">' + yen(sum(bought)) + ' / ' + bought.length + '件</span></div>' +
      '</div>';

    if (pastKeys.length) {
      html += '<div class="menu-sec"><h3>これまでの年</h3><div class="menu-list">' +
        pastKeys.map(function (k) {
          return '<div class="menu-row"><span>' + k + '年</span><span class="menu-num">' + yen(years[k].total) + ' / ' + years[k].n + '件</span></div>';
        }).join('') + '</div><p class="hint">コインは年が変わるとリセットされて、ここに残ります。</p></div>';
    }

    if (bought.length) {
      html += '<div class="menu-sec"><h3>買ったもの</h3><div class="mini-list">' +
        bought.slice(0, 12).map(function (i) {
          var src = imgSrc(i);
          return '<div class="mini">' + (src ? '<img src="' + src + '" alt="">' : '') +
            '<div class="mini-body"><div class="mini-name">' + esc(i.name || '名前なし') + '</div>' +
            '<div class="mini-sub">' + dateLabel(i.decidedAt || i.createdAt) + 'に購入</div></div>' +
            '<span class="mini-price">' + yen(i.price) + '</span></div>';
        }).join('') + '</div></div>';
    }

    html += '<div class="menu-sec"><h3>ふくらむ期間</h3>' +
      '<p class="hint">金額で自動的に決まります。1,000円未満は1日、5,000円未満は3日、20,000円未満は7日、50,000円未満は14日、それ以上は30日。</p></div>';

    html += '<div class="menu-sec"><h3>データ</h3>' +
      '<p class="hint">この端末の中だけに保存されます。機種変更の前に書き出してください。</p>' +
      '<div class="actions-row" style="margin-top:10px">' +
      '<button class="btn btn-sm" type="button" data-act="export">書き出す</button>' +
      '<button class="btn btn-sm" type="button" data-act="import-open">読み込む</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm ' + (pendingDelete === 'ALL' ? 'btn-danger' : 'btn-quiet') + '" type="button" data-act="' +
      (pendingDelete === 'ALL' ? 'reset' : 'arm-reset') + '">' + (pendingDelete === 'ALL' ? 'ほんとに全部消す' : '全部消す') + '</button>' +
      '</div><div id="dataBox"></div></div>';

    return html;
  }

  function openSheet(mode, id) {
    sheetMode = mode;
    sheetId = id || null;
    renderSheet();
    $('overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    if (mode === 'add') setTimeout(function () { var p = $('f-price'); if (p) p.focus(); }, 40);
  }

  function renderSheet() {
    var sheet = $('sheet');
    if (sheetMode === 'add') {
      sheet.innerHTML = addSheet();
      renderDraftPhoto();
      $('addForm').addEventListener('submit', submitNew);
      $('f-price').addEventListener('input', updateCoolHint);
    } else if (sheetMode === 'detail') {
      var item = find(sheetId);
      if (!item) { closeSheet(); return; }
      sheet.innerHTML = detailSheet(item);
    } else if (sheetMode === 'menu') {
      sheet.innerHTML = menuSheet();
    }
  }

  function closeSheet() {
    $('overlay').hidden = true;
    document.body.style.overflow = '';
    sheetMode = null;
    sheetId = null;
    draftImage = null;
    pendingDelete = null;
  }

  function updateCoolHint() {
    var price = parseInt($('f-price').value, 10);
    var el = $('coolHint');
    if (!el) return;
    el.textContent = price > 0
      ? yen(price) + ' なら ' + coolDays(price) + '日間 ふわふわさせます。'
      : '金額に合わせて、ふくらんでいる期間が決まります。';
  }

  function submitNew(e) {
    e.preventDefault();
    var price = parseInt($('f-price').value, 10);
    if (!(price > 0)) { toast('金額を入れてください。'); return; }
    var name = ($('f-name').value || '').trim();
    state.sample = false;
    state.items.push({
      id: uid(), name: name, price: price, image: draftImage || null,
      createdAt: Date.now(), coolMs: coolDays(price) * DAY,
      status: 'cooling', decidedAt: null, log: []
    });
    save();
    closeSheet();
    render();
    toast('泡になりました。' + coolDays(price) + '日は割れません。');
  }

  /* ---- 見送る / 買う -------------------------------------------------- */
  function passItem(id) {
    var item = find(id);
    if (!item) return;
    var el = document.querySelector('.bubble[data-id="' + id + '"]');
    closeSheet();
    var done = function () {
      item.status = 'passed';
      item.decidedAt = Date.now();
      newCoinId = id;
      save();
      bubbleKey = '';
      render();
      cheer();
      toast('パチン！ ' + yen(item.price) + ' がコインになりました');
    };
    if (el && !reduceMotion()) {
      el.classList.add('popping');
      setTimeout(done, 400);
    } else {
      done();
    }
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function cheer() {
    var t = $('total'), g = $('groundChar');
    t.classList.remove('cheer');
    g.classList.remove('cheer');
    void t.offsetWidth;
    t.classList.add('cheer');
    g.classList.add('cheer');
    setTimeout(function () { t.classList.remove('cheer'); g.classList.remove('cheer'); }, 1300);
  }

  /* ---- 写真 ---------------------------------------------------------- */
  var MAX_EDGE = 720;
  function readImage(file, done) {
    if (!file || file.type.indexOf('image/') !== 0) { toast('画像を選んでください。'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('写真を読み込めませんでした。'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { toast('この写真は表示できない形式でした。'); };
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
        try { done(canvas.toDataURL('image/jpeg', 0.72)); }
        catch (err) { toast('この写真は取り込めませんでした。'); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function pickImageFor(target) {
    if (!target) return;
    photoTarget = target;
    $('fileInput').value = '';
    $('fileInput').click();
  }

  function applyImage(dataUrl) {
    if (photoTarget === 'new') {
      draftImage = dataUrl;
      renderDraftPhoto();
      return;
    }
    var item = find(photoTarget);
    if (!item) return;
    var prev = item.image;
    item.image = dataUrl;
    if (!save()) { item.image = prev || null; }
    bubbleKey = '';
    render();
    if (sheetMode === 'detail') renderSheet();
  }

  function renderDraftPhoto() {
    var slot = $('photoSlot');
    if (!slot) return;
    if (draftImage) {
      slot.classList.add('has-image');
      slot.innerHTML = '<img src="' + draftImage + '" alt="えらんだ写真">' +
        '<button class="photo-clear" type="button" data-act="clear-photo" aria-label="写真を消す">✕</button>';
    } else {
      slot.classList.remove('has-image');
      slot.innerHTML = '<span>写真を<br>えらぶ</span>';
    }
  }

  /* ---- 操作 ---------------------------------------------------------- */
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    var id = t.dataset.id;

    if (act === 'open-detail') { openSheet('detail', id); return; }
    if (act === 'open-menu') { openSheet('menu'); return; }
    if (act === 'close') { closeSheet(); return; }
    if (act === 'pass') { passItem(id); return; }

    if (act === 'buy') {
      var b = find(id);
      if (b) { b.status = 'bought'; b.decidedAt = Date.now(); save(); }
      closeSheet(); bubbleKey = ''; render();
      toast('買ったものとして記録しました。');
      return;
    }
    if (act === 'unpop') {
      var u = find(id);
      if (u) { u.status = 'cooling'; u.decidedAt = null; save(); }
      closeSheet(); bubbleKey = ''; trayKey = ''; render();
      toast('泡にもどしました。');
      return;
    }
    if (act === 'mood') {
      var m = find(id);
      if (m) {
        m.log.push({ at: Date.now(), text: '', mood: t.dataset.mood });
        save(); bubbleKey = ''; render(); renderSheet();
        if (t.dataset.mood === 'cold') toast('冷めてきましたね。割りどきです。');
      }
      return;
    }
    if (act === 'comment') {
      var c = find(id);
      var box = $('commentInput');
      var text = box ? box.value.trim() : '';
      if (!text) { toast('なにか書いてから押してください。'); return; }
      if (c) { c.log.push({ at: Date.now(), text: text, mood: '' }); save(); renderSheet(); }
      return;
    }

    if (act === 'pick-new') { pickImageFor('new'); return; }
    if (act === 'add-photo') { pickImageFor(id); return; }
    if (act === 'clear-photo') { draftImage = null; renderDraftPhoto(); return; }

    if (act === 'arm-delete') { pendingDelete = id; renderSheet(); setTimeout(disarm, 4000); return; }
    if (act === 'delete') {
      state.items = state.items.filter(function (i) { return i.id !== id; });
      pendingDelete = null; save(); closeSheet(); bubbleKey = ''; trayKey = ''; render();
      return;
    }
    if (act === 'arm-reset') { pendingDelete = 'ALL'; renderSheet(); setTimeout(disarm, 4000); return; }
    if (act === 'reset') {
      state = { sample: false, items: [] };
      pendingDelete = null; save(); closeSheet(); bubbleKey = ''; trayKey = ''; render();
      toast('全部消しました。');
      return;
    }

    if (act === 'export') {
      $('dataBox').innerHTML = '<div class="field"><span class="field-label">コピーして保管してください</span>' +
        '<textarea id="dataOut" rows="4" readonly></textarea></div>';
      var out = $('dataOut');
      out.value = JSON.stringify(state);
      out.focus(); out.select();
      return;
    }
    if (act === 'import-open') {
      $('dataBox').innerHTML = '<div class="field"><span class="field-label">書き出した文字列を貼り付け</span>' +
        '<textarea id="dataIn" rows="4"></textarea></div>' +
        '<div class="actions-row" style="margin-top:8px"><button class="btn btn-sm" type="button" data-act="import">読み込む（いまのデータは消えます）</button></div>';
      return;
    }
    if (act === 'import') {
      try {
        var data = JSON.parse($('dataIn').value);
        if (!data || !Array.isArray(data.items)) throw new Error('形式ちがい');
        state = data.items[0] && data.items[0].log ? data : migrate(data);
        state.sample = false;
        save(); closeSheet(); bubbleKey = ''; trayKey = ''; render();
        toast('読み込みました。');
      } catch (err) {
        toast('読み込めませんでした。書き出した文字列をそのまま貼り付けてください。');
      }
      return;
    }
  });

  function disarm() {
    if (pendingDelete) { pendingDelete = null; if (sheetMode) renderSheet(); }
  }

  $('addBtn').addEventListener('click', function () { openSheet('add'); });
  $('overlay').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('overlay').hidden) closeSheet();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'photoSlot') { e.preventDefault(); pickImageFor('new'); }
  });
  $('fileInput').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (f) readImage(f, applyImage);
  });
  document.addEventListener('paste', function (e) {
    if ($('overlay').hidden || sheetMode !== 'add') return;
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

  /* ---- 起動 ---------------------------------------------------------- */
  renderScenery();
  render();
  setInterval(render, 30000);
})();
