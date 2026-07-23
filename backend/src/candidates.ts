// 无声之声 · 候选生成（prompt 拼装 + 输出确定性清洗）
// 完成标准见 AGENTS.md §10：恰好 4 条、去重、≤12 字、失败自动回退模板库。

import {
  pickTemplateCandidates,
  CANDIDATE_COUNT,
  CANDIDATE_MAX_LEN,
  type Candidate,
  type UserProfile,
} from '@vftv/shared';
import { chatComplete, loadLlmConfig } from './providers/llm';

const TONE_LABEL: Record<NonNullable<UserProfile['tone']>, string> = {
  gentle: '温和、体贴，多用缓和语气词',
  plain: '自然、简洁，像日常口语',
  humor: '轻松幽默，偶尔俏皮但不失礼',
};

/** 拼 system prompt：让 LLM「用这个用户的方式」说话 */
function buildSystemPrompt(profile: UserProfile): string {
  const lines = [
    '你替一位不方便开口说话的用户生成口头回复候选。',
    `严格输出 JSON 字符串数组，恰好 ${CANDIDATE_COUNT} 条，不要输出其他任何内容。`,
    `每条是完整口语短句，不超过 ${CANDIDATE_MAX_LEN} 个字，不带标点结尾也可以。`,
    '4 条必须覆盖不同意图方向（如：肯定 / 委婉拒绝 / 追问澄清 / 缓冲拖延），供用户临场挑选。',
  ];
  if (profile.name) lines.push(`用户名字：${profile.name}（对方问称呼时可用）。`);
  if (profile.tone) lines.push(`说话风格：${TONE_LABEL[profile.tone]}。`);
  if (profile.commonPhrases.length > 0) {
    lines.push(`用户平时的常用表达（优先模仿其用词习惯）：${profile.commonPhrases.join('、')}。`);
  }
  return lines.join('\n');
}

function buildUserPrompt(heardText: string, exclude: string[]): string {
  const lines = [`对方刚刚说：「${heardText}」`, '请生成回复候选。'];
  if (exclude.length > 0) lines.push(`这些已经展示过，禁止重复或近似：${exclude.join('、')}`);
  return lines.join('\n');
}

/** 从 LLM 原始输出提取字符串数组：优先 JSON，退化为按行切分 */
function parseTexts(raw: string): string[] {
  const stripped = raw.replace(/```(?:json)?/g, '').trim();
  const jsonMatch = stripped.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string');
    } catch {
      /* 落入按行切分 */
    }
  }
  return stripped
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.、)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

/** 确定性清洗：去引号→去重→剔除超长/已展示→模板补足到恰好 4 条 */
function sanitize(texts: string[], heardText: string, exclude: string[]): Candidate[] {
  const seen = new Set<string>(exclude);
  const cleaned: string[] = [];
  for (const t of texts) {
    const text = t.replace(/^["'「『]+|["'」』]+$/g, '').trim();
    if (!text || text.length > CANDIDATE_MAX_LEN || seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
    if (cleaned.length === CANDIDATE_COUNT) break;
  }
  if (cleaned.length < CANDIDATE_COUNT) {
    for (const c of pickTemplateCandidates(heardText, [...seen])) {
      if (seen.has(c.text)) continue;
      seen.add(c.text);
      cleaned.push(c.text);
      if (cleaned.length === CANDIDATE_COUNT) break;
    }
  }
  let seq = Date.now() % 100000;
  return cleaned.slice(0, CANDIDATE_COUNT).map((text) => ({ id: `llm_${seq++}`, text }));
}

/**
 * 生成 4 条个性化候选。
 * 未配置 LLM_API_KEY 或调用失败时抛错，由路由层统一走模板兜底（两层兜底 ①）。
 */
export async function generateCandidates(
  heardText: string,
  profile: UserProfile,
  exclude: string[],
): Promise<Candidate[]> {
  const cfg = loadLlmConfig();
  if (!cfg) throw new Error('LLM_API_KEY not configured');
  const raw = await chatComplete(cfg, buildSystemPrompt(profile), buildUserPrompt(heardText, exclude));
  const candidates = sanitize(parseTexts(raw), heardText, exclude);
  if (candidates.length !== CANDIDATE_COUNT) throw new Error('sanitize produced wrong count');
  return candidates;
}
