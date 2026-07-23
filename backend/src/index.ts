// 无声之声 · 薄云后端（骨架）
// 职责：配置存储 + 云 API 密钥代理。glasses-app 只调这里，密钥不落客户端。
// 现状：/asr /tts 为 mock；/candidates 已接模板库兜底；真实云 API 调用见各 TODO。
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // base64 音频较大

// ---- 配置存储（Demo 用内存即可；生产换 KV/DB）----
const profiles = new Map<string, UserProfile>();

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
    // TODO: 拼 prompt（注入 profile.name/commonPhrases/tone）→ 调云 LLM → 解析 4 条 ≤12 字
    // const candidates = await callLLM(heardText, profile, exclude);
    throw new Error('LLM not wired yet'); // 暂时强制走兜底
    // const resp: CandidatesResponse = { turnId, candidates };
    // res.json(resp);
  } catch {
    // ① backend 侧兜底：LLM 超时/报错 → 模板库
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

// 3.4 GET/POST /profile — 配置读写
app.get('/profile', (req, res) => {
  const userId = String(req.query.userId ?? 'demo');
  res.json(profiles.get(userId) ?? { userId, commonPhrases: [] } satisfies UserProfile);
});
app.post('/profile', (req, res) => {
  const profile = req.body as UserProfile;
  profiles.set(profile.userId, profile);
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`);
});
