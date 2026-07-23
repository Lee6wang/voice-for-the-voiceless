// 无声之声 · 眼镜插件
// 职责：采 PCM / HUD 渲染 / R1 事件 / 云编排 / TTS 播放 / 选择状态机。
// SDK 细节收敛在 ./hub（采音/HUD/输入/播音），本文件只管状态机与云编排。
// 对应文档：docs/接口契约.md §2（状态机）、§3（后端接口）
//
// 双模式：有 Even bridge（Even App / 模拟器）走真实 SDK；纯浏览器下 hub 自动回退键盘+DOM。

import {
  pickTemplateCandidates, // 断网/后端不可达时的插件端兜底（②）
  type AsrRequest,
  type AsrResponse,
  type CandidateSet,
  type CandidatesRequest,
  type CandidatesResponse,
  type RawInput,
  type TtsRequest,
  type TtsResponse,
  type UiState,
  type UserProfile,
} from '@vftv/shared';
import { capturePcm, hudWrite, initHub, onInput, playAudioBase64 } from './hub';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

let state: UiState = 'IDLE';
let profile: UserProfile = { userId: 'demo', commonPhrases: [] };
let current: CandidateSet | null = null;

// ---- 主流程 ----

/** IDLE 下 tap：开始聆听（push-to-listen，采音 3~5s） */
async function startListening() {
  if (state !== 'IDLE') return;
  setState('LISTENING');
  renderHUD('🎧 聆听中…');
  const audio = await captureAudio(4000); // TODO(SDK): 采 4 麦 16kHz PCM 4 秒
  setState('THINKING');
  renderHUD('💭 思考中…');
  const heardText = await asr(audio);
  const turnId = `t_${Date.now()}`;
  current = { turnId, heardText, candidates: await getCandidates(turnId, heardText), highlightIndex: 0 };
  setState('CANDIDATES');
  renderCandidates(current);
}

/** 请求候选：先走 backend；backend/网络不可达 → 插件端模板库兜底 */
async function getCandidates(turnId: string, heardText: string, exclude: string[] = []) {
  try {
    const body: CandidatesRequest = { turnId, heardText, profile, exclude };
    const r = await fetch(`${BACKEND}/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`candidates ${r.status}`);
    return ((await r.json()) as CandidatesResponse).candidates;
  } catch {
    return pickTemplateCandidates(heardText, exclude); // ② 断网兜底
  }
}

/** 确认选中 → TTS 发声 */
async function confirmAndSpeak() {
  if (state !== 'CANDIDATES' || !current) return;
  const chosen = current.candidates[current.highlightIndex];
  setState('SPEAKING');
  await speak(chosen.text);
  setState('IDLE');
  renderHUD('');
}

// ---- 输入事件（语义随状态而变，见接口契约 §2）----
export function handleInput(input: RawInput) {
  if (input === 'temple_double_tap') return emergency(); // 任意状态
  switch (state) {
    case 'IDLE':
      if (input === 'tap') startListening();
      else if (input === 'double_tap') openActiveMode(); // P1：主动模式轮盘
      break;
    case 'CANDIDATES':
      if (!current) break;
      if (input === 'swipe_up') move(-1);
      else if (input === 'swipe_down') move(1);
      else if (input === 'tap') confirmAndSpeak();
      else if (input === 'double_tap') refresh(); // 换一批
      break;
  }
}

function move(delta: number) {
  if (!current) return;
  const n = current.candidates.length;
  current.highlightIndex = (current.highlightIndex + delta + n) % n;
  renderCandidates(current);
}

async function refresh() {
  if (!current) return;
  const seen = current.candidates.map((c) => c.text);
  current.candidates = await getCandidates(current.turnId, current.heardText, seen);
  current.highlightIndex = 0;
  renderCandidates(current);
}

async function emergency() {
  await speak(profile.emergencyText ?? '请帮帮我');
  setState('IDLE');
}

function setState(s: UiState) {
  state = s;
}

// ---- 采音 / ASR / TTS（采音与播音落在 ./hub，防回声见状态机）----

async function captureAudio(ms: number): Promise<string> {
  return capturePcm(ms); // 采四麦 16kHz PCM，返回 base64（无 bridge 时为空串）
}

async function asr(audio: string): Promise<string> {
  // 经 backend 代理调云 ASR
  try {
    const body: AsrRequest = { audio, final: true };
    const r = await fetch(`${BACKEND}/asr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return ((await r.json()) as AsrResponse).text ?? '';
  } catch {
    return '';
  }
}

async function speak(text: string) {
  // 防回声由「仅 LISTENING 窗口开麦、SPEAKING 期间不开麦」保证，无需守卫标志位
  let audio = '';
  try {
    const body: TtsRequest = { text, voice: profile.voice };
    const r = await fetch(`${BACKEND}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    audio = ((await r.json()) as TtsResponse).audio ?? '';
  } catch {
    /* 断网/无后端：audio 保持空，由 playAudioBase64 调试音或预录 WAV 兜底 */
  }
  await playAudioBase64(audio); // 播到手机扬声器（Day0 命脉；空音频时调试期会播测试音）
}

function renderHUD(text: string) {
  hudWrite(text);
}

function renderCandidates(set: CandidateSet) {
  const body =
    `听到：${set.heardText}\n` +
    set.candidates.map((c, i) => `${i === set.highlightIndex ? '▶ ' : '  '}${c.text}`).join('\n');
  hudWrite(body);
}

function openActiveMode() {
  // P1：主动模式意图轮盘（吃/喝/如厕/疼痛/呼叫），有余量再做
}

// 启动：先等 SDK bridge（超时回退纯浏览器），再注册输入并渲染首屏
initHub().then(() => {
  onInput(handleInput); // SDK 事件 + 键盘（开发期）统一入口
  renderHUD('无声之声 · 轻点戒指开始聆听');
});
