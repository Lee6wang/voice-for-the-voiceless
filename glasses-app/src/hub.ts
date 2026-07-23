// 无声之声 · Even Hub SDK 适配层
// 把 SDK 细节收敛到这里，main.ts 只调抽象函数，天然支持双模式：
//   有 bridge（Even App / 模拟器）→ 走真实 SDK；无 bridge（纯浏览器）→ 键盘 + DOM 兜底。
// 对应文档：docs/接口契约.md §2、方案 §5.2

import {
  AudioInputSource,
  CreateStartUpPageContainer,
  EventSourceType,
  OsEventTypeList,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import type { RawInput } from '@vftv/shared';

const HUD_CONTAINER_ID = 1;
const HUD_CONTAINER_NAME = 'hud';
const BRIDGE_TIMEOUT_MS = 1500; // waitForEvenAppBridge 卡住时的安全网

/** 启动首屏文字（直接写进启动页 content，确保容器一建好眼镜立刻有字） */
const WELCOME_TEXT = '无声之声 · 轻点戒指开始聆听';

let bridge: EvenAppBridge | null = null;
let hasBridge = false;

// 采音缓冲：只在 LISTENING 窗口内累积 PCM（防回声——SPEAKING 时不开麦）
let capturing = false;
let pcmChunks: Uint8Array[] = [];

/**
 * 初始化：等 bridge 就绪后建启动页（带欢迎文字）。
 * 宿主判定：真实宿主（Even App / 模拟器）会让 createStartUpPageContainer 返回 success，
 * 或存在 flutter_inappwebview 宿主 handler；两者皆无才当纯浏览器，回退 DOM+键盘。
 * 注意：SDK 的 bridge 单例在 DOM ready 时就会自标记 ready（纯浏览器也 resolve），不能单靠它判定。
 */
export async function initHub(): Promise<void> {
  const b = await withTimeout(waitForEvenAppBridge(), BRIDGE_TIMEOUT_MS).catch(() => null);
  if (!b) {
    hasBridge = false;
    return;
  }

  // 建启动页：一个全屏文本容器承载 HUD，初始内容直接放欢迎文字。
  const result = await b
    .createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            xPosition: 0,
            yPosition: 0,
            width: 576,
            height: 288,
            borderWidth: 1,
            borderColor: 5,
            paddingLength: 8,
            containerID: HUD_CONTAINER_ID,
            containerName: HUD_CONTAINER_NAME,
            content: WELCOME_TEXT,
            isEventCapture: 1,
          }),
        ],
      }),
    )
    .catch(() => StartUpPageCreateResult.invalid);

  // 真实宿主：建页成功 或 存在 flutter 宿主 handler（真机上两者应同时成立）
  if (result === StartUpPageCreateResult.success || hostHandlerPresent()) {
    bridge = b;
    hasBridge = true;
  } else {
    // 纯浏览器（无 Flutter 宿主）：回退 DOM+键盘开发模式
    hasBridge = false;
  }
}

/** 是否存在 Flutter 宿主的 callHandler（真机/App WebView 才有，纯浏览器没有）。 */
function hostHandlerPresent(): boolean {
  const w = window as unknown as { flutter_inappwebview?: { callHandler?: unknown } };
  return typeof w.flutter_inappwebview?.callHandler === 'function';
}

/** 写 HUD：有 bridge 走无闪局部更新 textContainerUpgrade，否则写 #hud（开发可视）。 */
export function hudWrite(content: string): void {
  if (hasBridge && bridge) {
    void bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: HUD_CONTAINER_ID,
        containerName: HUD_CONTAINER_NAME,
        content,
      }),
    );
    return;
  }
  const el = document.getElementById('hud');
  if (el) el.textContent = content;
}

/** 临时调试开关：真机排查事件用，验完改回 false。 */
const DEBUG_EVENTS = false;
const debugLog: string[] = [];

/** 注册输入：SDK 原生事件（有 bridge 时）+ 键盘（始终，供模拟器/纯浏览器开发）。 */
export function onInput(cb: (input: RawInput) => void): void {
  if (hasBridge && bridge) {
    bridge.onEvenHubEvent((event) => {
      // 采音窗口内的 PCM 只累积，不当作输入事件
      if (event.audioEvent) {
        if (capturing && event.audioEvent.audioPcm) {
          pcmChunks.push(toUint8(event.audioEvent.audioPcm));
        }
        return;
      }
      const input = mapEvent(event);
      // 调试：累积显示最近几条事件（一次 tap 可能发多个）+ 原始 json，定位手势类型在哪
      if (DEBUG_EVENTS) {
        const raw = JSON.stringify(event.jsonData ?? event) ?? '';
        debugLog.push(`in=${input ?? 'null'} ${raw.slice(0, 90)}`);
        while (debugLog.length > 5) debugLog.shift();
        hudWrite(debugLog.join('\n'));
        return; // 调试期不触发后续流程
      }
      if (input) cb(input);
    });
  }

  // 键盘始终注册：开发期用 Enter/↑/↓/空格/Esc 代替戒指/镜腿
  window.addEventListener('keydown', (e) => {
    const map: Record<string, RawInput> = {
      Enter: 'tap',
      ArrowUp: 'swipe_up',
      ArrowDown: 'swipe_down',
      ' ': 'double_tap',
      Escape: 'temple_double_tap',
    };
    const input = map[e.key];
    if (input) cb(input);
  });
}

/** 临时调试：采音结束后在眼镜显示采到的字节数，验完改回 false。 */
const DEBUG_AUDIO = false;

/**
 * 采音：开麦累积 PCM，ms 后关麦，返回 base64（喂 backend /asr）。
 * 健壮性：开麦失败/卡住（如未授麦克风权限）不阻塞流程——直接返回空串，
 * 上层 ASR 拿不到文字会走候选兜底，不会卡在「聆听中」。
 * 无 bridge（纯浏览器）也返回空串。
 */
export async function capturePcm(ms: number): Promise<string> {
  if (!hasBridge || !bridge) return '';
  pcmChunks = [];
  capturing = true;
  // 开麦带超时：未授权/卡住时不阻塞，返回空串让流程继续到候选兜底
  const ok = await withTimeout(bridge.audioControl(true, AudioInputSource.Glasses), 1500).catch(
    () => false,
  );
  if (!ok) {
    capturing = false;
    if (DEBUG_AUDIO) {
      hudWrite('开麦失败/超时（检查麦克风权限）');
      await sleep(3000);
    }
    return '';
  }
  await sleep(ms);
  await bridge.audioControl(false).catch(() => {});
  capturing = false;
  if (DEBUG_AUDIO) {
    const total = pcmChunks.reduce((n, c) => n + c.length, 0);
    hudWrite(`采到 PCM: ${total} 字节 / ${pcmChunks.length} 分片`);
    await sleep(3000);
  }
  return pcmToBase64(pcmChunks);
}

/** 临时调试：无真实 TTS 音频时播一段合成“滴”声，验手机扬声器通路。验完改回 false。 */
const DEBUG_TTS = false;

/**
 * 播 base64 音频到手机扬声器。
 * SDK 无音频输出 API（眼镜也无扬声器），走 WebView 浏览器 Audio——即 Day0 命脉验证点。
 * 调试期：传入空串且 DEBUG_TTS 时，播一段运行时合成的测试音（走相同的 new Audio(base64) 通路）。
 */
export async function playAudioBase64(b64: string, mime = 'audio/mp3'): Promise<void> {
  let data = b64;
  let useMime = mime;
  if (!data && DEBUG_TTS) {
    data = makeBeepWavBase64();
    useMime = 'audio/wav';
  }
  if (!data) return;
  const audio = new Audio(`data:${useMime};base64,${data}`);
  await audio.play().catch(() => {
    /* 自动播放策略/断网：交由上层（预录 WAV）兜底 */
  });
}

/** 运行时合成一段正弦 WAV（单声道 16bit）并返回 base64，用于验证扬声器通路。 */
function makeBeepWavBase64(freq = 440, ms = 400, rate = 16000): string {
  const samples = Math.floor((rate * ms) / 1000);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byteRate
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bits
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples; i++) {
    const amp = Math.sin((2 * Math.PI * freq * i) / rate) * 0.3 * 32767;
    view.setInt16(off, amp, true);
    off += 2;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ---- 内部工具 ----

/**
 * 事件 → RawInput。
 * 真机实测：
 * - swipe 上/下走 textEvent（eventType 1/2）；tap/double 走 sysEvent（携 eventSource）。
 * - ⚠️ CLICK_EVENT=0 是 protobuf 默认值，JSON 会把它省略，所以单击事件的 eventType 会缺失（undefined）；
 *   在确实是触摸事件时，把缺失的 eventType 当作 CLICK。
 * - 来源仅 sysEvent 携带；镜腿(GLASSES_L/R) double → 紧急，其余 double → 换一批。
 */
function mapEvent(event: EvenHubEvent): RawInput | null {
  const te = event.textEvent;
  const se = event.sysEvent;
  const source = se?.eventSource;

  // 仅处理触摸事件：textEvent 存在，或 sysEvent 带有有效触摸来源
  const isTouch =
    te !== undefined ||
    (se !== undefined && source !== undefined && source !== EventSourceType.TOUCH_EVENT_FORM_DUMMY_NULL);
  if (!isTouch) return null;

  // eventType 缺失 = CLICK(0)（protobuf 默认值被省略）
  const eventType = te?.eventType ?? se?.eventType ?? OsEventTypeList.CLICK_EVENT;
  const fromTemple =
    source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L ||
    source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R;

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      return 'tap';
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'swipe_up';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'swipe_down';
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return fromTemple ? 'temple_double_tap' : 'double_tap';
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 给 Promise 加超时：超时 reject，供 bridge 探测回退。 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bridge timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 宿主 PCM 可能是 Uint8Array / number[] / base64 string，统一成 Uint8Array。 */
function toUint8(pcm: Uint8Array | number[] | string): Uint8Array {
  if (pcm instanceof Uint8Array) return pcm;
  if (Array.isArray(pcm)) return Uint8Array.from(pcm);
  const bin = atob(pcm);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** 拼接 PCM 分片并转 base64（分块避免超大 spread 爆栈）。 */
function pcmToBase64(chunks: Uint8Array[]): string {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < merged.length; i += CHUNK) {
    binary += String.fromCharCode(...merged.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
