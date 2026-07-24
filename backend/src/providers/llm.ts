// 无声之声 · LLM provider（OpenAI 兼容协议）
// DeepSeek / 火山方舟 / 通义 / Kimi 均兼容此协议，换厂商只改 .env 的 LLM_BASE_URL/LLM_MODEL。
// 密钥只从环境变量读取，绝不进入客户端（AGENTS.md §9）。

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** 从环境变量读配置；未配置 apiKey 时返回 null（调用方走模板兜底） */
export function loadLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey,
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 2500),
  };
}

/**
 * 调一次 chat completion，返回原始文本内容。
 * 超时/非 2xx/结构异常统一抛错，由调用方决定兜底。
 */
export async function chatComplete(
  cfg: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}
