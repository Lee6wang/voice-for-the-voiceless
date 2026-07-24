// 无声之声 · 薄云后端
// 职责：配置存储 + 云 API 密钥代理。glasses-app 只调这里，密钥不落客户端。
// 现状：/candidates 已接真实 LLM（OpenAI 兼容 provider，失败回退模板库）；
//       /tts 已接 msedge-tts（免密钥 + 磁盘缓存兜底）；
//       /asr 已接 sherpa-onnx SenseVoice 端侧离线识别；
//       profile 已做 JSON 文件持久化，保存/启动时预录 TTS 关键句。
// 对应文档：docs/接口契约.md §3

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  type AsrResponse,
  type CandidatesRequest,
  type TtsResponse,
  type UserProfile,
} from '@vftv/shared';
import { createCandidatesResponse } from './candidate-response';
import { asrReady, transcribe, warmupAsr } from './providers/asr';
import { loadLlmConfig } from './providers/llm';
import { prewarmPhrases, synthesize } from './providers/tts';
import { getProfile, listProfiles, loadProfiles, saveProfile } from './store';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // base64 音频较大

// ---- 配置存储（JSON 文件持久化，重启不丢；生产换 KV/DB）----
loadProfiles();
// 启动即把已存 profile 的紧急语/常用语预合成进磁盘缓存：现场断网也能朗读关键句
for (const p of listProfiles()) {
  prewarmPhrases([p.emergencyText, ...(p.commonPhrases ?? [])], p.voice);
}

// 3.1 POST /asr — 语音转文字（sherpa-onnx + SenseVoice 端侧离线识别，免密钥断网可用）
app.post('/asr', async (req, res) => {
  const { audio } = req.body as { audio?: string };
  if (!audio) {
    res.status(400).json({ ok: false, error: 'audio required (base64 PCM 16kHz mono)' });
    return;
  }
  if (!asrReady()) {
    // 模型未下载：明确报错而非假文本，便于 A 端区分故障
    res.status(503).json({ ok: false, error: 'ASR model not downloaded, see backend/models/README.md' });
    return;
  }
  try {
    const resp: AsrResponse = { text: transcribe(audio) };
    res.json(resp);
  } catch (e) {
    console.warn('[asr] failed:', e instanceof Error ? e.message : e);
    res.status(500).json({ ok: false, error: 'ASR failed' });
  }
});

// 3.2 POST /candidates — 生成候选（核心）
app.post('/candidates', async (req, res) => {
  // 真实 LLM 注入 profile/场景/对象/历史；失败由共享模板库兜底并显式标注 source。
  res.json(await createCandidatesResponse(req.body as CandidatesRequest));
});

// 3.3 POST /tts — 文字转语音（msedge-tts，免密钥；同文本磁盘缓存，断网可回放已合成句）
app.post('/tts', async (req, res) => {
  const { text, voice } = req.body as { text?: string; voice?: string };
  if (!text?.trim()) {
    res.status(400).json({ ok: false, error: 'text required' });
    return;
  }
  try {
    const { audio, mime } = await synthesize(text.trim(), voice);
    const resp: TtsResponse = { audio, mime };
    res.json(resp);
  } catch (e) {
    // 合成失败且无缓存：返空 audio，前端降级为 HUD 纯文字展示（契约 §5.5 不白屏）
    console.warn('[tts] failed:', e instanceof Error ? e.message : e);
    const resp: TtsResponse = { audio: '', mime: 'audio/mpeg' };
    res.json(resp);
  }
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
  // 后台预合成紧急语 + 常用语（不阻塞响应；断网时由磁盘缓存兜底）
  prewarmPhrases([profile.emergencyText, ...(profile.commonPhrases ?? [])], profile.voice);
  res.json({ ok: true });
});

// 3.5 GET /health — 联调用：确认服务可达 + 各云能力是否已配置
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    llm: loadLlmConfig() !== null, // false = 未配 LLM_API_KEY，/candidates 恒走模板
    tts: true, // msedge-tts 免密钥，始终可用（断网时靠缓存）
    asr: asrReady(), // false = 模型未下载，/asr 返 503
    uptime: Math.round(process.uptime()),
  });
});

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`);
  warmupAsr(); // 预热识别模型，避免首次 /asr 叠加加载延迟
});
