/*
 * 自分の声を録って、お手本と聞き比べるための層。
 *
 * 録った音は「その場で聞き返すため」だけのもので、端末には保存しないし外へも送らない。
 * アプリを閉じると消える（メモリ上の Blob のまま持つ）。
 *
 * iPhone (Safari) の事情:
 *   - MediaRecorder は iOS 14.3 から。出てくる形式は audio/mp4（Chrome は webm）
 *   - マイクは音声認識も使う。先にこちらで押さえてから認識を始める
 *   - 再生は消音スイッチの影響を受ける（鳴らないときはスイッチを確認してもらう）
 */

const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** この端末で使える録音形式を選ぶ。どれも駄目なら "" （ブラウザ任せ）。 */
export function pickMimeType(isSupported) {
  if (typeof isSupported !== "function") return "";
  return TYPES.find((type) => isSupported(type)) ?? "";
}

export class Recorder {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
  }

  get supported() {
    return Boolean(
      typeof MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia
    );
  }

  /** 録音を始める。成功したら true。 */
  async start() {
    if (!this.supported) return false;
    await this.discard();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.stream = null;
      return false;
    }
    try {
      const mimeType = pickMimeType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) this.chunks.push(event.data);
      };
      // 少しずつ吐き出させる。短い発話だと、まとめ出しでは何も出てこないことがある
      this.recorder.start(250);
      return true;
    } catch {
      this.release();
      return false;
    }
  }

  get running() {
    return this.recorder?.state === "recording";
  }

  /** 録音を止めて Blob を返す。何も録れていなければ null。 */
  stop() {
    const recorder = this.recorder;
    if (!recorder) {
      this.release();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const finish = () => {
        const type = recorder.mimeType || this.chunks[0]?.type || "audio/mp4";
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.chunks = [];
        this.recorder = null;
        this.release();
        // 短すぎるものは雑音とみなして捨てる
        resolve(blob && blob.size > 1200 ? blob : null);
      };
      recorder.onstop = finish;
      try {
        if (recorder.state === "inactive") finish();
        else recorder.stop();
      } catch {
        finish();
      }
    });
  }

  /** 結果を捨てて止める */
  async discard() {
    if (this.recorder) await this.stop();
    this.release();
  }

  /** マイクを手放す（録音中の表示を消す） */
  release() {
    for (const track of this.stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
    this.stream = null;
  }
}

/** 録った声を鳴らす。前の音は止めて、URL も片付ける。 */
export class Player {
  constructor() {
    this.audio = typeof Audio !== "undefined" ? new Audio() : null;
    this.url = "";
    if (this.audio) this.audio.preload = "auto";
  }

  get playing() {
    return Boolean(this.audio && !this.audio.paused && !this.audio.ended);
  }

  stop() {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* noop */
    }
  }

  /** 鳴らし終わったら（または鳴らせなければ）解決する */
  play(blob) {
    if (!this.audio || !blob) return Promise.resolve(false);
    this.stop();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.audio.src = this.url;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve(ok);
      };
      this.audio.onended = () => finish(true);
      this.audio.onerror = () => finish(false);
      const guard = setTimeout(() => finish(false), 20000);
      this.audio.play().catch(() => finish(false));
    });
  }
}
