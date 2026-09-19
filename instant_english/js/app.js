/*
 * 画面の組み立てと操作。
 * 流れ: 日本語を見る → 声に出す（音声認識） → 答え合わせ → お手本に重ねて言う
 */

import { PHRASES } from "./data/phrases.js";
import { STEPS, TAGS } from "./data/decks.js";
import { Store, streakOf, DEFAULT_SETTINGS } from "./store.js";
import { buildSession, summarize, lengthOf, LENGTHS, filterPhrases } from "./session.js";
import { review, blankProgress, isDue, isLearned, dayKey } from "./srs.js";
import { bestMatch } from "./match.js";
import { Voice, Listener, ERROR_MESSAGES } from "./speech.js";
import { Recorder, Player } from "./record.js";

const $ = (id) => document.getElementById(id);
const esc = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const voice = new Voice();
const listener = new Listener();
const recorder = new Recorder();
const player = new Player();

const state = {
  store: null,
  progress: {},
  days: {},
  settings: { ...DEFAULT_SETTINGS },
  course: { mode: "auto", value: null },
  session: null,
  current: null,
  retry: [],        // 結果画面に出している文（録った声もここに付いている）
  micConflicts: 0,  // 録音と音声認識がぶつかった回数
};

/** 「言い終わった」を押されるのを待つとき、その解決役を入れておく */
let doneSpeaking = null;
/** 聞き比べを再生中か */
let comparing = false;

/* ══ 画面の切り替え ══════════════════════════════════════ */

function show(name) {
  for (const id of ["home", "drill", "result"]) $(id).hidden = id !== name;
  window.scrollTo(0, 0);
}

let toastTimer = 0;
function toast(message) {
  if (!message) return;
  const box = $("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
  }, 3200);
}

/* ══ ホーム ══════════════════════════════════════════════ */

function courseLabel() {
  const { mode, value } = state.course;
  if (mode === "step") return STEPS.find((s) => s.key === value)?.name ?? "";
  if (mode === "tag") return TAGS.find((t) => t.key === value)?.name ?? "";
  return "おまかせ";
}

function currentFilter() {
  return state.course.mode === "auto" ? { mode: "auto" } : { mode: state.course.mode, value: state.course.value };
}

function renderCourseChoices() {
  const box = $("course-choices");
  const { mode, value } = state.course;
  if (mode === "auto") {
    box.hidden = true;
    box.innerHTML = "";
    $("course-hint").textContent = "期限が来た復習と、まだ出していない文を混ぜて出します。";
    return;
  }
  const today = dayKey();
  const items =
    mode === "step"
      ? STEPS.map((s) => ({ key: s.key, label: s.name, note: s.note }))
      : TAGS.map((t) => ({ key: t.key, label: `${t.emoji} ${t.name}`, note: "" }));

  box.innerHTML = items
    .map((item) => {
      const pool = filterPhrases(PHRASES, { mode, value: item.key });
      const learned = pool.filter((p) => isLearned(state.progress[p.id])).length;
      const on = String(value) === String(item.key) ? " class=\"on\"" : "";
      return `<button type="button" data-key="${esc(item.key)}"${on}>${esc(item.label)}<em>${learned}/${pool.length}</em></button>`;
    })
    .join("");
  box.hidden = false;

  const pool = filterPhrases(PHRASES, currentFilter());
  const due = pool.filter((p) => isDue(state.progress[p.id], today)).length;
  $("course-hint").textContent =
    mode === "step"
      ? `${courseLabel()}（${STEPS.find((s) => s.key === value)?.note ?? ""}）· ${pool.length}文 · 今日の復習 ${due}`
      : `${courseLabel()} · ${pool.length}文 · 今日の復習 ${due}`;
}

function renderHome() {
  const today = dayKey();
  const streak = streakOf(state.days, today);
  const todayRow = state.days[today];

  $("streak-flame").classList.toggle("lit", streak > 0);
  if (streak > 0) {
    $("streak-count").innerHTML = `<b>${streak}</b>日つづけて練習中`;
  } else {
    $("streak-count").textContent = "今日から始めましょう";
  }
  $("streak-note").textContent = todayRow
    ? `今日は ${todayRow.count}問 · 言えた ${todayRow.good}問`
    : "1セット5分。毎日ちょっとずつが効きます。";

  const learned = PHRASES.filter((p) => isLearned(state.progress[p.id])).length;
  $("learned-count").textContent = `${learned} / ${PHRASES.length}`;
  $("learned-bar").style.width = `${Math.round((learned / PHRASES.length) * 100)}%`;

  renderCourseChoices();

  // はじめるボタンの内訳
  const pool = filterPhrases(PHRASES, currentFilter());
  const count = Math.min(lengthOf(state.settings.length).count, pool.length);
  const due = pool.filter((p) => isDue(state.progress[p.id], today)).length;
  const reviewCount = Math.min(due, Math.max(1, Math.round(count * 0.6)));
  $("start-sub").textContent = `${courseLabel()} · ${count}問（復習 ${reviewCount} / 新しい文 ${count - reviewCount}）`;

  const note = $("mic-note");
  const recording = recorder.supported && state.settings.record ? "録音した自分の声を、お手本と聞き比べられます。" : "";
  if (!listener.supported) {
    note.textContent = "この端末のブラウザでは音声認識が使えません。声に出したあと、自分で「言えた／惜しい／もう一度」を選んで進みます。" + recording;
  } else if (!state.settings.useRecognition) {
    note.textContent = "音声認識はオフです。声に出したあと、自分で判定して進みます。" + recording;
  } else {
    note.textContent = "音声認識は通信を使います（端末の外で文字にする仕組みのため）。オフラインのときは設定でオフにしてください。" + recording;
  }
}

/* ══ 練習 ════════════════════════════════════════════════ */

function phase(name) {
  $("phase-ask").hidden = name !== "ask";
  $("phase-listen").hidden = name !== "listen";
  $("phase-answer").hidden = name !== "answer";
}

function startSession() {
  voice.unlock();
  const filter = currentFilter();
  const pool = filterPhrases(PHRASES, filter);
  if (!pool.length) return toast("その組み合わせには問題がありません。");
  const queue = buildSession({
    phrases: PHRASES,
    progress: state.progress,
    today: dayKey(),
    count: lengthOf(state.settings.length).count,
    filter,
  });
  state.session = { queue, index: 0, results: [], startedAt: Date.now() };
  show("drill");
  showPhrase();
}

function showPhrase() {
  const session = state.session;
  const phrase = session.queue[session.index];
  state.current = { phrase, match: null, grade: null };

  $("drill-counter").textContent = `${session.index + 1} / ${session.queue.length}`;
  $("drill-bar").style.width = `${(session.index / session.queue.length) * 100}%`;
  $("ja").textContent = phrase.ja;
  $("pattern").textContent = phrase.pattern;
  $("pattern").hidden = !state.settings.showPattern;

  const listening = canListen();
  const interactive = listening || canRecord();
  $("mic").classList.toggle("quiet", !interactive);
  $("mic-label").textContent = listening ? "タップして話す" : interactive ? "タップして録音" : "言えたらタップ";
  $("mic").querySelector(".mic-icon").textContent = interactive ? "🎙" : "💬";
  $("give-up").hidden = !interactive;
  $("heard").textContent = "聞いています…";
  $("heard").classList.remove("live");
  $("rec-note").hidden = true;
  $("mine-row").hidden = true;
  stopCompare();

  phase("ask");
}

const canListen = () => listener.supported && state.settings.useRecognition;
const canRecord = () => recorder.supported && state.settings.record;

async function listen() {
  voice.unlock();
  voice.stop();
  player.stop();

  const listening = canListen();
  const recordWanted = canRecord();
  if (!listening && !recordWanted) return reveal(null, null);

  phase("listen");
  $("heard").textContent = listening ? "聞いています…" : "どうぞ。言い終わったらボタンを押してください。";
  $("heard").classList.remove("live");

  // マイクは録音のほうから先に押さえる（音声認識と取り合いにならないように）
  const recording = recordWanted ? await recorder.start() : false;
  $("rec-note").hidden = !recording;

  let heard = [];
  let error = "";
  if (listening) {
    ({ heard, error } = await listener.listen({
      onInterim: (text) => {
        $("heard").textContent = text;
        $("heard").classList.add("live");
      },
    }));
  } else {
    await new Promise((resolve) => {
      doneSpeaking = resolve;
    });
    doneSpeaking = null;
  }

  const blob = recording ? await recorder.stop() : null;
  $("rec-note").hidden = true;

  if (!state.session || $("drill").hidden) return; // 途中でやめた
  if (heard.length) {
    reveal(bestMatch(heard, [state.current.phrase.en, ...state.current.phrase.alts]), blob);
    return;
  }
  if (listening) handleListenError(error, recording);
  reveal(null, blob);
}

/** 聞き取れなかったときの後始末。録音できていたならマイク自体は生きている。 */
function handleListenError(error, recording) {
  if (recording && (error === "audio-capture" || error === "not-allowed")) {
    state.micConflicts += 1;
    if (state.micConflicts >= 2) {
      set("record", false);
      syncSettingsForm();
      toast("録音と音声認識が同時に使えないようなので、録音をオフにしました。設定で戻せます。");
    } else {
      toast("録音と音声認識がぶつかったようです。次もだめなら録音をオフにします。");
    }
    return;
  }
  if (error && ERROR_MESSAGES[error] !== "") toast(ERROR_MESSAGES[error] ?? "うまく聞き取れませんでした。");
  if (error === "not-allowed" || error === "service-not-allowed") {
    state.settings.useRecognition = false;
    state.store?.setSetting("useRecognition", false).catch(() => {});
    syncSettingsForm();
  }
}

/** match が null のときは判定なし（自己申告で決める）。blob は録れた自分の声。 */
function reveal(match, blob = null) {
  const phrase = state.current.phrase;
  state.current.match = match;
  state.current.blob = blob;
  state.current.grade = match ? match.grade : null;
  $("mine-row").hidden = !blob;
  stopCompare();

  const verdict = $("verdict");
  const labels = { good: ["◎", "言えた"], close: ["△", "惜しい"], again: ["×", "もう一度"] };
  const [mark, text] = match ? labels[match.grade] : ["?", "自分で判定してください"];
  verdict.className = `verdict ${match ? match.grade : "plain"}`;
  verdict.querySelector(".verdict-mark").textContent = mark;
  verdict.querySelector(".verdict-text").textContent = text;

  // お手本。言えていない語に印をつける
  const answer = match?.answer ?? phrase.en;
  if (match && match.answerWords?.length) {
    $("en").innerHTML = match.answerWords
      .map((w) => (w.hit ? esc(w.word) : `<span class="miss">${esc(w.word)}</span>`))
      .join(" ");
  } else {
    $("en").textContent = answer;
  }

  const lines = [];
  if (match?.said) {
    const extra = new Set(match.extra ?? []);
    const words = (match.saidWords ?? [])
      .map((w) => (extra.has(w.word) ? `<span class="extra">${esc(w.word)}</span>` : esc(w.word)))
      .join(" ");
    lines.push(`聞こえた: ${words}`);
  }
  // 別解のほうが近かったときは、もとのお手本も添える
  if (match && match.answer !== phrase.en) lines.push(`ほかの言い方: ${esc(phrase.en)}`);
  const said = $("said");
  said.innerHTML = lines.join("<br>");
  said.hidden = lines.length === 0;

  $("self-title").textContent = match ? "ちがうと思ったら選び直せます" : "自分ではどうでしたか";
  for (const button of $("phase-answer").querySelectorAll(".self-row button")) {
    button.classList.toggle("on", button.dataset.grade === state.current.grade);
  }
  setOverlapLabel(0);
  phase("answer");

  if (state.settings.autoSpeak) voice.speak(answer);
}

function setOverlapLabel(playing) {
  const times = state.settings.overlapTimes;
  $("overlap-label").textContent = playing ? `${playing} / ${times} · 止める` : `重ねて言う ×${times}`;
  $("play-overlap").classList.toggle("on", playing > 0);
}

function answerText() {
  return state.current?.match?.answer ?? state.current?.phrase.en ?? "";
}

/** 録れた自分の声を鳴らす（もう一度押すと止まる） */
async function playMine() {
  const blob = state.current?.blob;
  if (!blob) return;
  voice.stopLoop();
  setOverlapLabel(0);
  stopCompare();
  if (player.playing) {
    player.stop();
    $("play-mine").classList.remove("on");
    return;
  }
  $("play-mine").classList.add("on");
  await player.play(blob);
  $("play-mine").classList.remove("on");
}

/** お手本 → 自分の声 の順に続けて鳴らす */
async function playCompare() {
  const blob = state.current?.blob;
  if (!blob) return;
  if (comparing) return stopCompare();
  voice.stopLoop();
  setOverlapLabel(0);
  player.stop();
  $("play-mine").classList.remove("on");

  comparing = true;
  $("play-compare").classList.add("on");
  $("compare-label").textContent = "お手本…";
  await voice.speak(answerText());
  if (!comparing) return;
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (!comparing) return;
  $("compare-label").textContent = "あなた…";
  await player.play(blob);
  stopCompare();
}

function stopCompare() {
  if (comparing) {
    voice.stop();
    player.stop();
  }
  comparing = false;
  $("play-compare").classList.remove("on");
  $("compare-label").textContent = "聞き比べ";
}

async function toggleOverlap() {
  if (voice.looping) {
    voice.stopLoop();
    setOverlapLabel(0);
    return;
  }
  await voice.loop(answerText(), {
    times: state.settings.overlapTimes,
    onCount: (n) => setOverlapLabel(n),
  });
  setOverlapLabel(0);
}

function setGrade(grade) {
  state.current.grade = grade;
  for (const button of $("phase-answer").querySelectorAll(".self-row button")) {
    button.classList.toggle("on", button.dataset.grade === grade);
  }
  const verdict = $("verdict");
  const labels = { good: ["◎", "言えた"], close: ["△", "惜しい"], again: ["×", "もう一度"] };
  verdict.className = `verdict ${grade}`;
  verdict.querySelector(".verdict-mark").textContent = labels[grade][0];
  verdict.querySelector(".verdict-text").textContent = labels[grade][1];
}

async function nextPhrase() {
  voice.stopLoop();
  stopCompare();
  player.stop();
  const grade = state.current.grade;
  if (!grade) return toast("「言えた／惜しい／もう一度」を選んでください。");

  const phrase = state.current.phrase;
  const today = dayKey();
  const updated = review(state.progress[phrase.id] ?? blankProgress(phrase.id), grade, today);
  state.progress[phrase.id] = updated;
  state.session.results.push({ id: phrase.id, grade, ja: phrase.ja, en: phrase.en, blob: state.current.blob });

  try {
    await state.store?.saveProgress([updated]);
    await saveToday(today);
  } catch {
    toast("記録の保存に失敗しました。");
  }

  state.session.index += 1;
  if (state.session.index >= state.session.queue.length) finishSession();
  else showPhrase();
}

async function saveToday(today) {
  const results = state.session.results;
  const row = {
    date: today,
    count: (state.days[today]?.count ?? 0) + 1,
    good: (state.days[today]?.good ?? 0) + (results[results.length - 1].grade === "good" ? 1 : 0),
  };
  state.days[today] = row;
  await state.store?.saveDay(row);
}

function finishSession() {
  const { results, startedAt } = state.session;
  const stats = summarize(results);
  const seconds = Math.round((Date.now() - startedAt) / 1000);

  $("score-big").textContent = `${Math.round(stats.rate * 100)}%`;
  $("score-note").textContent = `${stats.total}問 · ${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  $("score-breakdown").innerHTML = [
    ["var(--mint)", "言えた", stats.good],
    ["var(--amber)", "惜しい", stats.close],
    ["var(--coral)", "もう一度", stats.again],
  ]
    .map(([color, label, n]) => `<span><i style="background:${color}"></i>${label} ${n}</span>`)
    .join("");

  const retry = results.filter((r) => r.grade !== "good");
  state.retry = retry;
  $("retry-title").hidden = retry.length === 0;
  $("review-list").innerHTML = retry
    .map(
      (r, index) => `<li>
        <div class="texts"><p class="r-en">${esc(r.en)}</p><p class="r-ja">${esc(r.ja)}</p></div>
        <div class="plays-mini">
          <button type="button" data-say="${esc(r.en)}" aria-label="お手本を聞く">🔊</button>
          ${r.blob ? `<button type="button" data-mine="${index}" aria-label="自分の声を聞く">🙂</button>` : ""}
        </div>
      </li>`
    )
    .join("");

  state.session = null;
  show("result");
  renderHome();
}

function quitDrill() {
  listener.abort();
  if (doneSpeaking) {
    doneSpeaking();
    doneSpeaking = null;
  }
  recorder.discard();
  voice.stopLoop();
  stopCompare();
  player.stop();
  state.session = null;
  state.current = null;
  renderHome();
  show("home");
}

/* ══ 設定 ════════════════════════════════════════════════ */

function syncSettingsForm() {
  const s = state.settings;
  $("set-recognition").checked = s.useRecognition && listener.supported;
  $("set-recognition").disabled = !listener.supported;
  $("recognition-note").textContent = listener.supported
    ? "声を聞き取ってお手本と見くらべます。聞き取りには通信が必要です。"
    : "このブラウザでは使えません（iPhone は Safari をお試しください）。";
  $("set-record").checked = s.record && recorder.supported;
  $("set-record").disabled = !recorder.supported;
  $("record-note").textContent = recorder.supported
    ? "答え合わせでお手本と聞き比べられます。録った声は端末にも保存されず、アプリを閉じると消えます。"
    : "このブラウザでは録音が使えません。";
  $("set-pattern").checked = s.showPattern;
  $("set-autospeak").checked = s.autoSpeak;
  $("set-slow").value = s.slowRate;
  $("slow-value").textContent = `${s.slowRate}倍`;
  $("set-overlap").value = s.overlapTimes;
  $("overlap-value").textContent = `${s.overlapTimes}回`;

  const select = $("set-voice");
  const list = voice.list();
  select.innerHTML =
    `<option value="">自動で選ぶ</option>` +
    list
      .map((v) => `<option value="${esc(v.id)}">${esc(v.name)}${v.offline ? "" : " · 要通信"}</option>`)
      .join("");
  select.value = list.some((v) => v.id === s.voiceId) ? s.voiceId : "";
  if (!list.length) select.innerHTML = `<option value="">この端末には英語の音声がありません</option>`;
}

async function set(key, value) {
  state.settings[key] = value;
  voice.preferred = state.settings.voiceId;
  try {
    await state.store?.setSetting(key, value);
  } catch {
    toast("設定を保存できませんでした。");
  }
}

function exportData() {
  const payload = {
    app: "instant-english",
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    days: state.days,
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `瞬間英作文-${dayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("書き出しました。");
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "instant-english") throw new Error("形式ちがい");
    if (!confirm("今ある進み具合は、ファイルの内容に置き換わります。よろしいですか。")) return;
    await state.store.replaceAll({
      progress: data.progress ?? {},
      days: data.days ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    });
    const loaded = await state.store.loadAll();
    Object.assign(state, loaded);
    voice.preferred = state.settings.voiceId;
    syncSettingsForm();
    renderHome();
    toast("読み込みました。");
  } catch {
    toast("このファイルは読み込めませんでした。");
  }
}

async function resetData() {
  if (!confirm("進み具合と連続日数を全部消します。元に戻せません。よろしいですか。")) return;
  await state.store.clearProgress();
  state.progress = {};
  state.days = {};
  renderHome();
  toast("消しました。");
}

async function checkStorage() {
  const note = $("storage-note");
  if (!navigator.storage?.persist) return (note.textContent = "");
  try {
    const persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    note.textContent = persisted
      ? "この端末では、記録が勝手に消されないよう保護されています。"
      : "端末の空きが少ないと、記録が消えることがあります。ときどき書き出しておくと安心です。";
  } catch {
    note.textContent = "";
  }
}

/* ══ つなぎこみ ══════════════════════════════════════════ */

function wire() {
  // ホーム
  $("course-mode").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    for (const b of $("course-mode").children) b.classList.toggle("on", b === button);
    const mode = button.dataset.mode;
    state.course = {
      mode,
      value: mode === "step" ? STEPS[0].key : mode === "tag" ? TAGS[0].key : null,
    };
    renderHome();
  });

  $("course-choices").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (!button) return;
    const raw = button.dataset.key;
    state.course.value = state.course.mode === "step" ? Number(raw) : raw;
    renderHome();
  });

  $("length-choice").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-length]");
    if (!button) return;
    for (const b of $("length-choice").children) b.classList.toggle("on", b === button);
    set("length", button.dataset.length);
    renderHome();
  });

  $("start").addEventListener("click", startSession);

  // 練習
  $("mic").addEventListener("click", listen);
  $("done-speaking").addEventListener("click", () => {
    // 音声認識を使っているときは締めると結果が返る。録音だけのときは自分で解決する。
    if (doneSpeaking) doneSpeaking();
    else listener.stop();
  });
  $("give-up").addEventListener("click", () => {
    voice.unlock();
    reveal(null, null);
    setGrade("again");
  });
  $("quit").addEventListener("click", quitDrill);
  $("next").addEventListener("click", nextPhrase);
  $("play-normal").addEventListener("click", () => {
    voice.stopLoop();
    stopCompare();
    player.stop();
    setOverlapLabel(0);
    voice.speak(answerText());
  });
  $("play-slow").addEventListener("click", () => {
    voice.stopLoop();
    stopCompare();
    player.stop();
    setOverlapLabel(0);
    voice.speak(answerText(), { rate: state.settings.slowRate });
  });
  $("play-mine").addEventListener("click", playMine);
  $("play-compare").addEventListener("click", playCompare);
  $("play-overlap").addEventListener("click", () => {
    stopCompare();
    player.stop();
    toggleOverlap();
  });
  $("phase-answer").querySelector(".self-row").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-grade]");
    if (button) setGrade(button.dataset.grade);
  });

  // 結果
  $("again").addEventListener("click", startSession);
  $("to-home").addEventListener("click", () => {
    voice.stop();
    player.stop();
    renderHome();
    show("home");
  });
  $("review-list").addEventListener("click", (event) => {
    const say = event.target.closest("button[data-say]");
    if (say) {
      player.stop();
      voice.speak(say.dataset.say);
      return;
    }
    const mine = event.target.closest("button[data-mine]");
    if (mine) {
      voice.stop();
      player.play(state.retry[Number(mine.dataset.mine)]?.blob);
    }
  });

  // 設定
  $("open-settings").addEventListener("click", () => {
    voice.unlock();
    syncSettingsForm();
    checkStorage();
    const dialog = $("settings");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });
  $("set-recognition").addEventListener("change", (e) => {
    set("useRecognition", e.target.checked);
    renderHome();
  });
  $("set-record").addEventListener("change", (e) => {
    set("record", e.target.checked);
    state.micConflicts = 0;
    renderHome();
  });
  $("set-pattern").addEventListener("change", (e) => set("showPattern", e.target.checked));
  $("set-autospeak").addEventListener("change", (e) => set("autoSpeak", e.target.checked));
  $("set-voice").addEventListener("change", (e) => {
    set("voiceId", e.target.value);
    voice.preferred = e.target.value;
    voice.speak("This is how I sound.");
  });
  $("set-slow").addEventListener("input", (e) => {
    $("slow-value").textContent = `${Number(e.target.value)}倍`;
    set("slowRate", Number(e.target.value));
  });
  $("set-overlap").addEventListener("input", (e) => {
    $("overlap-value").textContent = `${Number(e.target.value)}回`;
    set("overlapTimes", Number(e.target.value));
  });
  $("export").addEventListener("click", exportData);
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importData(file);
    e.target.value = "";
  });
  $("reset").addEventListener("click", resetData);

  // 画面を離れたら声を止める
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      voice.stopLoop();
      stopCompare();
      player.stop();
      listener.abort();
    }
  });
}

async function init() {
  wire();
  try {
    state.store = await Store.open();
    const loaded = await state.store.loadAll();
    Object.assign(state, loaded);
  } catch (error) {
    toast("記録を保存できない設定になっています。練習はできますが、進み具合は残りません。");
  }
  if (!listener.supported) state.settings.useRecognition = false;
  if (!recorder.supported) state.settings.record = false;
  voice.preferred = state.settings.voiceId;

  for (const b of $("length-choice").children) b.classList.toggle("on", b.dataset.length === state.settings.length);
  for (const item of LENGTHS) {
    const button = $("length-choice").querySelector(`[data-length="${item.key}"]`);
    if (button) button.innerHTML = `${item.label}<small>${item.count}問</small>`;
  }
  renderHome();
  show("home");
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
