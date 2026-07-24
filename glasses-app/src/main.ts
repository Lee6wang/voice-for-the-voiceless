// 无声之声 · 眼镜插件
// main.ts 只管状态机、云编排、超时/取消和诊断；Even Hub SDK 细节收敛在 ./hub。

import {
  normalizeCandidateTexts,
  type AsrRequest,
  type AsrResponse,
  type Candidate,
  type CandidateFeedbackRequest,
  type CandidateFeedbackResponse,
  type CandidateSet,
  type CandidatesRequest,
  type CandidatesResponse,
  type ConversationTurn,
  type HealthResponse,
  type InteractionMode,
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
  initHub,
  kvsGet,
  kvsSet,
  loadUsage,
  onInput,
  playAudioBase64,
  renderPage,
  setMirror,
  speakFallback,
  stopCapture,
  stopPlayback,
  usageOf,
  watchDeviceStatus,
  type HubMode,
} from './hub';
import {
  DEFAULT_SETTINGS,
  hideEmergency,
  initUi,
  normalizeSettings,
  renderDiagnostics,
  renderQuickPhrases,
  setStatus,
  showEmergency,
  type AppSettings,
  type CandidateOrigin,
  type DiagnosticsSnapshot,
  type PartnerId,
  type SceneId,
} from './ui';
import {
  candidatesScreen,
  confirmedScreen,
  emergencyScreen,
  idleScreen,
  listeningScreen,
  speakingScreen,
  thinkingScreen,
} from './screens';
import {
  FlowTokenController,
  playEmergencyTwice,
  type FlowToken,
} from './flow';
import { buildPlayedFeedback, isPlayedFeedback } from './feedback';
import type { PlaybackResult } from './playback';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
const DEVICE_ID_KEY = 'device_id';
const FEEDBACK_OUTBOX_KEY = 'feedback_outbox';
const PROFILE_KEY = 'profile';
const SETTINGS_KEY = 'settings';
const ONBOARD_KEY = 'onboarded';
const HEALTH_TIMEOUT_MS = 2000;
const ASR_TIMEOUT_MS = 2000;
const CANDIDATES_TIMEOUT_MS = 2800;
const TTS_TIMEOUT_MS = 7000;
const FEEDBACK_TIMEOUT_MS = 1500;
const FEEDBACK_OUTBOX_MAX = 50;

function runtimeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${suffix}`;
}

const SESSION_ID = runtimeId('session');

let state: UiState = 'IDLE';
let profile: UserProfile = { userId: 'demo', commonPhrases: [] };
let settings: AppSettings = normalizeSettings(DEFAULT_SETTINGS);
let current: CandidateSet | null = null;
let armed = false;
let emergencyActive = false;
let activeGroup = 0;
let history: ConversationTurn[] = [];
let prewarmController: AbortController | null = null;
let feedbackOutbox: CandidateFeedbackRequest[] = [];
let feedbackFlushing = false;

let diagnostics: DiagnosticsSnapshot = {
  hubMode: 'browser',
  deviceConnected: null,
  backendState: 'idle',
  backendOrigin: BACKEND,
};

function updateDiagnostics(patch: Partial<DiagnosticsSnapshot>): void {
  diagnostics = { ...diagnostics, ...patch };
  renderDiagnostics(diagnostics);
}

function sortByUsage(candidates: Candidate[]): Candidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        usageOf(b.candidate.text) - usageOf(a.candidate.text) || a.index - b.index,
    )
    .map(({ candidate }) => candidate);
}

function effectivePhrases(): string[] {
  return [
    ...new Set([
      ...profile.commonPhrases,
      ...(settings.scenePhrases[settings.scene] ?? []),
    ]),
  ];
}

function listenMs(): number {
  return settings.listenSeconds * 1000;
}

const PARTNER_LABEL: Record<PartnerId, string | undefined> = {
  default: undefined,
  stranger: '陌生人',
  friend: '朋友',
  family: '家人',
  senior: '上级',
  colleague: '同事',
  staff: '服务员',
};

function buildContext(): SceneContext {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const hour = now.getHours();
  const timeOfDay =
    hour < 6
      ? '深夜'
      : hour < 10
        ? '早晨'
        : hour < 14
          ? '午餐时段'
          : hour < 18
            ? '下午'
            : hour < 21
              ? '晚餐时段'
              : '晚间';
  const sceneLabel: Record<SceneId, string | undefined> = {
    default: undefined,
    work: '工作场合',
    dining: '餐厅',
    social: '聚会',
  };
  return {
    localTime: `${hh}:${mm}`,
    timeOfDay,
    scene: sceneLabel[settings.scene],
    partner: PARTNER_LABEL[settings.partner],
  };
}

// ---- 流程取消与请求超时 ----

const flows = new FlowTokenController(() => {
  stopCapture();
  stopPlayback();
});

function cancelCurrentFlow(): void {
  flows.cancel();
}

function beginFlow(): FlowToken {
  return flows.begin();
}

function flowIsActive(flow: FlowToken): boolean {
  return flows.isActive(flow);
}

function finishFlow(flow: FlowToken): void {
  flows.finish(flow);
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  if (parentSignal?.aborted) controller.abort();
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    return (await response.json()) as T;
  } catch (error) {
    if (timedOut) throw new Error(`请求超时（${timeoutMs}ms）`);
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

function abortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

// ---- 看门狗 ----

let watchdog: number | undefined;

function armWatchdog(): void {
  clearWatchdog();
  watchdog = window.setTimeout(() => {
    if (state !== 'LISTENING' && state !== 'THINKING') return;
    cancelCurrentFlow();
    setState('IDLE');
    updateDiagnostics({ lastError: '主流程超过 10 秒，已自动复位' });
    renderPage(idleScreen('没听清，轻点戒指再试一次'));
  }, 10000);
}

function clearWatchdog(): void {
  if (watchdog === undefined) return;
  clearTimeout(watchdog);
  watchdog = undefined;
}

// ---- 主流程 ----

async function startListening(): Promise<void> {
  if (state !== 'IDLE') return;
  if (settings.offlineMode) {
    showPrivacyQuickCandidates();
    return;
  }

  const flow = beginFlow();
  setState('LISTENING');
  armWatchdog();
  updateDiagnostics({
    pcmBytes: undefined,
    pcmDurationMs: undefined,
    asrMs: undefined,
    candidatesMs: undefined,
    totalMs: undefined,
    candidateOrigin: undefined,
    lastError: undefined,
  });
  renderPage(listeningScreen(0, listenMs()));

  try {
    const audio = await captureAudio(listenMs(), flow.signal, (elapsed, total) => {
      if (flowIsActive(flow) && state === 'LISTENING') {
        renderPage(listeningScreen(elapsed, total));
      }
    });
    if (!flowIsActive(flow)) return;

    const thinkingStarted = performance.now();
    setState('THINKING');
    renderPage(thinkingScreen());
    const recognized = await transcribe(audio, flow.signal);
    if (!flowIsActive(flow)) return;

    const turnId = `t_${Date.now()}`;
    if (!recognized.ok) {
      showLocalCandidates(
        turnId,
        recognized.reason === 'empty-audio'
          ? '未采到音频 · 快捷表达'
          : '后端不可达 · 快捷表达',
        effectivePhrases(),
        'client-template',
        thinkingStarted,
        recognized.error,
      );
      return;
    }
    if (!recognized.text.trim()) {
      showLocalCandidates(
        turnId,
        '未听清 · 快捷表达',
        effectivePhrases(),
        'client-template',
        thinkingStarted,
      );
      return;
    }

    const generated = await getCandidates(
      turnId,
      recognized.text,
      [],
      'reply',
      flow.signal,
    );
    if (!flowIsActive(flow)) return;
    current = {
      turnId,
      heardText: recognized.text,
      candidates: sortByUsage(generated.candidates),
      highlightIndex: 0,
    };
    armed = false;
    setState('CANDIDATES');
    updateDiagnostics({
      candidateOrigin: generated.origin,
      totalMs: performance.now() - thinkingStarted,
      lastError: generated.error,
    });
    renderCandidates(current);
  } catch (error) {
    if (!flowIsActive(flow) || abortError(error, flow.signal)) return;
    setState('IDLE');
    updateDiagnostics({ lastError: errorMessage(error) });
    renderPage(idleScreen('出了点问题，轻点戒指再试一次'));
  } finally {
    if (flowIsActive(flow)) {
      clearWatchdog();
      finishFlow(flow);
    }
  }
}

function showPrivacyQuickCandidates(): void {
  const flow = beginFlow();
  const turnId = `privacy_${Date.now()}`;
  current = {
    turnId,
    heardText: '隐私快捷 · 未采音',
    candidates: sortByUsage(
      normalizeCandidateTexts(effectivePhrases(), '', {
        idPrefix: 'privacy',
      }),
    ),
    highlightIndex: 0,
  };
  armed = false;
  setState('CANDIDATES');
  updateDiagnostics({
    backendState: 'privacy',
    health: undefined,
    candidateOrigin: 'privacy-quick',
    asrMs: undefined,
    candidatesMs: 0,
    totalMs: 0,
    lastError: undefined,
  });
  renderCandidates(current);
  finishFlow(flow);
}

function showLocalCandidates(
  turnId: string,
  label: string,
  phrases: string[],
  origin: CandidateOrigin,
  startedAt: number,
  error?: string,
): void {
  current = {
    turnId: `local_${turnId}`,
    heardText: label,
    candidates: sortByUsage(
      normalizeCandidateTexts(phrases, '', {
        idPrefix: 'local',
      }),
    ),
    highlightIndex: 0,
  };
  armed = false;
  setState('CANDIDATES');
  updateDiagnostics({
    candidateOrigin: origin,
    candidatesMs: 0,
    totalMs: performance.now() - startedAt,
    lastError: error,
  });
  renderCandidates(current);
}

interface CandidateResult {
  candidates: Candidate[];
  origin: CandidateOrigin;
  error?: string;
}

async function getCandidates(
  turnId: string,
  heardText: string,
  exclude: string[],
  mode: InteractionMode,
  signal: AbortSignal,
  fallbackTexts: string[] = [],
): Promise<CandidateResult> {
  const started = performance.now();
  const fallback = (error?: string): CandidateResult => ({
    candidates: normalizeCandidateTexts(fallbackTexts, heardText, {
      exclude,
      idPrefix: mode === 'active' ? 'active' : 'client',
    }),
    origin: mode === 'active' ? 'active-phrase' : 'client-template',
    error,
  });

  if (settings.offlineMode) return fallback();
  try {
    const profileForRequest: UserProfile = {
      ...profile,
      commonPhrases: effectivePhrases(),
    };
    const body: CandidatesRequest = {
      turnId,
      sessionId: SESSION_ID,
      heardText,
      profile: profileForRequest,
      exclude,
      context: buildContext(),
      mode,
      history: history.length ? history : undefined,
    };
    const response = await fetchJson<CandidatesResponse>(
      `${BACKEND}/candidates`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      CANDIDATES_TIMEOUT_MS,
      signal,
    );
    if (signal.aborted) throw new DOMException('Flow cancelled', 'AbortError');
    if (response.turnId !== turnId) {
      throw new Error('候选响应 turnId 不匹配');
    }
    updateDiagnostics({ candidatesMs: performance.now() - started });
    return {
      candidates: normalizeCandidateTexts(
        (Array.isArray(response.candidates) ? response.candidates : [])
          .map((candidate) => candidate?.text)
          .filter((text): text is string => typeof text === 'string'),
        heardText,
        { exclude, idPrefix: 'api' },
      ),
      origin: response.source === 'template' ? 'backend-template' : 'llm',
    };
  } catch (error) {
    if (abortError(error, signal)) throw error;
    updateDiagnostics({ candidatesMs: performance.now() - started });
    return fallback(`候选接口：${errorMessage(error)}`);
  }
}

async function persistFeedbackOutbox(): Promise<void> {
  await kvsSet(FEEDBACK_OUTBOX_KEY, JSON.stringify(feedbackOutbox));
}

async function enqueueFeedback(body: CandidateFeedbackRequest): Promise<void> {
  if (!feedbackOutbox.some((item) => item.eventId === body.eventId)) {
    feedbackOutbox.push(body);
    if (feedbackOutbox.length > FEEDBACK_OUTBOX_MAX) {
      feedbackOutbox = feedbackOutbox.slice(-FEEDBACK_OUTBOX_MAX);
    }
    try {
      await persistFeedbackOutbox();
    } catch {
      /* 内存队列仍可立即尝试发送 */
    }
  }
  await flushFeedbackOutbox();
}

async function flushFeedbackOutbox(): Promise<void> {
  if (feedbackFlushing || settings.offlineMode || feedbackOutbox.length === 0) return;
  feedbackFlushing = true;
  try {
    while (feedbackOutbox.length > 0 && !settings.offlineMode) {
      const body = feedbackOutbox[0];
      await fetchJson<CandidateFeedbackResponse>(
        `${BACKEND}/agent/feedback`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        FEEDBACK_TIMEOUT_MS,
      );
      feedbackOutbox.shift();
      await persistFeedbackOutbox();
    }
  } catch (error) {
    // 保留队首，下次健康检查、启动或新反馈时用同一 eventId 重试。
    console.warn('[memory] feedback queued for retry:', errorMessage(error));
  } finally {
    feedbackFlushing = false;
  }
}

function reportPlayedFeedback(turn: CandidateSet, chosen: Candidate): void {
  const body = buildPlayedFeedback({
    sessionId: SESSION_ID,
    userId: profile.userId,
    turn,
    chosen,
    context: buildContext(),
    offlineMode: settings.offlineMode,
  });
  if (!body) return;
  // 学习是加分项：入本地 outbox 后异步发送，不影响已完成的发声与主流程。
  void enqueueFeedback(body);
}

async function confirmAndSpeak(): Promise<void> {
  if (state !== 'CANDIDATES' || !current) return;
  const chosen = current.candidates[current.highlightIndex];
  if (!chosen) return;

  const turn = current;
  const flow = beginFlow();
  setState('SPEAKING');
  renderPage(speakingScreen(chosen.text));
  const result = await speak(chosen.text, flow.signal);
  if (!flowIsActive(flow) || result.result === 'cancelled') return;

  if (result.result !== 'completed') {
    setState('IDLE');
    updateDiagnostics({ lastError: 'MP3 与本机语音均未能播放' });
    renderPage(idleScreen('未能发声，请重试'));
    finishFlow(flow);
    return;
  }

  bumpUsage(chosen.text);
  reportPlayedFeedback(turn, chosen);
  if (
    !turn.turnId.startsWith('active_') &&
    !turn.turnId.startsWith('privacy_') &&
    !turn.turnId.startsWith('local_')
  ) {
    history.push({ heard: turn.heardText, said: chosen.text });
    if (history.length > 3) history.shift();
  }
  renderPage(confirmedScreen(chosen.text));
  if (!(await sleepWithSignal(2000, flow.signal)) || !flowIsActive(flow)) return;
  setState('IDLE');
  renderPage(idleScreen());
  finishFlow(flow);
}

// ---- 输入事件 ----

export function handleInput(input: RawInput): void {
  if (input === 'temple_double_tap') {
    void emergency();
    return;
  }
  switch (state) {
    case 'IDLE':
      if (input === 'tap') void startListening();
      else if (input === 'double_tap') openActiveMode();
      break;
    case 'LISTENING':
      if (input === 'tap') stopCapture();
      break;
    case 'CANDIDATES':
      if (!current) break;
      if (input === 'swipe_up') move(-1);
      else if (input === 'swipe_down') move(1);
      else if (input === 'tap') {
        if (settings.twoStepConfirm && !armed) {
          armed = true;
          renderCandidates(current);
        } else {
          armed = false;
          void confirmAndSpeak();
        }
      } else if (input === 'double_tap') {
        void refresh();
      }
      break;
  }
}

function move(delta: number): void {
  if (!current || current.candidates.length === 0) return;
  armed = false;
  const count = current.candidates.length;
  current.highlightIndex = (current.highlightIndex + delta + count) % count;
  renderCandidates(current);
}

async function refresh(): Promise<void> {
  if (!current) return;
  armed = false;
  if (current.turnId.startsWith('active_')) {
    activeGroup++;
    await showActiveGroup();
    return;
  }
  if (current.turnId.startsWith('privacy_') || settings.offlineMode) {
    showPrivacyQuickCandidates();
    return;
  }
  if (current.turnId.startsWith('local_')) {
    const seen = current.candidates.map((candidate) => candidate.text);
    current.candidates = sortByUsage(
      normalizeCandidateTexts(effectivePhrases(), '', {
        exclude: seen,
        idPrefix: 'local',
      }),
    );
    current.highlightIndex = 0;
    updateDiagnostics({ candidateOrigin: 'client-template' });
    renderCandidates(current);
    return;
  }

  const previous = current;
  const flow = beginFlow();
  const seen = previous.candidates.map((candidate) => candidate.text);
  try {
    const refreshed = await getCandidates(
      previous.turnId,
      previous.heardText,
      seen,
      'reply',
      flow.signal,
    );
    if (!flowIsActive(flow) || state !== 'CANDIDATES') return;
    current = {
      ...previous,
      candidates: sortByUsage(refreshed.candidates),
      highlightIndex: 0,
    };
    updateDiagnostics({
      candidateOrigin: refreshed.origin,
      lastError: refreshed.error,
    });
    renderCandidates(current);
  } finally {
    if (flowIsActive(flow)) finishFlow(flow);
  }
}

// ---- 紧急模式 ----

async function emergency(): Promise<void> {
  if (emergencyActive) return;
  emergencyActive = true;
  clearWatchdog();
  const flow = beginFlow();
  const text = profile.emergencyText?.trim() || '请帮帮我';
  setState('SPEAKING');
  showEmergency(text, () => {
    if (!emergencyActive) return;
    emergencyActive = false;
    cancelCurrentFlow();
    setState('IDLE');
    renderPage(idleScreen());
  });

  const emergencyResult = await playEmergencyTwice(
    async (pass) => {
      renderPage(emergencyScreen(text, pass === 0));
      return (await speak(text, flow.signal)).result;
    },
    () => emergencyActive && flowIsActive(flow),
  );
  if (emergencyResult === 'cancelled') return;

  if (!flowIsActive(flow)) return;
  emergencyActive = false;
  hideEmergency();
  setState('IDLE');
  renderPage(idleScreen());
  finishFlow(flow);
}

const STATUS_TEXT: Record<UiState, string> = {
  IDLE: '待机',
  LISTENING: '聆听中…',
  THINKING: '思考中…',
  CANDIDATES: '选择候选',
  SPEAKING: '代说中…',
};

function setState(next: UiState): void {
  state = next;
  setStatus(STATUS_TEXT[next], next);
}

// ---- KVS ----

async function loadDeviceId(): Promise<string> {
  try {
    const stored = (await kvsGet(DEVICE_ID_KEY))?.trim();
    if (stored) return stored;
  } catch {
    /* 读取失败时生成新 id */
  }
  const generated = runtimeId('device');
  await kvsSet(DEVICE_ID_KEY, generated);
  return generated;
}

async function loadFeedbackOutbox(): Promise<void> {
  try {
    const raw = await kvsGet(FEEDBACK_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    feedbackOutbox = parsed.filter(isPlayedFeedback).slice(-FEEDBACK_OUTBOX_MAX);
  } catch {
    feedbackOutbox = [];
  }
}

async function loadProfile(userId: string): Promise<UserProfile> {
  try {
    const raw = await kvsGet(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      const migrated: UserProfile = {
        commonPhrases: [],
        ...parsed,
        userId,
      };
      if (parsed.userId !== userId) await kvsSet(PROFILE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* 解析失败用默认 */
  }
  return { userId, commonPhrases: [] };
}

async function saveProfile(next: UserProfile): Promise<void> {
  await kvsSet(PROFILE_KEY, JSON.stringify(next));
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await kvsGet(SETTINGS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch {
    /* 解析失败用默认 */
  }
  return normalizeSettings(DEFAULT_SETTINGS);
}

async function saveSettings(next: AppSettings): Promise<void> {
  await kvsSet(SETTINGS_KEY, JSON.stringify(next));
}

// ---- 采音 / ASR / TTS ----

async function captureAudio(
  ms: number,
  signal: AbortSignal,
  onTick?: (elapsedMs: number, totalMs: number) => void,
): Promise<string> {
  const started = performance.now();
  const audio = await capturePcm(ms, onTick);
  const duration = performance.now() - started;
  if (!signal.aborted) {
    updateDiagnostics({
      pcmBytes: base64ByteLength(audio),
      pcmDurationMs: duration,
    });
  }
  return audio;
}

interface TranscriptionResult {
  ok: boolean;
  text: string;
  reason?: 'empty-audio' | 'backend';
  error?: string;
}

async function transcribe(audio: string, signal: AbortSignal): Promise<TranscriptionResult> {
  const started = performance.now();
  if (!audio) {
    updateDiagnostics({ asrMs: 0 });
    return { ok: false, text: '', reason: 'empty-audio', error: '未采到 PCM 音频' };
  }
  try {
    const body: AsrRequest = { audio, final: true };
    const response = await fetchJson<AsrResponse>(
      `${BACKEND}/asr`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      ASR_TIMEOUT_MS,
      signal,
    );
    if (signal.aborted) throw new DOMException('Flow cancelled', 'AbortError');
    updateDiagnostics({ asrMs: performance.now() - started });
    return { ok: true, text: response.text ?? '' };
  } catch (error) {
    if (abortError(error, signal)) throw error;
    updateDiagnostics({ asrMs: performance.now() - started });
    return {
      ok: false,
      text: '',
      reason: 'backend',
      error: `ASR：${errorMessage(error)}`,
    };
  }
}

interface SpeakResult {
  result: PlaybackResult;
  path: DiagnosticsSnapshot['playback'];
}

async function speak(text: string, signal: AbortSignal): Promise<SpeakResult> {
  const started = performance.now();
  let audio = '';
  let mime = 'audio/mp3';

  if (!settings.offlineMode) {
    try {
      const body: TtsRequest = { text, voice: profile.voice };
      const response = await fetchJson<TtsResponse>(
        `${BACKEND}/tts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        TTS_TIMEOUT_MS,
        signal,
      );
      if (signal.aborted) return { result: 'cancelled', path: 'cancelled' };
      audio = response.audio ?? '';
      mime = response.mime ?? 'audio/mp3';
    } catch (error) {
      if (abortError(error, signal)) {
        return { result: 'cancelled', path: 'cancelled' };
      }
      updateDiagnostics({ lastError: `TTS：${errorMessage(error)}` });
    }
  }

  const ttsMs = performance.now() - started;
  if (audio) {
    const result = await playAudioBase64(audio, mime);
    if (signal.aborted) return { result: 'cancelled', path: 'cancelled' };
    if (result === 'completed') {
      updateDiagnostics({ playback: 'backend-audio', ttsMs });
      return { result, path: 'backend-audio' };
    }
    if (result === 'cancelled') {
      updateDiagnostics({ playback: 'cancelled', ttsMs });
      return { result, path: 'cancelled' };
    }
  }

  const fallback = await speakFallback(text);
  if (signal.aborted) return { result: 'cancelled', path: 'cancelled' };
  const path = fallback === 'completed' ? 'web-speech' : fallback === 'cancelled' ? 'cancelled' : 'silent';
  updateDiagnostics({ playback: path, ttsMs });
  return { result: fallback, path };
}

function prewarmTts(): void {
  prewarmController?.abort();
  prewarmController = null;
  if (settings.offlineMode) return;
  const texts = [
    profile.emergencyText?.trim() || '请帮帮我',
    ...profile.commonPhrases,
  ].filter((text, index, all) => !!text && all.indexOf(text) === index).slice(0, 5);
  const controller = new AbortController();
  prewarmController = controller;
  void (async () => {
    for (const text of texts) {
      if (controller.signal.aborted) return;
      try {
        await fetchJson<TtsResponse>(
          `${BACKEND}/tts`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, voice: profile.voice } satisfies TtsRequest),
          },
          TTS_TIMEOUT_MS,
          controller.signal,
        );
      } catch {
        return;
      }
    }
    if (prewarmController === controller) prewarmController = null;
  })();
}

// ---- 主动模式 ----

function renderCandidates(set: CandidateSet): void {
  renderPage(candidatesScreen(set, settings.bigText, armed));
}

function openActiveMode(): void {
  activeGroup = 0;
  void showActiveGroup();
}

function activeGroups(): { name: string; phrases: string[]; useLlm: boolean }[] {
  const common = effectivePhrases();
  const custom = settings.activeGroups
    .filter((group) => group.phrases.length > 0)
    .filter((group) => {
      if (!common.length || group.id !== 'preset_basic') return true;
      const commonSet = new Set(common);
      return !group.phrases.every((phrase) => commonSet.has(phrase));
    })
    .map((group) => ({
      name: group.name || '未命名',
      phrases: group.phrases,
      useLlm: !group.id.startsWith('preset_'),
    }));
  return common.length
    ? [{ name: '常用', phrases: common, useLlm: false }, ...custom]
    : custom;
}

async function showActiveGroup(): Promise<void> {
  const groups = activeGroups();
  if (groups.length === 0) {
    setState('IDLE');
    renderPage(idleScreen('未配置主动短语，请在手机配置页添加'));
    return;
  }

  const flow = beginFlow();
  const group = groups[activeGroup % groups.length];
  const turnId = `active_${Date.now()}`;
  const staticCandidates = normalizeCandidateTexts(group.phrases, `主动 ${group.name}`, {
    idPrefix: `active_${activeGroup}`,
  });
  current = {
    turnId,
    heardText: `快捷 · ${group.name}（双击换组）`,
    candidates: sortByUsage(staticCandidates),
    highlightIndex: 0,
  };
  armed = false;
  setState('CANDIDATES');
  updateDiagnostics({ candidateOrigin: 'active-phrase', lastError: undefined });
  renderCandidates(current);

  if (!settings.offlineMode && group.useLlm) {
    const intent = `${group.name}：${group.phrases.join('、')}`;
    try {
      const generated = await getCandidates(
        turnId,
        intent,
        [],
        'active',
        flow.signal,
        group.phrases,
      );
      if (
        flowIsActive(flow) &&
        state === 'CANDIDATES' &&
        current?.turnId === turnId &&
        current.highlightIndex === 0 &&
        !armed
      ) {
        current.candidates = sortByUsage(generated.candidates);
        updateDiagnostics({
          candidateOrigin: generated.origin,
          lastError: generated.error,
        });
        renderCandidates(current);
      }
    } catch (error) {
      if (!abortError(error, flow.signal)) {
        updateDiagnostics({ lastError: errorMessage(error) });
      }
    }
  }
  if (flowIsActive(flow)) finishFlow(flow);
}

// ---- health 与启动 ----

async function checkHealth(): Promise<void> {
  if (settings.offlineMode) {
    updateDiagnostics({
      backendState: 'privacy',
      health: undefined,
      lastError: undefined,
    });
    return;
  }
  updateDiagnostics({ backendState: 'checking', lastError: undefined });
  try {
    const health = await fetchJson<HealthResponse>(
      `${BACKEND}/health`,
      { method: 'GET' },
      HEALTH_TIMEOUT_MS,
    );
    if (!health.ok) throw new Error('health.ok=false');
    updateDiagnostics({ backendState: 'ready', health });
    void flushFeedbackOutbox();
  } catch (error) {
    updateDiagnostics({
      backendState: 'unreachable',
      health: undefined,
      lastError: `Health：${errorMessage(error)}`,
    });
  }
}

initHub().then(async (hubMode: HubMode) => {
  const userId = await loadDeviceId();
  profile = await loadProfile(userId);
  settings = await loadSettings();
  await loadFeedbackOutbox();
  await loadUsage();
  const onboarded = (await kvsGet(ONBOARD_KEY)) === '1';
  const byUsage = (a: string, b: string) => usageOf(b) - usageOf(a);

  diagnostics = {
    ...diagnostics,
    hubMode,
    deviceConnected: hubMode === 'browser' ? false : null,
    backendState: settings.offlineMode ? 'privacy' : 'idle',
  };

  initUi({
    profile,
    settings,
    onboarded,
    onSave: (nextProfile, nextSettings) => {
      profile = { ...nextProfile, userId: profile.userId };
      settings = normalizeSettings(nextSettings);
      void saveProfile(profile);
      void saveSettings(settings);
      setMirror(settings.mirrorHud);
      renderQuickPhrases(effectivePhrases(), byUsage);
      void checkHealth();
      void flushFeedbackOutbox();
      prewarmTts();
    },
    onSceneChange: (scene) => {
      settings = { ...settings, scene };
      void saveSettings(settings);
      renderQuickPhrases(effectivePhrases(), byUsage);
    },
    onPartnerChange: (partner) => {
      settings = { ...settings, partner };
      void saveSettings(settings);
    },
    onSpeakPhrase: async (text) => {
      if (state !== 'IDLE') return;
      const flow = beginFlow();
      setState('SPEAKING');
      renderPage(speakingScreen(text));
      const result = await speak(text, flow.signal);
      if (!flowIsActive(flow) || result.result === 'cancelled') return;
      if (result.result !== 'completed') {
        setState('IDLE');
        updateDiagnostics({ lastError: 'MP3 与本机语音均未能播放' });
        renderPage(idleScreen('未能发声，请重试'));
        finishFlow(flow);
        return;
      }
      bumpUsage(text);
      renderPage(confirmedScreen(text));
      if (!(await sleepWithSignal(2000, flow.signal)) || !flowIsActive(flow)) return;
      setState('IDLE');
      renderPage(idleScreen());
      finishFlow(flow);
    },
    onOnboarded: () => void kvsSet(ONBOARD_KEY, '1'),
    onRetryHealth: () => void checkHealth(),
  });

  renderDiagnostics(diagnostics);
  setMirror(settings.mirrorHud);
  renderQuickPhrases(effectivePhrases(), byUsage);
  watchDeviceStatus((connected) => {
    updateDiagnostics({ deviceConnected: connected });
    if (connected) setStatus(STATUS_TEXT[state], state);
    else setStatus('眼镜已断开，重连中…', 'DISCONNECTED');
  });
  onInput(handleInput);
  renderPage(idleScreen());
  void checkHealth();
  void flushFeedbackOutbox();
  prewarmTts();
});

// ---- 小工具 ----

function base64ByteLength(value: string): number {
  if (!value) return 0;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
