// 无声之声 · 薄云后端
// 职责：配置存储 + 云 API 密钥代理。glasses-app 只调这里，密钥不落客户端。
// 现状：/candidates 已接真实 LLM（OpenAI 兼容 provider，失败回退模板库）；
//       profile 已做 JSON 文件持久化；/asr /tts 仍为 mock，见各 TODO。
// 对应文档：docs/接口契约.md §3

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  pickTemplateCandidates,
  type AsrResponse,
  type CandidatesRequest,
  type CandidatesResponse,
  type TtsResponse,
  type UserProfile,
} from '@vftv/shared';
import { generateCandidates } from './candidates';
import { loadLlmConfig } from './providers/llm';
import { getProfile, loadProfiles, saveProfile } from './store';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // base64 音频较大

// ---- 配置存储（JSON 文件持久化，重启不丢；生产换 KV/DB）----
loadProfiles();

// 3.1 POST /asr — 语音转文字
app.post('/asr', async (req, res) => {
  // TODO: 调云 ASR（讯飞/阿里云），把 req.body.audio(base64 PCM16k) 转文字
  const resp: AsrResponse = { text: '（示例）你中午想吃什么？' };
  res.json(resp);
});

// 3.2 POST /candidates — 生成候选（核心）
app.post('/candidates', async (req, res) => {
  const { turnId, heardText, profile, exclude = [] } = req.body as CandidatesRequest;
  try {
    // 真实 LLM：注入 profile.name/commonPhrases/tone，输出经确定性清洗（恰好 4 条、去重、≤12 字）
    const candidates = await generateCandidates(heardText, profile, exclude);
    const resp: CandidatesResponse = { turnId, candidates };
    res.json(resp);
  } catch (e) {
    // ① backend 侧兜底：LLM 未配置/超时/报错 → 模板库
    console.warn('[candidates] fallback to templates:', e instanceof Error ? e.message : e);
    const resp: CandidatesResponse = { turnId, candidates: pickTemplateCandidates(heardText, exclude) };
    res.json(resp);
  }
});

// 3.3 POST /tts — 文字转语音
app.post('/tts', async (req, res) => {
  // TODO: 调云 TTS（讯飞/Edge-TTS），返回 base64 mp3/wav
  const resp: TtsResponse = { audio: '' };
  res.json(resp);
});

// 3.4 GET/POST /profile — 配置读写（写入即落盘）
app.get('/profile', (req, res) => {
  const userId = String(req.query.userId ?? 'demo');
  res.json(getProfile(userId) ?? { userId, commonPhrases: [] } satisfies UserProfile);
});
app.post('/profile', (req, res) => {
  const profile = req.body as UserProfile;
  if (!profile?.userId) {
    res.status(400).json({ ok: false, error: 'userId required' });
    return;
  }
  saveProfile(profile);
  res.json({ ok: true });
});

// 3.5 GET /health — 联调用：确认服务可达 + 各云能力是否已配置
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    llm: loadLlmConfig() !== null, // false = 未配 LLM_API_KEY，/candidates 恒走模板
    uptime: Math.round(process.uptime()),
  });
});

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`);
});
