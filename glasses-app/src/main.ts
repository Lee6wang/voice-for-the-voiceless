// 无声之声 · 眼镜插件（骨架）
// 职责：采 PCM / HUD 渲染 / R1 事件 / 云编排 / TTS 播放 / 选择状态机。
// 现状：状态机与流程已搭；Even Hub SDK 的采音/HUD/输入/播音以 TODO 标注。
// 对应文档：docs/接口契约.md §2（状态机）、§3（后端接口）
//
// ⚠️ Even Hub SDK 接入：确认版本后 `npm i @evenrealities/even_hub_sdk`，
//    再把下面 4 处 TODO(SDK) 换成真实调用。开发期可用键盘在模拟器里代替戒指事件。

import {
  pickTemplateCandidates, // 断网/后端不可达时的插件端兜底（②）
  type CandidateSet,
  type CandidatesRequest,
  type CandidatesResponse,
  type RawInput,
  type UiState,
  type UserProfile,
} from '@vftv/shared';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

let state: UiState = 'IDLE';
let profile: UserProfile = { userId: 'demo', commonPhrases: [] };
let current: CandidateSet | null = null;
let micMuted = false; // 防回声：SPEAKING 时置 true

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
  micMuted = true;
  await speak(chosen.text);
  micMuted = false;
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
  micMuted = true;
  await speak(profile.emergencyText ?? '请帮帮我');
  micMuted = false;
  setState('IDLE');
}

function setState(s: UiState) {
  state = s;
}

// ---- 需要 Even Hub SDK 接入的部分（TODO(SDK)）----

async function captureAudio(_ms: number): Promise<ArrayBuffer> {
  // TODO(SDK): 用 Even Hub SDK 采集四麦 16kHz PCM
  return new ArrayBuffer(0);
}

async function asr(_audio: ArrayBuffer): Promise<string> {
  // 经 backend 代理调云 ASR
  try {
    const r = await fetch(`${BACKEND}/asr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: '', final: true }), // TODO: base64(audio)
    });
    return (await r.json()).text ?? '';
  } catch {
    return '';
  }
}

async function speak(text: string) {
  if (micMuted === false) return; // 只在标记静音后播放（防回声）
  try {
    const r = await fetch(`${BACKEND}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const { audio } = await r.json();
    // TODO(SDK/手机): 把 base64 音频播到手机扬声器（Day0 待验证：插件能否播音）
    void audio;
  } catch {
    /* 断网时可退回预录关键句 WAV */
  }
}

function renderHUD(text: string) {
  // TODO(SDK): 用 Even Hub SDK 渲染到 HUD（单色绿，≤4 容器）
  const el = document.getElementById('hud');
  if (el) el.textContent = text;
}

function renderCandidates(set: CandidateSet) {
  // TODO(SDK): 渲染 4 条候选，高亮 set.highlightIndex
  const el = document.getElementById('hud');
  if (el) {
    el.textContent =
      `听到：${set.heardText}\n` +
      set.candidates.map((c, i) => `${i === set.highlightIndex ? '▶ ' : '  '}${c.text}`).join('\n');
  }
}

function openActiveMode() {
  // P1：主动模式意图轮盘（吃/喝/如厕/疼痛/呼叫），有余量再做
}

// 开发期：用键盘在浏览器/模拟器里代替戒指事件
window.addEventListener('keydown', (e) => {
  const map: Record<string, RawInput> = {
    Enter: 'tap',
    ArrowUp: 'swipe_up',
    ArrowDown: 'swipe_down',
    ' ': 'double_tap',
    Escape: 'temple_double_tap',
  };
  const input = map[e.key];
  if (input) handleInput(input);
});

renderHUD('无声之声 · 按 Enter 开始聆听（开发期键盘代替戒指）');
