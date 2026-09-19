/* カード地獄 — クレジットカードを使ったその場で、金額と分類だけ残す。
 *
 * 予算に対して使いすぎるほど、背景が朝の空から地獄に変わっていく。
 * 記録は localStorage（このアプリ専用のキー）にだけ保存し、外には送らない。
 */
(function () {
  'use strict';

  var KEY = 'card-hell-v1';

  var DEFAULT_CATS = [
    { id: 'eatout', name: '外食', icon: '🍜' },
    { id: 'conveni', name: 'コンビニ', icon: '🏪' },
    { id: 'cafe', name: 'カフェ', icon: '☕' },
    { id: 'food', name: '食料品', icon: '🛒' },
    { id: 'shopping', name: '買い物', icon: '🛍️' },
    { id: 'hobby', name: '趣味・娯楽', icon: '🎮' },
    { id: 'sub', name: 'サブスク', icon: '📺' },
    { id: 'transport', name: '交通', icon: '🚃' },
    { id: 'beauty', name: '美容・服', icon: '💇' },
    { id: 'life', name: '日用品', icon: '🧴' },
    { id: 'health', name: '医療・薬', icon: '💊' },
    { id: 'other', name: 'その他', icon: '🧾' }
  ];

  var ICON_CHOICES = ['🧾', '🍜', '🏪', '☕', '🛒', '🛍️', '🎮', '📺', '🚃', '💇', '🧴', '💊',
    '🍺', '🎁', '📚', '🐈', '🚗', '✈️', '🏥', '💡', '📱', '🧺', '🎫', '💸'];

  /* 温度ごとの見た目。ratio（使った額 ÷ 予算）を t として、この間を混ぜる */
  var STOPS = [
    {
      t: 0,
      sky1: [234, 242, 247, 1], sky2: [203, 214, 224, 1], glow: [255, 154, 82, 0],
      ink: [38, 43, 51, 1], dim: [107, 114, 128, 1],
      card: [255, 255, 255, .74], line: [20, 24, 32, .10],
      accent: [61, 107, 143, 1], accentInk: [255, 255, 255, 1],
      fab: [20, 30, 45, .28], flame: 0, embers: 0
    },
    {
      t: .5,
      sky1: [247, 226, 199, 1], sky2: [231, 176, 135, 1], glow: [255, 154, 66, .5],
      ink: [56, 39, 30, 1], dim: [125, 98, 79, 1],
      card: [255, 252, 249, .7], line: [70, 35, 12, .14],
      accent: [193, 97, 31, 1], accentInk: [255, 255, 255, 1],
      fab: [120, 60, 20, .32], flame: .14, embers: 4
    },
    {
      t: .8,
      sky1: [126, 60, 44, 1], sky2: [66, 30, 26, 1], glow: [255, 106, 42, .78],
      ink: [255, 233, 214, 1], dim: [212, 168, 148, 1],
      card: [46, 18, 14, .52], line: [255, 180, 120, .20],
      accent: [225, 104, 40, 1], accentInk: [255, 245, 236, 1],
      fab: [80, 18, 6, .5], flame: .42, embers: 9
    },
    {
      t: 1,
      sky1: [92, 20, 16, 1], sky2: [34, 8, 10, 1], glow: [255, 75, 20, .92],
      ink: [255, 226, 200, 1], dim: [219, 156, 120, 1],
      card: [34, 8, 8, .58], line: [255, 120, 60, .26],
      accent: [226, 56, 13, 1], accentInk: [255, 240, 232, 1],
      fab: [90, 10, 2, .6], flame: .74, embers: 15
    },
    {
      t: 1.4,
      sky1: [62, 5, 8, 1], sky2: [10, 2, 3, 1], glow: [255, 43, 0, 1],
      ink: [255, 217, 184, 1], dim: [201, 138, 98, 1],
      card: [20, 3, 4, .68], line: [255, 80, 30, .32],
      accent: [255, 61, 15, 1], accentInk: [30, 4, 2, 1],
      fab: [120, 8, 0, .7], flame: 1, embers: 22
    }
  ];

  var COLOR_KEYS = ['sky1', 'sky2', 'glow', 'ink', 'dim', 'card', 'line', 'accent', 'accentInk', 'fab'];

  /* ---- 状態 ----------------------------------------------------------- */

  var state = load();
  var view = 'now';
  var lookOffset = 0;          // 0 = 今の期間、-1 = 前の期間
  var sheetMode = null;
  var editId = null;
  var draftCat = null;
  var draftAmount = '';
  var emberCount = -1;
  var deleteArmed = false;
  var deleteTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ---- 保存と読み込み --------------------------------------------------- */

  function defaults() {
    return {
      version: 1,
      budget: 50000,
      startDay: 1,
      entries: [],
      extraCats: [],
      hiddenCats: [],
      lastCat: 'eatout'
    };
  }

  function load() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return base;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return base;
      base.budget = num(data.budget, 50000);
      base.startDay = Math.min(28, Math.max(1, num(data.startDay, 1)));
      base.entries = Array.isArray(data.entries) ? data.entries.filter(validEntry) : [];
      base.extraCats = Array.isArray(data.extraCats) ? data.extraCats.filter(function (c) {
        return c && c.id && c.name;
      }) : [];
      base.hiddenCats = Array.isArray(data.hiddenCats) ? data.hiddenCats : [];
      base.lastCat = typeof data.lastCat === 'string' ? data.lastCat : base.lastCat;
      return base;
    } catch (e) {
      return base;
    }
  }

  function validEntry(e) {
    return e && typeof e.id === 'string' && isFinite(e.amount) && e.amount > 0 && isFinite(e.at);
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  }

  var persistAsked = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('保存できませんでした。端末の空きが足りないかもしれません。');
      return false;
    }
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(function () {});
    }
    return true;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---- 分類 ------------------------------------------------------------ */

  function allCats() {
    var hidden = state.hiddenCats || [];
    var list = DEFAULT_CATS.filter(function (c) { return hidden.indexOf(c.id) < 0; });
    return list.concat(state.extraCats);
  }

  function catOf(id) {
    var all = DEFAULT_CATS.concat(state.extraCats);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return { id: id || 'other', name: 'その他', icon: '🧾' };
  }

  /* ---- 期間 ------------------------------------------------------------ */

  function startOfPeriod(date) {
    var d = new Date(date);
    var anchor = new Date(d.getFullYear(), d.getMonth(), state.startDay, 0, 0, 0, 0);
    if (d.getTime() < anchor.getTime()) anchor = new Date(d.getFullYear(), d.getMonth() - 1, state.startDay, 0, 0, 0, 0);
    return anchor;
  }

  function shiftMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, date.getDate(), 0, 0, 0, 0);
  }

  /* offset: 0 が今の期間。戻り値は { start, end(次の期間の始まり), days } */
  function periodAt(offset) {
    var start = shiftMonths(startOfPeriod(new Date()), offset);
    var end = shiftMonths(start, 1);
    return {
      start: start.getTime(),
      end: end.getTime(),
      days: Math.round((end.getTime() - start.getTime()) / 86400000)
    };
  }

  function periodLabel(period) {
    var s = new Date(period.start);
    var e = new Date(period.end - 1);
    if (state.startDay === 1) return s.getFullYear() + '年' + (s.getMonth() + 1) + '月';
    return (s.getMonth() + 1) + '/' + s.getDate() + '〜' + (e.getMonth() + 1) + '/' + e.getDate();
  }

  function entriesIn(period) {
    return state.entries.filter(function (e) {
      return e.at >= period.start && e.at < period.end;
    }).sort(function (a, b) { return b.at - a.at; });
  }

  function sum(list) {
    return list.reduce(function (t, e) { return t + e.amount; }, 0);
  }

  /* ---- 表示のための小道具 ----------------------------------------------- */

  function yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  function dayLabel(ts) {
    var d = new Date(ts);
    var today = new Date();
    var same = d.toDateString() === today.toDateString();
    var y = new Date(today.getTime() - 86400000);
    var yest = d.toDateString() === y.toDateString();
    var base = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）';
    if (same) return '今日 ' + base;
    if (yest) return 'きのう ' + base;
    return base;
  }

  function clockLabel(ts) {
    var d = new Date(ts);
    return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function pad(n) { return ('0' + n).slice(-2); }

  function localInput(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---- 温度（背景の地獄っぷり） ------------------------------------------ */

  function mix(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
      Math.round((a[3] + (b[3] - a[3]) * k) * 1000) / 1000
    ];
  }

  function rgba(c) {
    return c[3] >= 1 ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
      : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')';
  }

  function heatStyle(ratio) {
    var t = Math.max(0, Math.min(1.4, ratio));
    var i = 0;
    while (i < STOPS.length - 2 && t > STOPS[i + 1].t) i++;
    var a = STOPS[i], b = STOPS[i + 1];
    var k = (t - a.t) / (b.t - a.t);
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    var out = { flame: a.flame + (b.flame - a.flame) * k, embers: Math.round(a.embers + (b.embers - a.embers) * k) };
    COLOR_KEYS.forEach(function (key) { out[key] = mix(a[key], b[key], k); });
    return out;
  }

  function applyHeat(ratio) {
    var s = heatStyle(ratio);
    var root = document.documentElement.style;
    root.setProperty('--sky-1', rgba(s.sky1));
    root.setProperty('--sky-2', rgba(s.sky2));
    root.setProperty('--glow', rgba(s.glow));
    root.setProperty('--ink', rgba(s.ink));
    root.setProperty('--ink-dim', rgba(s.dim));
    root.setProperty('--card', rgba(s.card));
    root.setProperty('--line', rgba(s.line));
    root.setProperty('--accent', rgba(s.accent));
    root.setProperty('--accent-ink', rgba(s.accentInk));
    root.setProperty('--fab-shadow', rgba(s.fab));
    root.setProperty('--flame', String(Math.round(s.flame * 100) / 100));

    var meta = $('themeColor');
    if (meta) meta.setAttribute('content', rgba(s.sky1));

    document.body.classList.toggle('is-hell', ratio >= 1.15);
    renderEmbers(s.embers);
  }

  function renderEmbers(count) {
    if (count === emberCount) return;
    emberCount = count;
    var box = $('embers');
    var html = '';
    for (var i = 0; i < count; i++) {
      var x = Math.round(Math.random() * 100);
      var size = 2 + Math.round(Math.random() * 3);
      var dur = (5 + Math.random() * 6).toFixed(1);
      var delay = (-Math.random() * 8).toFixed(1);
      var dx = Math.round(-40 + Math.random() * 80);
      html += '<span style="--x:' + x + '%;--sz:' + size + 'px;--s:' + dur + 's;--d:' + delay + 's;--dx:' + dx + 'px"></span>';
    }
    box.innerHTML = html;
  }

  /* ---- ひとこと --------------------------------------------------------- */

  function verdictText(total, ratio) {
    var budget = state.budget;
    if (total === 0) return 'まだ何も使っていません。静かなものです。';
    if (ratio < .35) return 'まだ涼しい。この調子で。';
    if (ratio < .6) return '少しずつ熱を持ってきました。';
    if (ratio < .8) return '予算の' + Math.round(ratio * 100) + '%。そろそろ気をつけるころ。';
    if (ratio < 1) return 'あと ' + yen(budget - total) + ' で予算に届きます。焦げくさい。';
    if (ratio < 1.3) return '予算を ' + yen(total - budget) + ' 超えました。燃えています。';
    if (ratio < 1.8) return '地獄です。予算の' + (Math.round(ratio * 10) / 10) + '倍。';
    return '業火。予算の' + (Math.round(ratio * 10) / 10) + '倍を使いました。';
  }

  /* 記録した直後の反応。何に使いすぎているかを、その場で突きつける */
  function reactionText(entry, before, after, ratio) {
    var cat = catOf(entry.categoryId);
    var period = periodAt(0);
    var list = entriesIn(period);
    var byCat = groupByCat(list);
    var top = byCat[0];
    var mine = null;
    byCat.forEach(function (g) { if (g.id === entry.categoryId) mine = g; });

    if (ratio >= 1) {
      return cat.icon + ' ' + cat.name + ' に ' + yen(entry.amount) + '。予算を ' +
        yen(after - state.budget) + ' 超えています。';
    }
    if (before < state.budget && after >= state.budget) {
      return '予算を超えました。' + cat.name + ' の ' + yen(entry.amount) + ' が最後の一押し。';
    }
    if (top && mine && top.id === entry.categoryId && byCat.length > 1) {
      return cat.icon + ' ' + cat.name + ' が今期いちばん。すでに ' + yen(mine.total) + ' です。';
    }
    if (mine && mine.count >= 2) {
      return cat.icon + ' ' + cat.name + ' は今期 ' + mine.count + '回目、合わせて ' + yen(mine.total) + '。';
    }
    return cat.icon + ' ' + cat.name + ' に ' + yen(entry.amount) + '。記録しました。';
  }

  function groupByCat(list) {
    var map = {};
    list.forEach(function (e) {
      var id = e.categoryId || 'other';
      if (!map[id]) map[id] = { id: id, total: 0, count: 0 };
      map[id].total += e.amount;
      map[id].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  /* ---- 画面を描く ------------------------------------------------------- */

  function render() {
    var period = periodAt(0);
    var list = entriesIn(period);
    var total = sum(list);
    var ratio = state.budget > 0 ? total / state.budget : (total > 0 ? 2 : 0);

    applyHeat(ratio);

    $('periodLabel').textContent = periodLabel(period) + 'の合計';
    var totalEl = $('total');
    var totalText = yen(total);
    totalEl.textContent = totalText;
    totalEl.className = totalText.length > 11 ? 'total longer' : (totalText.length > 8 ? 'total long' : 'total');
    $('verdict').textContent = verdictText(total, ratio);

    var fill = Math.min(1, ratio) * 100;
    var over = ratio > 1 ? Math.min(1, (ratio - 1) / 1) * 100 : 0;
    $('gaugeFill').style.width = fill + '%';
    $('gaugeOver').style.width = over + '%';
    $('gaugeLeft').textContent = ratio >= 1
      ? '予算 ' + yen(state.budget) + ' を超過'
      : '予算 ' + yen(state.budget) + ' / のこり ' + yen(state.budget - total);
    $('gaugePace').textContent = paceText(period, total);

    renderQuick();
    renderList(list);
    if (view === 'look') renderLook();
  }

  function paceText(period, total) {
    var now = Date.now();
    if (now < period.start || now >= period.end || total === 0) return '';
    var elapsed = (now - period.start) / 86400000;
    if (elapsed < .5) return '';
    var pace = total / elapsed * period.days;
    return 'このペースだと期末 ' + yen(pace);
  }

  function renderQuick() {
    var recent = {};
    state.entries.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 40)
      .forEach(function (e) { recent[e.categoryId] = (recent[e.categoryId] || 0) + 1; });
    var cats = allCats().slice().sort(function (a, b) {
      return (recent[b.id] || 0) - (recent[a.id] || 0);
    }).slice(0, 5);
    $('quickCats').innerHTML = cats.map(function (c) {
      return '<button type="button" data-act="quick" data-cat="' + esc(c.id) + '">' +
        c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');
  }

  function renderList(list) {
    var box = $('entries');
    if (!list.length) {
      box.innerHTML = '<p class="empty">この期間の記録はまだありません。<br>カードを使ったら、その場で金額と分類だけ残してください。</p>';
      return;
    }
    var html = '';
    var day = '';
    var byDay = {};
    list.forEach(function (e) {
      var k = new Date(e.at).toDateString();
      byDay[k] = (byDay[k] || 0) + e.amount;
    });
    list.forEach(function (e) {
      var k = new Date(e.at).toDateString();
      if (k !== day) {
        day = k;
        html += '<div class="day-head"><span>' + esc(dayLabel(e.at)) + '</span><span>' + yen(byDay[k]) + '</span></div>';
      }
      var c = catOf(e.categoryId);
      var memo = e.memo ? esc(e.memo) : clockLabel(e.at);
      html += '<button class="entry" type="button" data-act="edit" data-id="' + esc(e.id) + '">' +
        '<span class="ico" aria-hidden="true">' + c.icon + '</span>' +
        '<span class="meta"><span class="name">' + esc(c.name) + '</span>' +
        '<span class="memo">' + memo + '</span></span>' +
        '<span class="amount">' + yen(e.amount) + '</span></button>';
    });
    box.innerHTML = html;
  }

  /* ---- ふりかえり -------------------------------------------------------- */

  function renderLook() {
    var period = periodAt(lookOffset);
    var prev = periodAt(lookOffset - 1);
    var list = entriesIn(period);
    var prevList = entriesIn(prev);
    var total = sum(list);
    var prevTotal = sum(prevList);

    $('lookLabel').textContent = periodLabel(period) + (lookOffset === 0 ? '（いまの期間）' : '');
    var nextBtn = document.querySelector('[data-act="next-period"]');
    if (nextBtn) nextBtn.disabled = lookOffset >= 0;

    var html = '';

    /* まとめ */
    var ratio = state.budget > 0 ? total / state.budget : 0;
    html += '<div class="panel">' +
      '<h2>つかった合計</h2>' +
      '<p class="big-line">' + yen(total) + '</p>' +
      '<p class="sub-line">予算 ' + yen(state.budget) + ' の ' + Math.round(ratio * 100) + '%' +
      '　/　' + list.length + '件　/　1日あたり ' + yen(total / period.days) + '</p>' +
      '</div>';

    if (!list.length) {
      html += '<p class="empty">この期間の記録はありません。</p>';
      $('lookBody').innerHTML = html;
      return;
    }

    /* 何に使ったか */
    var byCat = groupByCat(list);
    var max = byCat[0].total;
    var top = byCat[0];
    html += '<div class="panel"><h2>何に使ったか</h2>';
    html += '<p class="sub-line" style="margin:-4px 0 12px">いちばん燃やしたのは <b>' + esc(catOf(top.id).name) +
      '</b>。' + yen(top.total) + '（全体の ' + Math.round(top.total / total * 100) + '%、' + top.count + '件）</p>';
    byCat.forEach(function (g, i) {
      var c = catOf(g.id);
      html += '<div class="rank' + (i === 0 ? ' top' : '') + '">' +
        '<div class="rank-head"><span>' + c.icon + ' <b>' + esc(c.name) + '</b> <span class="n">' + g.count + '件</span></span>' +
        '<span>' + yen(g.total) + '<span class="n"> ' + Math.round(g.total / total * 100) + '%</span></span></div>' +
        '<div class="bar"><i style="width:' + Math.max(2, g.total / max * 100) + '%"></i></div></div>';
    });
    html += '</div>';

    /* 日ごとの燃え方 */
    var byDay = new Array(period.days).fill(0);
    list.forEach(function (e) {
      var i = Math.floor((e.at - period.start) / 86400000);
      if (i >= 0 && i < byDay.length) byDay[i] += e.amount;
    });
    var dayMax = Math.max.apply(null, byDay);
    var hotIndex = byDay.indexOf(dayMax);
    html += '<div class="panel"><h2>日ごと</h2><div class="days">';
    byDay.forEach(function (v) {
      var h = dayMax > 0 ? Math.max(2, Math.round(v / dayMax * 92)) : 2;
      html += '<div class="' + (v === 0 ? 'nil' : '') + '" style="height:' + h + 'px"></div>';
    });
    html += '</div><div class="days-foot"><span>' + esc(shortDate(period.start)) + '</span>' +
      '<span>' + esc(shortDate(period.end - 86400000)) + '</span></div>';
    if (dayMax > 0) {
      html += '<p class="sub-line" style="margin-top:8px">いちばん使った日は ' +
        esc(shortDate(period.start + hotIndex * 86400000)) + ' の ' + yen(dayMax) + '</p>';
    }
    html += '</div>';

    /* 前の期間とくらべる */
    if (prevList.length) {
      var d = total - prevTotal;
      html += '<div class="panel"><h2>前の期間とくらべて</h2>';
      html += '<p class="big-line">' + (d >= 0 ? '+' : '−') + yen(Math.abs(d)) + '</p>';
      html += '<p class="sub-line" style="margin-bottom:10px">' + esc(periodLabel(prev)) + ' は ' + yen(prevTotal) + ' でした</p>';
      var prevMap = {};
      groupByCat(prevList).forEach(function (g) { prevMap[g.id] = g.total; });
      var diffs = byCat.map(function (g) {
        return { id: g.id, d: g.total - (prevMap[g.id] || 0) };
      }).concat(Object.keys(prevMap).filter(function (id) {
        return !byCat.some(function (g) { return g.id === id; });
      }).map(function (id) { return { id: id, d: -prevMap[id] }; }));
      diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
      diffs.slice(0, 5).forEach(function (x) {
        if (x.d === 0) return;
        var c = catOf(x.id);
        html += '<div class="diff"><span>' + c.icon + ' ' + esc(c.name) + '</span>' +
          '<span class="' + (x.d > 0 ? 'up' : 'down') + '">' + (x.d > 0 ? '+' : '−') + yen(Math.abs(x.d)) + '</span></div>';
      });
      html += '</div>';
    }

    /* 大きかった買い物 */
    var big = list.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 3);
    html += '<div class="panel"><h2>大きかったもの</h2>';
    big.forEach(function (e) {
      var c = catOf(e.categoryId);
      html += '<div class="diff"><span>' + c.icon + ' ' + esc(c.name) +
        (e.memo ? ' <span class="n" style="color:var(--ink-dim)">' + esc(e.memo) + '</span>' : '') +
        '<br><span class="sub-line">' + esc(shortDate(e.at)) + '</span></span>' +
        '<span>' + yen(e.amount) + '</span></div>';
    });
    html += '</div>';

    $('lookBody').innerHTML = html;
  }

  function shortDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD[d.getDay()] + '）';
  }

  /* ---- シート ----------------------------------------------------------- */

  function openSheet(mode, html) {
    sheetMode = mode;
    $('sheet').innerHTML = html;
    $('overlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    sheetMode = null;
    editId = null;
    deleteArmed = false;
    if (deleteTimer) clearTimeout(deleteTimer);
    $('overlay').hidden = true;
    $('sheet').innerHTML = '';
    document.body.style.overflow = '';
  }

  function catGrid(selected) {
    return '<div class="cats" id="catGrid">' + allCats().map(function (c) {
      return '<button type="button" data-act="pick-cat" data-cat="' + esc(c.id) + '"' +
        (c.id === selected ? ' class="is-on"' : '') + '>' +
        '<span class="e" aria-hidden="true">' + c.icon + '</span>' + esc(c.name) + '</button>';
    }).join('') + '</div>';
  }

  function openEntrySheet(entry, presetCat) {
    editId = entry ? entry.id : null;
    draftCat = entry ? entry.categoryId : (presetCat || state.lastCat || 'other');
    draftAmount = entry ? String(entry.amount) : '';
    var at = entry ? entry.at : Date.now();

    var html = '<h2>' + (entry ? '記録をなおす' : 'カードを使った') + '</h2>' +
      '<div class="amount-field"><span class="yen" aria-hidden="true">¥</span>' +
      '<input id="amountInput" type="text" inputmode="numeric" pattern="[0-9]*" ' +
      'placeholder="0" autocomplete="off" value="' + (draftAmount ? Number(draftAmount).toLocaleString('ja-JP') : '') + '"></div>' +
      '<div class="plusses">' +
      '<button type="button" data-act="plus" data-v="100">+100</button>' +
      '<button type="button" data-act="plus" data-v="500">+500</button>' +
      '<button type="button" data-act="plus" data-v="1000">+1,000</button>' +
      '<button type="button" data-act="plus" data-v="5000">+5,000</button>' +
      '<button type="button" data-act="clear-amount">C</button>' +
      '</div>' +
      '<h3>何に使った？</h3>' + catGrid(draftCat) +
      '<div class="field"><label for="memoInput">メモ（任意）</label>' +
      '<input id="memoInput" type="text" maxlength="60" placeholder="店名など" value="' + esc(entry && entry.memo ? entry.memo : '') + '"></div>' +
      '<div class="field"><label for="atInput">日時</label>' +
      '<input id="atInput" type="datetime-local" value="' + localInput(at) + '"></div>' +
      '<div class="sheet-actions stick">' +
      '<button class="btn" type="button" data-act="close">やめる</button>' +
      '<button class="btn primary" type="button" data-act="save-entry">' + (entry ? '保存する' : '記録する') + '</button>' +
      '</div>' +
      (entry ? '<div class="sheet-actions"><button class="btn danger" type="button" data-act="delete-entry">この記録を削除</button></div>' : '') +
      '<p class="note">記録はこの端末の中だけに保存されます。</p>';

    openSheet('entry', html);
    var input = $('amountInput');
    input.focus();
    input.addEventListener('input', function () {
      var digits = input.value.replace(/[^0-9]/g, '').slice(0, 9);
      draftAmount = digits;
      input.value = digits ? Number(digits).toLocaleString('ja-JP') : '';
    });
  }

  function saveEntry() {
    var amount = Number(draftAmount || 0);
    if (!amount) {
      toast('金額を入れてください。');
      $('amountInput').focus();
      return;
    }
    var memo = ($('memoInput').value || '').trim();
    var atRaw = $('atInput').value;
    var at = atRaw ? new Date(atRaw).getTime() : Date.now();
    if (!isFinite(at)) at = Date.now();

    var beforeTotal = sum(entriesIn(periodAt(0)));
    var entry;
    if (editId) {
      entry = state.entries.filter(function (e) { return e.id === editId; })[0];
      if (!entry) return closeSheet();
      entry.amount = amount;
      entry.categoryId = draftCat;
      entry.memo = memo;
      entry.at = at;
    } else {
      entry = { id: uid(), amount: amount, categoryId: draftCat, memo: memo, at: at };
      state.entries.push(entry);
    }
    state.lastCat = draftCat;
    var editing = !!editId;
    save();
    closeSheet();
    render();

    var afterTotal = sum(entriesIn(periodAt(0)));
    var ratio = state.budget > 0 ? afterTotal / state.budget : 0;
    toast(editing ? '直しました。' : reactionText(entry, beforeTotal, afterTotal, ratio));
  }

  function deleteEntry() {
    if (!deleteArmed) {
      deleteArmed = true;
      var btn = document.querySelector('[data-act="delete-entry"]');
      if (btn) btn.textContent = 'もう一度押すと削除します';
      deleteTimer = setTimeout(function () {
        deleteArmed = false;
        var b = document.querySelector('[data-act="delete-entry"]');
        if (b) b.textContent = 'この記録を削除';
      }, 4000);
      return;
    }
    state.entries = state.entries.filter(function (e) { return e.id !== editId; });
    save();
    closeSheet();
    render();
    toast('削除しました。');
  }

  /* ---- メニューまわり ---------------------------------------------------- */

  function openMenu() {
    var html = '<h2>設定とデータ</h2>' +
      '<button class="menu-item" type="button" data-act="open-budget">' +
      '<span>予算と期間の区切り</span><span class="v">月 ' + yen(state.budget) + ' / 毎月' + state.startDay + '日から</span></button>' +
      '<button class="menu-item" type="button" data-act="open-cats">' +
      '<span>分類を増やす・減らす</span><span class="v">' + allCats().length + '個</span></button>' +
      '<button class="menu-item" type="button" data-act="open-data">' +
      '<span>データの書き出し・読み込み</span><span class="v">' + state.entries.length + '件</span></button>' +
      '<p class="note">記録はこの端末のブラウザの中だけに保存され、外部には送られません。' +
      '機種変更やブラウザのデータ削除で消えるので、ときどき書き出して保管してください。</p>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-act="close">閉じる</button></div>';
    openSheet('menu', html);
  }

  function openBudget() {
    var opts = '';
    for (var d = 1; d <= 28; d++) {
      opts += '<option value="' + d + '"' + (d === state.startDay ? ' selected' : '') + '>毎月' + d + '日から</option>';
    }
    var html = '<h2>予算と期間の区切り</h2>' +
      '<div class="field"><label for="budgetInput">1か月に使ってよい額</label>' +
      '<input id="budgetInput" type="text" inputmode="numeric" pattern="[0-9]*" value="' + state.budget.toLocaleString('ja-JP') + '"></div>' +
      '<div class="field"><label for="startInput">集計の区切り</label>' +
      '<select id="startInput">' + opts + '</select></div>' +
      '<p class="note">カードの締め日に合わせると、請求書と同じ区切りで見られます。</p>' +
      '<div class="sheet-actions">' +
      '<button class="btn" type="button" data-act="open-menu">もどる</button>' +
      '<button class="btn primary" type="button" data-act="save-budget">保存する</button></div>';
    openSheet('budget', html);
  }

  function saveBudget() {
    var raw = ($('budgetInput').value || '').replace(/[^0-9]/g, '');
    var budget = Number(raw);
    if (!budget) {
      toast('予算を入れてください。');
      return;
    }
    state.budget = budget;
    state.startDay = Number($('startInput').value) || 1;
    save();
    closeSheet();
    render();
    toast('予算を ' + yen(budget) + ' にしました。');
  }

  function openCats() {
    var hidden = state.hiddenCats || [];
    var html = '<h2>分類</h2>' +
      '<h3>使っている分類</h3><div class="chip-list">' +
      allCats().map(function (c) {
        return '<span class="chip">' + c.icon + ' ' + esc(c.name) +
          '<button type="button" data-act="hide-cat" data-cat="' + esc(c.id) + '" aria-label="' + esc(c.name) + 'を外す">×</button></span>';
      }).join('') + '</div>';

    if (hidden.length) {
      html += '<h3>外した分類</h3><div class="chip-list">' +
        hidden.map(function (id) {
          var c = catOf(id);
          return '<span class="chip">' + c.icon + ' ' + esc(c.name) +
            '<button type="button" data-act="show-cat" data-cat="' + esc(id) + '" aria-label="' + esc(c.name) + 'を戻す">＋</button></span>';
        }).join('') + '</div>';
    }

    html += '<h3>分類を足す</h3>' +
      '<div class="row"><div class="field" style="margin-top:0"><label for="newCatName">名前</label>' +
      '<input id="newCatName" type="text" maxlength="12" placeholder="例：ゲーム課金"></div>' +
      '<div class="field" style="margin-top:0;flex:0 0 92px"><label for="newCatIcon">絵文字</label>' +
      '<select id="newCatIcon">' + ICON_CHOICES.map(function (e) {
        return '<option value="' + e + '">' + e + '</option>';
      }).join('') + '</select></div></div>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-act="add-cat">この分類を足す</button></div>' +
      '<p class="note">外した分類は入力欄に出なくなります。過去の記録はそのまま残ります。</p>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-act="open-menu">もどる</button>' +
      '<button class="btn primary" type="button" data-act="close">閉じる</button></div>';
    openSheet('cats', html);
  }

  function addCat() {
    var name = ($('newCatName').value || '').trim();
    if (!name) {
      toast('名前を入れてください。');
      return;
    }
    var icon = $('newCatIcon').value || '🧾';
    state.extraCats.push({ id: 'x' + uid(), name: name.slice(0, 12), icon: icon });
    save();
    openCats();
    renderQuick();
    toast(icon + ' ' + name + ' を足しました。');
  }

  function openData() {
    var html = '<h2>データ</h2>' +
      '<p class="note" style="margin-top:0">' + state.entries.length + '件の記録があります。' +
      '書き出したファイルは、新しい端末で読み込めばそのまま続きを使えます。</p>' +
      '<div class="sheet-actions">' +
      '<button class="btn" type="button" data-act="export">ファイルに書き出す</button>' +
      '<button class="btn" type="button" data-act="copy">文字でコピー</button></div>' +
      '<h3>読み込む</h3>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-act="pick-file">ファイルを選ぶ</button></div>' +
      '<div class="field"><label for="importText">書き出した文字を貼り付けてもかまいません</label>' +
      '<textarea id="importText" rows="4" placeholder="{&quot;version&quot;:1,…"></textarea></div>' +
      '<div class="sheet-actions"><button class="btn primary" type="button" data-act="import-text">読み込む</button></div>' +
      '<p class="note">読み込むと、同じ記録は重ならないように足し合わせます。</p>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-act="open-menu">もどる</button></div>';
    openSheet('data', html);
  }

  function exportText() {
    return JSON.stringify({
      app: 'card-hell',
      version: 1,
      exportedAt: new Date().toISOString(),
      budget: state.budget,
      startDay: state.startDay,
      extraCats: state.extraCats,
      hiddenCats: state.hiddenCats,
      entries: state.entries
    });
  }

  function exportFile() {
    var blob = new Blob([exportText()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'card-hell-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('書き出しました。');
  }

  function copyText() {
    var text = exportText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('コピーしました。');
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = $('importText');
    if (ta) {
      ta.value = text;
      ta.focus();
      ta.select();
      toast('下の欄に出しました。長押しでコピーしてください。');
    }
  }

  function importData(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast('読み込めませんでした。');
      return;
    }
    if (!data || !Array.isArray(data.entries)) {
      toast('このデータには記録が入っていません。');
      return;
    }
    var have = {};
    state.entries.forEach(function (e) { have[e.id] = true; });
    var added = 0;
    data.entries.filter(validEntry).forEach(function (e) {
      if (have[e.id]) return;
      state.entries.push({
        id: e.id, amount: Math.round(e.amount), categoryId: e.categoryId || 'other',
        memo: typeof e.memo === 'string' ? e.memo.slice(0, 60) : '', at: e.at
      });
      have[e.id] = true;
      added++;
    });
    if (Array.isArray(data.extraCats)) {
      var ids = {};
      state.extraCats.forEach(function (c) { ids[c.id] = true; });
      data.extraCats.forEach(function (c) {
        if (c && c.id && c.name && !ids[c.id]) state.extraCats.push({ id: c.id, name: String(c.name).slice(0, 12), icon: c.icon || '🧾' });
      });
    }
    if (isFinite(data.budget) && data.budget > 0) state.budget = Math.round(data.budget);
    if (isFinite(data.startDay)) state.startDay = Math.min(28, Math.max(1, Math.round(data.startDay)));
    save();
    closeSheet();
    render();
    toast(added + '件を読み込みました。');
  }

  /* ---- トースト ---------------------------------------------------------- */

  var toastTimer = null;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  /* ---- 操作 -------------------------------------------------------------- */

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-act], [data-view]') : null;
    if (!el) return;

    var viewName = el.getAttribute('data-view');
    if (viewName) {
      switchView(viewName);
      return;
    }

    switch (el.getAttribute('data-act')) {
      case 'open-menu': openMenu(); break;
      case 'close': closeSheet(); break;
      case 'quick': openEntrySheet(null, el.getAttribute('data-cat')); break;
      case 'edit':
        var id = el.getAttribute('data-id');
        var entry = state.entries.filter(function (e) { return e.id === id; })[0];
        if (entry) openEntrySheet(entry);
        break;
      case 'pick-cat':
        draftCat = el.getAttribute('data-cat');
        Array.prototype.forEach.call($('catGrid').children, function (b) {
          b.classList.toggle('is-on', b.getAttribute('data-cat') === draftCat);
        });
        break;
      case 'plus':
        var add = Number(el.getAttribute('data-v'));
        draftAmount = String(Math.min(999999999, Number(draftAmount || 0) + add));
        $('amountInput').value = Number(draftAmount).toLocaleString('ja-JP');
        break;
      case 'clear-amount':
        draftAmount = '';
        $('amountInput').value = '';
        $('amountInput').focus();
        break;
      case 'save-entry': saveEntry(); break;
      case 'delete-entry': deleteEntry(); break;
      case 'open-budget': openBudget(); break;
      case 'save-budget': saveBudget(); break;
      case 'open-cats': openCats(); break;
      case 'add-cat': addCat(); break;
      case 'hide-cat':
        var hid = el.getAttribute('data-cat');
        if (allCats().length <= 1) { toast('分類は1つ以上必要です。'); break; }
        state.extraCats = state.extraCats.filter(function (c) { return c.id !== hid; });
        if (DEFAULT_CATS.some(function (c) { return c.id === hid; })) state.hiddenCats.push(hid);
        save();
        openCats();
        renderQuick();
        break;
      case 'show-cat':
        var sid = el.getAttribute('data-cat');
        state.hiddenCats = state.hiddenCats.filter(function (x) { return x !== sid; });
        save();
        openCats();
        renderQuick();
        break;
      case 'open-data': openData(); break;
      case 'export': exportFile(); break;
      case 'copy': copyText(); break;
      case 'pick-file': $('fileInput').click(); break;
      case 'import-text': importData(($('importText').value || '').trim()); break;
      case 'prev-period': lookOffset--; renderLook(); break;
      case 'next-period': if (lookOffset < 0) { lookOffset++; renderLook(); } break;
    }
  });

  function switchView(name) {
    view = name;
    $('viewNow').hidden = name !== 'now';
    $('viewLook').hidden = name !== 'look';
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-view') === name;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (name === 'look') renderLook();
    window.scrollTo(0, 0);
  }

  $('addBtn').addEventListener('click', function () { openEntrySheet(null); });

  $('overlay').addEventListener('click', function (ev) {
    if (ev.target === $('overlay')) closeSheet();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && sheetMode) closeSheet();
    if (ev.key === 'Enter' && sheetMode === 'entry' && ev.target.id === 'amountInput') saveEntry();
  });

  $('fileInput').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importData(String(reader.result || '')); };
    reader.onerror = function () { toast('ファイルを読めませんでした。'); };
    reader.readAsText(file);
    this.value = '';
  });

  /* 日付が変わったら期間の表示を直す */
  setInterval(function () {
    if (!sheetMode) render();
  }, 60000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !sheetMode) render();
  });

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
