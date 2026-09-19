/*
 * 声まわり。端末の読み上げ（SpeechSynthesis）と音声認識（SpeechRecognition）を包む。
 *
 * iPhone (Safari) の事情に合わせてあるところ:
 *   - 読み上げは、最初の1回を必ず画面のタップの中で呼ばないと鳴らない → unlock()
 *   - getVoices() は最初は空。voiceschanged を待つ
 *   - 続けて speak するときは、前のものを cancel してからでないと詰まる
 *   - 音声認識は端末の外（Apple のサーバー）へ音を送るため、電波が要る。切っても使えるようにする
 *   - 認識中は読み上げを止める（マイクがスピーカーの音を拾うため）
 */

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

export class Voice {
  constructor() {
    this.voices = [];
    this.unlocked = false;
    this.preferred = "";
    if (synth) {
      const load = () => {
        this.voices = synth.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
      };
      load();
      synth.addEventListener?.("voiceschanged", load);
      // Safari は voiceschanged が飛ばないことがあるので、数回だけ見に行く
      let tries = 0;
      const timer = setInterval(() => {
        load();
        if (this.voices.length || ++tries > 10) clearInterval(timer);
      }, 300);
    }
  }

  get supported() {
    return Boolean(synth);
  }

  /** 設定で選べる音声の一覧 */
  list() {
    return this.voices.map((v) => ({ id: v.voiceURI, name: `${v.name} (${v.lang})`, offline: v.localService }));
  }

  pick() {
    if (!this.voices.length) return null;
    const chosen = this.voices.find((v) => v.voiceURI === this.preferred);
    if (chosen) return chosen;
    // 端末の中で鳴らせる（＝電波が無くても鳴る）en-US を優先
    return (
      this.voices.find((v) => v.localService && v.lang.replace("_", "-") === "en-US") ||
      this.voices.find((v) => v.localService) ||
      this.voices.find((v) => v.lang.replace("_", "-") === "en-US") ||
      this.voices[0]
    );
  }

  /** 画面のタップの中から1度だけ呼ぶ。以降どこからでも鳴らせるようになる。 */
  unlock() {
    if (!synth || this.unlocked) return;
    try {
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      synth.speak(warm);
      this.unlocked = true;
    } catch {
      /* 使えない端末では黙って諦める */
    }
  }

  stop() {
    try {
      synth?.cancel();
    } catch {
      /* noop */
    }
  }

  /** 読み上げる。終わったら（または失敗したら）解決する Promise を返す。 */
  speak(text, { rate = 1, pitch = 1 } = {}) {
    if (!synth || !text) return Promise.resolve(false);
    this.stop();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.pick();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = Math.min(1.3, Math.max(0.5, rate));
      utterance.pitch = pitch;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve(ok);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      // 鳴り終わりのイベントが来ないことがあるので、長さから見積もった時間で打ち切る
      const guard = setTimeout(() => finish(false), 2000 + (text.length / utterance.rate) * 120);
      try {
        synth.speak(utterance);
        synth.resume?.(); // 止まったままになる不具合よけ
      } catch {
        finish(false);
      }
    });
  }

  /**
   * オーバーラッピング用に、同じ文を間をあけて繰り返す。
   * onCount(回数) を毎回呼ぶ。stop() で止まる。
   */
  async loop(text, { times = 3, rate = 1, gap = 700, onCount = () => {} } = {}) {
    this.looping = true;
    for (let i = 1; i <= times; i++) {
      if (!this.looping) return i - 1;
      onCount(i);
      await this.speak(text, { rate });
      if (!this.looping) return i;
      if (i < times) await new Promise((r) => setTimeout(r, gap));
    }
    this.looping = false;
    return times;
  }

  stopLoop() {
    this.looping = false;
    this.stop();
  }
}

const Recognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const ERROR_MESSAGES = {
  "not-allowed": "マイクの使用が許可されていません。設定 → Safari → マイク を確認してください。",
  "service-not-allowed": "この端末では音声認識が使えませんでした。自己申告で進められます。",
  "audio-capture": "マイクが見つかりませんでした。",
  network: "音声認識には通信が必要です。電波の無いところでは自己申告で進めてください。",
  "no-speech": "声が聞き取れませんでした。もう一度どうぞ。",
  aborted: "",
};

export class Listener {
  constructor({ lang = "en-US" } = {}) {
    this.lang = lang;
    this.recognition = null;
    this.running = false;
  }

  get supported() {
    return Boolean(Recognition);
  }

  /**
   * 1回分の聞き取り。
   *   onInterim(text) … 話している途中の文字
   * 戻り値は { heard: string[], error: string } 。heard は可能性の高い順。
   */
  listen({ onInterim = () => {}, limitMs = 10000 } = {}) {
    if (!Recognition) return Promise.resolve({ heard: [], error: "unsupported" });
    this.abort();

    return new Promise((resolve) => {
      const recognition = new Recognition();
      this.recognition = recognition;
      this.running = true;
      recognition.lang = this.lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;

      let heard = [];
      let error = "";
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        this.running = false;
        this.recognition = null;
        resolve({ heard, error });
      };

      recognition.onresult = (event) => {
        const interim = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const list = [];
            for (let k = 0; k < result.length; k++) list.push(result[k].transcript.trim());
            heard = heard.concat(list.filter(Boolean));
          } else {
            interim.push(result[0].transcript);
          }
        }
        if (interim.length) onInterim(interim.join(" ").trim());
      };
      recognition.onerror = (event) => {
        error = event.error || "unknown";
      };
      recognition.onend = finish;

      const guard = setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          finish();
        }
      }, limitMs);

      try {
        recognition.start();
      } catch (e) {
        error = "start-failed";
        finish();
      }
    });
  }

  /** 話し終わったので締める（結果は返ってくる） */
  stop() {
    try {
      this.recognition?.stop();
    } catch {
      /* noop */
    }
  }

  /** 結果を捨てて止める */
  abort() {
    try {
      this.recognition?.abort();
    } catch {
      /* noop */
    }
    this.running = false;
  }
}
