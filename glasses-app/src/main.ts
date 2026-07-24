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
  type Candidate,
  type CandidateSet,
  type CandidatesRequest,
  type CandidatesResponse,
  type ConversationTurn,
  type RawInput,
  type SceneContext,
  type TtsRequest,
  type TtsResponse,
  type UiState,
  type UserProfile,
} from '@vftv/shared';
import {
  bumpUsage,
  capturePcm,
  hudWrite,
  initHub,
  kvsGet,
  kvsSet,
  loadUsage,
  onInput,
  playAudioBase64,
  setMirror,
  speakFallback,
  stopCapture,
  usageOf,
  watchDeviceStatus,
} from './hub';
import {
  DEFAULT_SETTINGS,
  hideEmergency,
  initUi,
  renderQuickPhrases,
  setStatus,
  showEmergency,
  type AppSettings,
  type SceneId,
} from './ui';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
const PROFILE_KEY = 'profile';
const SETTINGS_KEY = 'settings';
const ONBOARD_KEY = 'onboarded';
const IDLE_HINT = '无声之声 · 轻点戒指开始聆听';

/** 场景短语包：叠加在用户常用语上，影响候选生成与快捷句（不改契约，B 零改动） */
const SCENE_PHRASES: Record<SceneId, string[]> = {
  default: [],
  work: ['我先记一下，稍后回复你', '这个我需要确认一下', '可以发我文字吗', '我们约个时间细聊'],
  dining: ['请给我一杯温水', '我要这个，谢谢', '请少辣，谢谢', '麻烦帮我打包'],
  social: ['很高兴见到你', '你先说，我在听', '我去下洗手间', '今天很开心，先走啦'],
};

/** 主动模式分组（双击戒指唤出，复用候选选择机制：swipe 选/tap 说/double 换组） */
const ACTIVE_GROUPS: { name: string; phrases: string[] }[] = [
  { name: '打招呼', phrases: ['你好，很高兴认识你', '早上好', '好久不见', '回头见'] },
  { name: '需求', phrases: ['请帮我一下', '请给我一杯水', '我想休息一下', '请再说一遍'] },
  { name: '缓冲', phrases: ['等我一下', '容我想想', '我在听', '稍后回复你'] },
  { name: '告别', phrases: ['我先失陪一下', '今天先到这', '谢谢你的理解', '我们下次再聊'] },
];

let state: UiState = 'IDLE';
let profile: UserProfile = { userId: 'demo', commonPhrases: [] };
let settings: AppSettings = { ...DEFAULT_SETTINGS };
let current: CandidateSet | null = null;
let armed = false; // 两步确认：候选已锁定，再 tap 才说出
let flowId = 0; // 会话令牌：看门狗复位后丢弃迟到的旧流程结果
let emergencyActive = false;
let activeGroup = 0; // 主动模式当前分组
let history: ConversationTurn[] = []; // 多轮上下文（会话级，最近 3 轮）

/** 按历史选中次数稳定降序（“越用越懂你”；次数相同保持原序）。 */
function sortByUsage(cands: Candidate[]): Candidate[] {
  return cands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => usageOf(b.c.text) - usageOf(a.c.text) || a.i - b.i)
    .map((x) => x.c);
}

/** 当前生效的常用语：用户自定义 + 场景短语包（去重） */
function effectivePhrases(): string[] {
  return [...new Set([...profile.commonPhrases, ...SCENE_PHRASES[settings.scene]])];
}

/** 聆听时长（可配置 3/4/5 秒） */
function listenMs(): number {
  return settings.listenSeconds * 1000;
}

/** 场景上下文：时间必带 + 场景手选（backend 据此让候选贴合情境，见契约 §3.2） */
function buildContext(): SceneContext {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const h = now.getHours();
  const timeOfDay =
    h < 6 ? '深夜' : h < 10 ? '早晨' : h < 14 ? '午餐时段' : h < 18 ? '下午' : h < 21 ? '晚餐时段' : '晚间';
  const sceneLabel: Record<SceneId, string | undefined> = {
    default: undefined,
    work: '工作场合',
    dining: '餐厅',
    social: '聚会',
  };
  return { localTime: `${hh}:${mm}`, timeOfDay, scene: sceneLabel[settings.scene] };
}

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
    const audio = await captureAudio(listenMs(), (elapsed, total) => {
      if (id === flowId && state === 'LISTENING') renderHUD(listenBar(elapsed, total));
    });
    if (id !== flowId) return; // 已被看门狗/新流程接管
    setState('THINKING');
    renderHUD('💭 思考中…');
    const heardText = await asr(audio);
    if (id !== flowId) return;
    const turnId = `t_${Date.now()}`;
    const candidates = await getCandidates(turnId, heardText);
    if (id !== flowId) return;
    current = { turnId, heardText, candidates: sortByUsage(candidates), highlightIndex: 0 };
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
function listenBar(elapsedMs: number, totalMs = listenMs()): string {
  const n = 10;
  const filled = Math.min(n, Math.round((elapsedMs / totalMs) * n));
  return `🎧 聆听中 ${'█'.repeat(filled)}${'━'.repeat(n - filled)}\n（再点一下提前结束）`;
}

/** 请求候选：离线模式直走模板库；否则先 backend，不可达→插件端兜底。profile 注入场景短语。 */
async function getCandidates(turnId: string, heardText: string, exclude: string[] = []) {
  if (settings.offlineMode) return pickTemplateCandidates(heardText, exclude); // 隐私/无网：不联网
  try {
    const profileForRequest: UserProfile = { ...profile, commonPhrases: effectivePhrases() };
    const body: CandidatesRequest = {
      turnId,
      heardText,
      profile: profileForRequest,
      exclude,
      context: buildContext(),
      history: history.length ? history : undefined, // 多轮上下文（最近≤3轮）
    };
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
  const turn = current;
  bumpUsage(chosen.text); // 频次学习：选过的下次排前
  setState('SPEAKING');
  renderHUD('🔊 正在替你说…');
  await speak(chosen.text);
  // 多轮上下文：只记应答模式的真实对话（主动模式 turnId 以 active_ 开头，不计入）
  if (!turn.turnId.startsWith('active_')) {
    history.push({ heard: turn.heardText, said: chosen.text });
    if (history.length > 3) history.shift();
  }
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
  // 主动模式：double-tap 换下一组（不请求后端）
  if (current.turnId.startsWith('active_')) {
    activeGroup++;
    showActiveGroup();
    return;
  }
  const seen = current.candidates.map((c) => c.text);
  current.candidates = sortByUsage(await getCandidates(current.turnId, current.heardText, seen));
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
  if (settings.offlineMode) return ''; // 离线模式：音频不出设备，不上传
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
  let mime = 'audio/mp3';
  if (!settings.offlineMode) {
    try {
      const body: TtsRequest = { text, voice: profile.voice };
      const r = await fetch(`${BACKEND}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = (await r.json()) as TtsResponse;
      audio = resp.audio ?? '';
      mime = resp.mime ?? 'audio/mp3'; // backend 可能返 audio/mpeg，缺省按 mp3（契约 §3.3）
    } catch {
      /* 断网/无后端：audio 保持空，走降级链 */
    }
  }
  // 降级链：云 TTS → 浏览器 speechSynthesis（免费/离线）→ 静默；离线模式直走第二级
  const played = await playAudioBase64(audio, mime);
  if (!played) await speakFallback(text);
}

function renderHUD(text: string) {
  hudWrite(text);
}

function renderCandidates(set: CandidateSet) {
  const isActive = set.turnId.startsWith('active_');
  const context = isActive ? set.heardText : `听到：${set.heardText}`;
  const total = set.candidates.length;
  const header = `候选 ${set.highlightIndex + 1}/${total} · ${context}`;
  const footer = armed ? '\n再点一下说出 ✓' : '';

  // 大字模式：只显以高亮为中心的 2 条窗口（滑动翻页）；否则四条全显
  if (settings.bigText) {
    const start = Math.floor(set.highlightIndex / 2) * 2; // 以 2 为步的页
    const win = set.candidates
      .map((c, i) => ({ c, i }))
      .slice(start, start + 2)
      .map(({ c, i }) => `${i === set.highlightIndex ? '▶ ' : '  '}${c.text}`)
      .join('\n\n'); // 多留白，更易读
    hudWrite(`${header}\n\n${win}${footer}`);
    return;
  }

  const items = set.candidates
    .map((c, i) => `${i === set.highlightIndex ? '▶ ' : '  '}${c.text}`)
    .join('\n');
  hudWrite(`${header}\n${items}${footer}`);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 主动模式：IDLE 双击唤出分组短语（常用/打招呼/需求/缓冲/告别），复用候选选择机制 */
function openActiveMode() {
  activeGroup = 0;
  showActiveGroup();
}

function activeGroups(): { name: string; phrases: string[] }[] {
  const common = effectivePhrases();
  return common.length ? [{ name: '常用', phrases: common }, ...ACTIVE_GROUPS] : [...ACTIVE_GROUPS];
}

function showActiveGroup() {
  const groups = activeGroups();
  const g = groups[activeGroup % groups.length];
  const cands = g.phrases.slice(0, 4).map((text, i) => ({ id: `a${activeGroup}_${i}`, text }));
  current = {
    turnId: `active_${Date.now()}`,
    heardText: `主动 · ${g.name}（双击换组）`,
    candidates: sortByUsage(cands),
    highlightIndex: 0,
  };
  armed = false;
  setState('CANDIDATES');
  renderCandidates(current);
}

// 启动：等 bridge（超时回退纯浏览器）→ 读 KVS 配置/设置/频次 → 初始化手机 UI → 注册输入 → 首屏
initHub().then(async () => {
  profile = await loadProfile();
  settings = await loadSettings();
  await loadUsage(); // 频次学习表进内存
  const onboarded = (await kvsGet(ONBOARD_KEY)) === '1';
  const byUsage = (a: string, b: string) => usageOf(b) - usageOf(a); // 高频常用语冒泡
  initUi({
    profile,
    settings,
    onboarded,
    onSave: (p, s) => {
      profile = p; // 立即生效：后续 /candidates 注入、紧急语、音色都用新配置
      settings = s;
      void saveProfile(p);
      void saveSettings(s);
      setMirror(s.mirrorHud);
      renderQuickPhrases(effectivePhrases(), byUsage); // 快捷句板跟随常用语+场景更新，按频次排
    },
    onSceneChange: (scene) => {
      settings = { ...settings, scene };
      void saveSettings(settings);
      renderQuickPhrases(effectivePhrases(), byUsage);
    },
    onSpeakPhrase: async (text) => {
      // 快捷句发声板：手机点按即说（眼镜没电/未戴时独立可用）
      if (state !== 'IDLE') return;
      bumpUsage(text);
      setState('SPEAKING');
      await speak(text);
      setState('IDLE');
    },
    onOnboarded: () => void kvsSet(ONBOARD_KEY, '1'),
  });
  setMirror(settings.mirrorHud); // 镜像默认关（隐私），演示时配置页打开
  renderQuickPhrases(effectivePhrases(), byUsage);
  watchDeviceStatus((connected) => {
    // BLE 断连守护：手机提示；重连后 hub 会自动重建 HUD
    setStatus(connected ? '已重新连接' : '眼镜已断开，重连中…');
  });
  onInput(handleInput); // SDK 事件 + 键盘（开发期）统一入口
  renderHUD(IDLE_HINT);
});
