// 无声之声 · backend API 客户端
// 契约见 docs/接口契约.md §3；类型以 @vftv/shared 为唯一真相源。
// 兜底哲学：backend 不可达 → 本地 shared 模板库出候选（fetchCandidates 内置）。

import {
  pickTemplateCandidates,
  type AsrResponse,
  type Candidate,
  type CandidatesRequest,
  type CandidatesResponse,
  type TtsResponse,
  type UserProfile,
} from '@vftv/shared';
import { getBackendUrl, cacheProfile, readCachedProfile, USER_ID } from './config';
import { buildSceneContext } from './context';

export interface HealthStatus {
  ok: boolean;
  llm: boolean;
  tts: boolean;
  asr: boolean;
  uptime: number;
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${getBackendUrl()}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as HealthStatus;
  } catch {
    return null;
  }
}

/** ASR：整段 base64 PCM16LE 16kHz mono（无 WAV 头）→ 文本。识别耗时不定，给宽超时 */
export async function fetchAsr(audioB64: string): Promise<string> {
  const resp = await post<AsrResponse>('/asr', { audio: audioB64, final: true }, 15000);
  return resp.text;
}

/**
 * 候选：backend 可达走 LLM（backend 内部已有模板兜底）；
 * fetch 失败（断网/backend 挂）→ 插件端用同一份 shared 模板库，保证永远有 4 条。
 * 每轮自动携带场景上下文（时间/地点），让候选贴合情境。
 */
export async function fetchCandidates(
  turnId: string,
  heardText: string,
  profile: UserProfile,
  exclude: string[] = [],
): Promise<{ candidates: Candidate[]; offline: boolean }> {
  const context = await buildSceneContext();
  const req: CandidatesRequest = { turnId, heardText, profile, exclude, context };
  try {
    const resp = await post<CandidatesResponse>('/candidates', req, 8000);
    if (resp.candidates?.length) return { candidates: resp.candidates, offline: false };
    throw new Error('empty candidates');
  } catch {
    return { candidates: pickTemplateCandidates(heardText, exclude), offline: true };
  }
}

/** TTS：返回 base64 mp3（audio 为空串 = backend 合成失败，调用方降级为 HUD 纯文字） */
export async function fetchTts(text: string, voice?: string): Promise<TtsResponse> {
  return post<TtsResponse>('/tts', { text, voice }, 10000);
}

export async function fetchProfile(): Promise<UserProfile> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${getBackendUrl()}/profile?userId=${USER_ID}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`profile HTTP ${res.status}`);
    const profile = (await res.json()) as UserProfile;
    cacheProfile(JSON.stringify(profile)); // 断网兜底缓存
    return profile;
  } catch {
    const cached = readCachedProfile();
    if (cached) return JSON.parse(cached) as UserProfile;
    return { userId: USER_ID, commonPhrases: [] };
  }
}

export async function saveProfile(profile: UserProfile): Promise<boolean> {
  try {
    await post<{ ok: boolean }>('/profile', profile, 5000);
    cacheProfile(JSON.stringify(profile));
    return true;
  } catch {
    cacheProfile(JSON.stringify(profile)); // backend 不可达也先缓存本地
    return false;
  }
}
