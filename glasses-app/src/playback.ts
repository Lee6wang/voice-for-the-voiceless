export type PlaybackResult = 'completed' | 'failed' | 'cancelled';

export interface AudioLike {
  onended: ((...args: any[]) => unknown) | null;
  onerror: ((...args: any[]) => unknown) | null;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
}

export interface SpeechUtteranceLike {
  lang: string;
  onend: ((...args: any[]) => unknown) | null;
  onerror: ((...args: any[]) => unknown) | null;
}

export interface SpeechAdapter {
  create(text: string): SpeechUtteranceLike;
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
}

export interface PlaybackAdapters {
  createAudio(src: string): AudioLike;
  speech: SpeechAdapter | null;
  setTimer(cb: () => void, ms: number): number;
  clearTimer(id: number): void;
}

function browserAdapters(): PlaybackAdapters {
  const speech: SpeechAdapter | null =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
      ? {
          create: (text) => new SpeechSynthesisUtterance(text),
          speak: (utterance) =>
            window.speechSynthesis.speak(utterance as SpeechSynthesisUtterance),
          cancel: () => window.speechSynthesis.cancel(),
        }
      : null;
  return {
    createAudio: (src) => new Audio(src),
    speech,
    setTimer: (cb, ms) => window.setTimeout(cb, ms),
    clearTimer: (id) => window.clearTimeout(id),
  };
}

/**
 * 手机端单实例播音控制器。
 * 新播放会取消旧播放；调用方可区分正常结束、失败和主动取消，避免取消后误走降级朗读。
 */
export class PlaybackController {
  private currentAudio: AudioLike | null = null;
  private currentSpeech: SpeechUtteranceLike | null = null;
  private finishCurrent: ((result: PlaybackResult) => void) | null = null;

  constructor(private readonly adapters: PlaybackAdapters = browserAdapters()) {}

  stop(): void {
    const finish = this.finishCurrent;
    this.finishCurrent = null;
    const audio = this.currentAudio;
    this.currentAudio = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* 某些 WebView 不允许修改尚未加载的 currentTime */
      }
    }
    const speech = this.currentSpeech;
    this.currentSpeech = null;
    if (speech) {
      speech.onend = null;
      speech.onerror = null;
    }
    this.adapters.speech?.cancel();
    finish?.('cancelled');
  }

  async playAudio(
    base64: string,
    mime = 'audio/mp3',
    onStarted?: () => void,
  ): Promise<PlaybackResult> {
    this.stop();
    if (!base64) return 'failed';

    let audio: AudioLike;
    try {
      audio = this.adapters.createAudio(`data:${mime};base64,${base64}`);
    } catch {
      return 'failed';
    }
    this.currentAudio = audio;

    return new Promise<PlaybackResult>((resolve) => {
      let settled = false;
      const finish = (result: PlaybackResult) => {
        if (settled) return;
        settled = true;
        if (this.finishCurrent === finish) this.finishCurrent = null;
        if (this.currentAudio === audio) this.currentAudio = null;
        audio.onended = null;
        audio.onerror = null;
        resolve(result);
      };
      this.finishCurrent = finish;
      audio.onended = () => finish('completed');
      audio.onerror = () => finish('failed');
      void audio.play().then(onStarted, () => finish('failed'));
    });
  }

  async speakText(text: string, onStarted?: () => void): Promise<PlaybackResult> {
    this.stop();
    const speech = this.adapters.speech;
    if (!speech) return 'failed';

    let utterance: SpeechUtteranceLike;
    try {
      utterance = speech.create(text);
    } catch {
      return 'failed';
    }
    utterance.lang = 'zh-CN';
    this.currentSpeech = utterance;

    return new Promise<PlaybackResult>((resolve) => {
      let settled = false;
      let timer: number | undefined;
      const finish = (result: PlaybackResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) this.adapters.clearTimer(timer);
        if (this.finishCurrent === finish) this.finishCurrent = null;
        if (this.currentSpeech === utterance) this.currentSpeech = null;
        utterance.onend = null;
        utterance.onerror = null;
        resolve(result);
      };
      this.finishCurrent = finish;
      utterance.onend = () => finish('completed');
      utterance.onerror = () => finish('failed');
      timer = this.adapters.setTimer(() => finish('failed'), 8000);
      try {
        speech.speak(utterance);
        onStarted?.();
      } catch {
        finish('failed');
      }
    });
  }
}
