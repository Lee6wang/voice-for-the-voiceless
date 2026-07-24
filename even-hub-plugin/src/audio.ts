// 无声之声 · 音频工具
// 上行：G2 麦克风 PCM s16le 16kHz mono 分片 → 累积 → base64（无 WAV 头，契约 §5.4）
// 下行：/tts 的 base64 MP3 → Blob URL → <audio> 播放（手机扬声器）
// ⚠️ WebView 音频播放必须先由用户在手机控制页点「启用声音」解锁一次。

/** PCM 采集器：LISTENING 期间累积分片，stop 后一次性编码 */
export class PcmRecorder {
  private chunks: Uint8Array[] = [];
  private total = 0;
  recording = false;

  start(): void {
    this.chunks = [];
    this.total = 0;
    this.recording = true;
  }

  push(chunk: Uint8Array): void {
    if (!this.recording) return; // SPEAKING/IDLE 期间丢弃，防回声重识别
    this.chunks.push(chunk);
    this.total += chunk.length;
  }

  /** 累积时长（秒），按 16kHz s16le mono = 32000 字节/秒 */
  get seconds(): number {
    return this.total / 32000;
  }

  /** 结束采集并返回 base64（无 WAV 头）；空录音返回 null */
  stop(): string | null {
    this.recording = false;
    if (this.total === 0) return null;
    const merged = new Uint8Array(this.total);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];
    this.total = 0;
    return uint8ToBase64(merged);
  }
}

/** 分块转 base64，避免大数组展开触发调用栈上限 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

// ---- MP3 播放（手机扬声器）----

let player: HTMLAudioElement | null = null;
let unlocked = false;
let cancelPlayback: (() => void) | null = null;

export function audioUnlocked(): boolean {
  return unlocked;
}

/**
 * 用户点击「启用声音」时调用：静音播放一次以解锁 WebView 音频权限。
 * 必须在用户手势回调里同步调用 play()。
 */
export async function unlockAudio(): Promise<boolean> {
  try {
    player = player ?? new Audio();
    // 极短静音 MP3（约 0.03s），解锁后即可自由播放网络音频
    player.src =
      'data:audio/mpeg;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7kGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    await player.play();
    unlocked = true;
    return true;
  } catch {
    unlocked = false;
    return false;
  }
}

/** 立即停止当前 MP3 / Web Speech。紧急手势用它抢占普通播报。 */
export function stopPlayback(): void {
  const cancel = cancelPlayback;
  cancelPlayback = null;
  cancel?.();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** 播放 base64 MP3，resolve 于播放结束（或立即 reject）。SPEAKING 状态期间调用 */
export function playBase64Mp3(audioB64: string, mime = 'audio/mpeg'): Promise<void> {
  stopPlayback();
  return new Promise((resolve, reject) => {
    if (!audioB64) {
      reject(new Error('empty audio'));
      return;
    }
    const bytes = Uint8Array.from(atob(audioB64), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    player = player ?? new Audio();
    const activePlayer = player;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (cancelPlayback === cancel) cancelPlayback = null;
      activePlayer.onended = null;
      activePlayer.onerror = null;
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => {
      activePlayer.pause();
      activePlayer.removeAttribute('src');
      finish(new Error('audio playback stopped'));
    };
    cancelPlayback = cancel;
    player.src = url;
    player.onended = () => finish();
    player.onerror = () => finish(new Error('audio playback failed'));
    player.play().catch((e) => finish(e instanceof Error ? e : new Error('play() rejected')));
  });
}

/**
 * 降级链第 1 层：Web Speech API 朗读（WebView 播 MP3 不可靠时用）。
 * 返回 false = 本环境不支持，调用方继续降级（HUD 纯文字）。
 */
export function speakFallback(text: string): boolean {
  if (!('speechSynthesis' in window)) return false;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  window.speechSynthesis.speak(utter);
  return true;
}
