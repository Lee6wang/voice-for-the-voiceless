#!/usr/bin/env node

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glassesDir = path.join(repoRoot, 'glasses-app');
const demoDir = path.join(glassesDir, '.demo');
const manifestPath = path.join(demoDir, 'app.json');
const distPath = path.join(glassesDir, 'dist');
const outputPath = path.join(glassesDir, 'voiceless.ehpk');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message) {
  console.error(`[demo:pack] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let backendUrl = '';
  let allowTemplate = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--backend-url') {
      backendUrl = argv[++index] ?? '';
    } else if (arg.startsWith('--backend-url=')) {
      backendUrl = arg.slice('--backend-url='.length);
    } else if (arg === '--allow-template') {
      allowTemplate = true;
    } else {
      fail(`未知参数：${arg}`);
    }
  }
  if (!backendUrl) {
    fail('缺少 --backend-url，例如 http://192.168.1.10:8787');
  }
  return { backendUrl, allowTemplate };
}

function normalizeBackendUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`backend URL 无效：${raw}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    fail('backend URL 只支持 http/https');
  }
  if (url.username || url.password) fail('backend URL 不得包含用户名或密码');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host === '[::]'
  ) {
    fail('真机不能访问 Mac 的 localhost，请传入 Mac 的热点局域网地址');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}

async function jsonRequest(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validateCandidates(response, allowTemplate) {
  const candidates = response?.candidates;
  if (!Array.isArray(candidates) || candidates.length !== 4) {
    fail('/candidates 未返回恰好 4 条候选');
  }
  const texts = candidates.map((candidate) => candidate?.text);
  if (
    texts.some(
      (text) =>
        typeof text !== 'string' ||
        !text.trim() ||
        Array.from(text.trim()).length > 12,
    ) ||
    new Set(texts.map((text) => text.trim())).size !== 4
  ) {
    fail('/candidates 违反非空、去重或 ≤12 字契约');
  }
  if (response.source !== 'llm' && response.source !== 'template') {
    fail(`/candidates 来源无效：${response.source ?? 'missing'}`);
  }
  if (!allowTemplate && response.source === 'template') {
    fail(`候选来源为 ${response.source ?? 'unknown'}；如明确接受模板，请添加 --allow-template`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出：${signal ?? code}`));
    });
  });
}

async function main() {
  const { backendUrl: rawBackendUrl, allowTemplate } = parseArgs(process.argv.slice(2));
  const backendUrl = normalizeBackendUrl(rawBackendUrl);
  console.log(`[demo:pack] backend: ${backendUrl}`);

  let health;
  try {
    health = await jsonRequest(`${backendUrl}/health`, {}, 3000);
  } catch (error) {
    fail(`/health 不可达：${error instanceof Error ? error.message : error}`);
  }
  if (!health?.ok) fail('/health 返回 ok=false');
  if (!health.asr) fail('ASR 模型未就绪，不能打真机 Demo 包');
  if (!health.llm && !allowTemplate) {
    fail('LLM 未配置；如明确接受模板，请添加 --allow-template');
  }
  console.log(
    `[demo:pack] health: ASR=${health.asr} LLM=${health.llm} TTS=${health.tts}`,
  );

  let candidateResponse;
  try {
    candidateResponse = await jsonRequest(
      `${backendUrl}/candidates`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          turnId: 'demo-preflight',
          heardText: '你今天感觉怎么样？',
          profile: {
            userId: 'demo-preflight',
            commonPhrases: ['容我想想'],
            tone: 'plain',
          },
          context: { localTime: '12:00', timeOfDay: '午餐时段' },
          mode: 'reply',
        }),
      },
      6000,
    );
  } catch (error) {
    fail(`/candidates 预检失败：${error instanceof Error ? error.message : error}`);
  }
  validateCandidates(candidateResponse, allowTemplate);
  console.log(`[demo:pack] candidates: ${candidateResponse.source ?? 'unknown'} ✓`);

  let ttsResponse;
  try {
    ttsResponse = await jsonRequest(
      `${backendUrl}/tts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '准备就绪' }),
      },
      9000,
    );
  } catch (error) {
    fail(`/tts 预检失败：${error instanceof Error ? error.message : error}`);
  }
  if (typeof ttsResponse?.audio !== 'string' || !ttsResponse.audio.trim()) {
    fail('/tts 未返回音频');
  }
  console.log('[demo:pack] tts: audio ✓');

  await run(npmCommand, ['--workspace', 'glasses-app', 'run', 'build'], {
    env: { ...process.env, VITE_BACKEND_URL: backendUrl },
  });

  const manifest = JSON.parse(
    await readFile(path.join(glassesDir, 'app.json'), 'utf8'),
  );
  const networkPermission = manifest.permissions?.find(
    (permission) => permission.name === 'network',
  );
  if (!networkPermission) fail('app.json 缺少 network 权限');
  networkPermission.whitelist = [backendUrl];
  await mkdir(demoDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // evenhub CLI 某些失败场景仍返回 0；先移除旧包，再对新产物做存在性/大小校验。
  await rm(outputPath, { force: true });
  await run(npmCommand, [
    '--workspace',
    'glasses-app',
    'exec',
    'evenhub',
    '--',
    'pack',
    manifestPath,
    distPath,
    '-o',
    outputPath,
  ]);
  const packed = await stat(outputPath).catch(() => null);
  if (!packed?.isFile() || packed.size === 0) {
    fail('evenhub pack 未生成非空 .ehpk 产物');
  }
  console.log(`[demo:pack] ready: ${outputPath}`);
}

await main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
