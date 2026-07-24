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
import {
  capturePcm,
  hudWrite,
  initHub,
  kvsGet,
  kvsSet,
  onInput,
  playAudioBase64,
  speakFallback,
  stopCapture,
} from './hub';
import {
  DEFAULT_SETTINGS,
  hideEmergency,
  initUi,
  renderQuickPhrases,
  setStatus,
  showEmergency,
  type AppSettings,
} from './ui';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
const PROFILE_KEY = 'profile';
const SETTINGS_KEY = 'settings';
const ONBOARD_KEY = 'onboarded';
const LISTEN_MS = 4000;
const IDLE_HINT = '无声之声 · 轻点戒指开始聆听';

let state: UiState = 'IDLE';
let profile: UserProfile = { userId: 'demo', commonPhrases: [] };
let settings: AppSettings = { ...DEFAULT_SETTINGS };
let current: CandidateSet | null = null;
let armed = false; // 两步确认：候选已锁定，再 tap 才说出
let flowId = 0; // 会话令牌：看门狗复位后丢弃迟到的旧流程结果
let emergencyActive = false;

// ---- 看门狗：LISTENING/THINKING 卡住 10s 强制复位（坏了也回得来）----
let watchdog: number | undefined;

function armWatchdog() {
  clearWatchdog();
  watchdog = window.setTimeout(() => {
    if (state === 'LISTENING' || state === 'THINKING') {
      flowId++; // 丢弃迟到结果
      stopCapture();
      setState('IDLE');
      renderHUD('没听清，轻点戒指再试一次');
    }
  }, 10000);
}

function clearWatchdog() {
  if (watchdog !== undefined) {
    clearTimeout(watchdog);
    watchdog = undefined;
  }
}

// ---- 主流程 ----

/** IDLE 下 tap：开始聆听（push-to-listen；聆听中再 tap 可提前结束） */
async function startListening() {
  if (state !== 'IDLE') return;
  const id = ++flowId;
  setState('LISTENING');
  armWatchdog();
  renderHUD(listenBar(0));
  try {
    const audio = await captureAudio(LISTEN_MS, (elapsed) => {
      if (id === flowId && state === 'LISTENING') renderHUD(listenBar(elapsed));
    });
    if (id !== flowId) return; // 已被看门狗/新流程接管
    setState('THINKING');
    renderHUD('💭 思考中…');
    const heardText = await asr(audio);
    if (id !== flowId) return;
    const turnId = `t_${Date.now()}`;
    const candidates = await getCandidates(turnId, heardText);
    if (id !== flowId) return;
    current = { turnId, heardText, candidates, highlightIndex: 0 };
    armed = false;
    setState('CANDIDATES');
    renderCandidates(current);
  } catch {
    // 任一环抛错都回得来，不让用户以为设备坏了
    if (id !== flowId) return;
    setState('IDLE');
    renderHUD('出了点问题，轻点戒指再试一次');
  } finally {
    if (id === flowId) clearWatchdog();
  }
}

/** 聆听倒计时进度条（控制感：能看到进度、可提前结束） */
function listenBar(elapsedMs: number): string {
  const n = 10;
  const filled = Math.min(n, Math.round((elapsedMs / LISTEN_MS) * n));
  return `🎧 聆听中 ${'█'.repeat(filled)}${'━'.repeat(n - filled)}\n（再点一下提前结束）`;
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

/** 确认选中 → TTS 发声 →「已替你说」确认（确定感，兼容听障） */
async function confirmAndSpeak() {
  if (state !== 'CANDIDATES' || !current) return;
  const chosen = current.candidates[current.highlightIndex];
  setState('SPEAKING');
  renderHUD('🔊 正在替你说…');
  await speak(chosen.text);
  renderHUD(`✓ 已替你说：${chosen.text}`);
  await sleepMs(2000);
  setState('IDLE');
  renderHUD(IDLE_HINT);
}

// ---- 输入事件（语义随状态而变，见接口契约 §2）----
export function handleInput(input: RawInput) {
  if (input === 'temple_double_tap') {
    void emergency(); // 任意状态
    return;
  }
  switch (state) {
    case 'IDLE':
      if (input === 'tap') startListening();
      else if (input === 'double_tap') openActiveMode(); // P1：主动模式轮盘
      break;
    case 'LISTENING':
      if (input === 'tap') stopCapture(); // 提前结束采音（控制感）
      break;
    case 'CANDIDATES':
      if (!current) break;
      if (input === 'swipe_up') move(-1);
      else if (input === 'swipe_down') move(1);
      else if (input === 'tap') {
        // 两步确认（可配置，默认开）：首 tap 锁定高亮，再 tap 才说出（防误触）
        if (settings.twoStepConfirm && !armed) {
          armed = true;
          renderCandidates(current);
        } else {
          armed = false;
          confirmAndSpeak();
        }
      } else if (input === 'double_tap') refresh(); // 换一批
      break;
  }
}

function move(delta: number) {
  if (!current) return;
  armed = false; // 换了选择，需重新锁定
  const n = current.candidates.length;
  current.highlightIndex = (current.highlightIndex + delta + n) % n;
  renderCandidates(current);
}

async function refresh() {
  if (!current) return;
  armed = false;
  const seen = current.candidates.map((c) => c.text);
  current.candidates = await getCandidates(current.turnId, current.heardText, seen);
  current.highlightIndex = 0;
  renderCandidates(current);
}

/** 紧急呼救：眼镜大字警示闪烁 + 手机全屏红色 + 紧急语连播 2 遍（点手机可解除） */
async function emergency() {
  if (emergencyActive) return;
  emergencyActive = true;
  flowId++; // 抢占任何进行中的流程
  stopCapture();
  clearWatchdog();
  const text = profile.emergencyText?.trim() || '请帮帮我';
  setState('SPEAKING');
  showEmergency(text, () => {
    emergencyActive = false; // 手机点按解除，停止后续重复
  });
  const frames = [`██ 紧急呼救 ██\n${text}`, `⚠️ 紧急呼救 ⚠️\n${text}`];
  for (let i = 0; i < 2 && emergencyActive; i++) {
    renderHUD(frames[i % 2]);
    await speak(text);
  }
  emergencyActive = false;
  hideEmergency();
  setState('IDLE');
  renderHUD(IDLE_HINT);
}

/** 手机端状态 chip 文案（跟随状态机） */
const STATUS_TEXT: Record<UiState, string> = {
  IDLE: '待机',
  LISTENING: '聆听中…',
  THINKING: '思考中…',
  CANDIDATES: '选择候选',
  SPEAKING: '代说中…',
};

function setState(s: UiState) {
  state = s;
  setStatus(STATUS_TEXT[s]);
}

// ---- 个性化配置（本地 KVS 持久化，见契约 §4）----

async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await kvsGet(PROFILE_KEY);
    if (raw) return { userId: 'demo', commonPhrases: [], ...JSON.parse(raw) } as UserProfile;
  } catch {
    /* 解析失败用默认 */
  }
  return { userId: 'demo', commonPhrases: [] };
}

async function saveProfile(p: UserProfile): Promise<void> {
  await kvsSet(PROFILE_KEY, JSON.stringify(p));
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await kvsGet(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
  } catch {
    /* 解析失败用默认 */
  }
  return { ...DEFAULT_SETTINGS };
}

async function saveSettings(s: AppSettings): Promise<void> {
  await kvsSet(SETTINGS_KEY, JSON.stringify(s));
}

// ---- 采音 / ASR / TTS（采音与播音落在 ./hub，防回声见状态机）----

async function captureAudio(
  ms: number,
  onTick?: (elapsedMs: number, totalMs: number) => void,
): Promise<string> {
  return capturePcm(ms, onTick); // 采四麦 16kHz PCM，返回 base64（无 bridge 时为空串）
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
    /* 断网/无后端：audio 保持空，走降级链 */
  }
  // 降级链：云 TTS → 浏览器 speechSynthesis（免费/离线）→ 静默
  const played = await playAudioBase64(audio);
  if (!played) await speakFallback(text);
}

function renderHUD(text: string) {
  hudWrite(text);
}

function renderCandidates(set: CandidateSet) {
  const header = `候选 ${set.highlightIndex + 1}/${set.candidates.length} · 听到：${set.heardText}`;
  const items = set.candidates
    .map((c, i) => `${i === set.highlightIndex ? '▶ ' : '  '}${c.text}`)
    .join('\n');
  const footer = armed ? '\n再点一下说出 ✓' : '';
  hudWrite(`${header}\n${items}${footer}`);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function openActiveMode() {
  // P1：主动模式意图轮盘（吃/喝/如厕/疼痛/呼叫），有余量再做
}

// 启动：等 bridge（超时回退纯浏览器）→ 读 KVS 配置/设置 → 初始化手机 UI → 注册输入 → 首屏
initHub().then(async () => {
  profile = await loadProfile();
  settings = await loadSettings();
  const onboarded = (await kvsGet(ONBOARD_KEY)) === '1';
  initUi({
    profile,
    settings,
    onboarded,
    onSave: (p, s) => {
      profile = p; // 立即生效：后续 /candidates 注入、紧急语、音色都用新配置
      settings = s;
      void saveProfile(p);
      void saveSettings(s);
      renderQuickPhrases(p.commonPhrases); // 快捷句板跟着常用语更新
    },
    onSpeakPhrase: async (text) => {
      // 快捷句发声板：手机点按即说（眼镜没电/未戴时独立可用）
      if (state !== 'IDLE') return;
      setState('SPEAKING');
      await speak(text);
      setState('IDLE');
    },
    onOnboarded: () => void kvsSet(ONBOARD_KEY, '1'),
  });
  onInput(handleInput); // SDK 事件 + 键盘（开发期）统一入口
  renderHUD(IDLE_HINT);
});
