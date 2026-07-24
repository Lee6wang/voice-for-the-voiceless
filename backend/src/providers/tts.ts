// 无声之声 · TTS provider（msedge-tts，免费免密钥）
// 走微软 Edge Read Aloud 的中文神经音色，输出 24kHz MP3。
// 设计：
// - 每次合成新建实例（该库连接为一次性，复用易踩状态残留）
// - 磁盘缓存 backend/data/tts-cache/：紧急表达与 Demo 关键句合成过一次后，
//   断网也能返回（AGENTS.md §7 Step 2.4 的预录兜底）
// - 超时/失败抛错，由路由层决定兜底行为

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'tts-cache');
const TTS_MIME = 'audio/mpeg';
const DEFAULT_VOICE = process.env.TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural';
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS ?? 6000);

/** profile.voice 允许的音色（传 default/未知值时用晓晓） */
const VOICE_WHITELIST = new Set([
  'zh-CN-XiaoxiaoNeural', // 女声，自然
  'zh-CN-YunxiNeural', //    男声，青年
  'zh-CN-YunyangNeural', //  男声，播音
  'zh-CN-XiaoyiNeural', //   女声，柔和
]);

function resolveVoice(voice?: string): string {
  return voice && VOICE_WHITELIST.has(voice) ? voice : DEFAULT_VOICE;
}

function cacheFile(text: string, voice: string): string {
  const key = createHash('sha1').update(`${voice}|${text}`).digest('hex');
  return join(CACHE_DIR, `${key}.mp3`);
}

async function synthOnce(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  try {
    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) throw new Error('TTS empty audio');
    return buf;
  } finally {
    tts.close();
  }
}

/**
 * 合成语音，返回 { audio: base64 mp3, mime }。
 * 命中缓存直接返回；云端失败但有缓存也返回缓存（断网兜底）；否则抛错。
 */
export async function synthesize(text: string, voice?: string): Promise<{ audio: string; mime: string }> {
  const v = resolveVoice(voice);
  const file = cacheFile(text, v);
  try {
    const buf = await Promise.race([
      synthOnce(text, v),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TTS timeout')), TIMEOUT_MS)),
    ]);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, buf);
    return { audio: buf.toString('base64'), mime: TTS_MIME };
  } catch (e) {
    if (existsSync(file)) {
      console.warn('[tts] synth failed, serving cache:', e instanceof Error ? e.message : e);
      return { audio: readFileSync(file).toString('base64'), mime: TTS_MIME };
    }
    throw e;
  }
}

/** 单次预录上限：防误传超长列表拖垮启动 */
const PREWARM_MAX = 20;

/**
 * 后台预合成关键句到磁盘缓存（fire-and-forget，不阻塞调用方）。
 * 用于 profile 保存时与 backend 启动时，把「紧急呼救语 + 常用语」提前合成好：
 * 演示现场即使断网，/tts 也能从缓存返回这些句子（AGENTS.md §5.4 预录兜底）。
 */
export function prewarmPhrases(phrases: (string | undefined)[], voice?: string): void {
  const texts = [...new Set(phrases.map((t) => t?.trim()).filter((t): t is string => !!t))]
    .slice(0, PREWARM_MAX);
  if (texts.length === 0) return;
  void (async () => {
    let done = 0;
    for (const text of texts) {
      if (existsSync(cacheFile(text, resolveVoice(voice)))) {
        done++; // 已合成过，直接计数，不重复请求云端
        continue;
      }
      try {
        await synthesize(text, voice);
        done++;
      } catch (e) {
        // 多半是断网：停掉本轮，缓存里已有的句子仍可兜底
        console.warn('[tts] prewarm stopped:', e instanceof Error ? e.message : e);
        break;
      }
    }
    console.log(`[tts] prewarmed ${done}/${texts.length} phrase(s) to disk cache`);
  })();
}
