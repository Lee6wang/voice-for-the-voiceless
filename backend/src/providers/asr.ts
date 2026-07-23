// 无声之声 · ASR provider（sherpa-onnx + SenseVoice，端侧离线识别）
// 决策依据：backend 跑在 Mac 上算力充足；免注册免密钥；断网也能识别，
// 与两层兜底哲学一致。3~5s 语音在 M 系芯片上识别耗时 <1s。
// 模型放 backend/models/（gitignore），下载见 backend/models/README 或 AGENTS.md。
//
// 输入约定（接口契约 §3.1 / §5.4）：base64 PCM 16kHz mono（16-bit little-endian）

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// sherpa-onnx-node 是 CommonJS 包，ESM 下没有具名导出，须默认导入后再解构
import sherpaOnnx from 'sherpa-onnx-node';

const { OfflineRecognizer } = sherpaOnnx;
type Recognizer = InstanceType<typeof OfflineRecognizer>;

const MODEL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'models',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
);
const SAMPLE_RATE = 16000;

let recognizer: Recognizer | null = null;

/** 模型是否就绪（/health 用；未下载模型时 /asr 返回明确错误而非假文本） */
export function asrReady(): boolean {
  return existsSync(join(MODEL_DIR, 'model.int8.onnx'));
}

/** 懒加载：首次调用时初始化（约 1~2s），之后常驻内存 */
function getRecognizer(): Recognizer {
  if (!recognizer) {
    if (!asrReady()) throw new Error(`ASR model not found: ${MODEL_DIR}`);
    recognizer = new OfflineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        senseVoice: { model: join(MODEL_DIR, 'model.int8.onnx'), useInverseTextNormalization: 1 },
        tokens: join(MODEL_DIR, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
      },
    });
    console.log('[asr] SenseVoice recognizer initialized');
  }
  return recognizer;
}

/** base64 PCM16LE → Float32 [-1,1] */
function pcmBase64ToFloat32(audioB64: string): Float32Array {
  const buf = Buffer.from(audioB64, 'base64');
  const samples = new Float32Array(Math.floor(buf.length / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

/** 整段识别：base64 PCM 16kHz mono → 中文文本 */
export function transcribe(audioB64: string): string {
  const samples = pcmBase64ToFloat32(audioB64);
  if (samples.length === 0) throw new Error('empty audio');
  const rec = getRecognizer();
  const stream = rec.createStream();
  stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
  rec.decode(stream);
  return rec.getResult(stream).text.trim();
}

/** 启动时预热（可选调用）：避免首次请求叠加模型加载延迟 */
export function warmupAsr(): void {
  if (!asrReady()) {
    console.warn('[asr] model not downloaded, /asr will return 503');
    return;
  }
  try {
    getRecognizer();
  } catch (e) {
    console.error('[asr] warmup failed:', e);
  }
}
