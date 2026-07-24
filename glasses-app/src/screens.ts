// 无声之声 · 眼镜 HUD 屏幕层（全状态画面）
// 576x288 单色绿 16 级灰、无字号 API：视觉层次靠分区布局 + 边框灰阶 + box-drawing + 符号 + 留白。
// 每个 builder 返回声明式 PageSpec，交给 hub.renderPage 渲染（结构不变则无闪 upgrade）。
// 大多数状态复用同一「三分区」结构（状态栏/正文/提示栏），故状态间切换多为无闪更新；
// 仅紧急态用整屏粗框（结构不同 → 重建，可接受）。

import type { CandidateSet } from '@vftv/shared';
import type { PageSpec, ZoneSpec } from './hub';

const W = 576;
const H = 288;

// 三分区几何（id 固定，保证同结构可无闪 upgrade）
const STATUS = { id: 1, name: 'status', x: 0, y: 0, w: W, h: 44 } as const;
const BODY = { id: 2, name: 'body', x: 0, y: 50, w: W, h: 188 } as const;
const HINT = { id: 3, name: 'hint', x: 0, y: 246, w: W, h: 40 } as const;

/** 通用三分区框：顶部状态栏（细边框）/ 中部正文 / 底部提示栏。 */
function frame(status: string, body: string, hint: string): PageSpec {
  const zones: ZoneSpec[] = [
    { ...STATUS, border: 6, content: status },
    { ...BODY, content: body },
    { ...HINT, content: hint },
  ];
  return { zones };
}

/** 待机：主标题 + 引导 + 操作提示。 */
export function idleScreen(subtitle = '轻点戒指 · 开始聆听'): PageSpec {
  return frame('无声之声', `\n${subtitle}`, '双击=常用语　·　镜腿双击=紧急呼救');
}

/** 聆听中：进度条（走无闪 upgrade，200ms tick 不重建）。 */
export function listeningScreen(elapsedMs: number, totalMs: number): PageSpec {
  const n = 12;
  const filled = Math.max(0, Math.min(n, Math.round((elapsedMs / totalMs) * n)));
  const bar = `${'█'.repeat(filled)}${'━'.repeat(n - filled)}`;
  return frame('◉ 聆听中', `\n${bar}`, '再点一下 · 提前结束');
}

/** 思考中。 */
export function thinkingScreen(): PageSpec {
  return frame('◍ 思考中', '\n正在生成候选…', '稍候片刻');
}

/** 候选态：状态栏显「听到…+ n/总」，正文四条（或大字每屏 2 条），底部操作提示。 */
export function candidatesScreen(set: CandidateSet, bigText = false, armed = false): PageSpec {
  const isActive = set.turnId.startsWith('active_');
  const badge = ['①', '②', '③', '④'];
  const total = set.candidates.length;
  const heard = isActive ? set.heardText : `听到：${set.heardText || '（未识别，可换一批）'}`;
  const status = `${heard}　${set.highlightIndex + 1}/${total}`;

  let lines: string[];
  if (bigText) {
    const start = Math.floor(set.highlightIndex / 2) * 2; // 每屏 2 条的页
    lines = set.candidates
      .map((c, i) => ({ c, i }))
      .slice(start, start + 2)
      .map(({ c, i }) => (i === set.highlightIndex ? `❯ ${c.text}` : `　 ${c.text}`));
  } else {
    lines = set.candidates.map((c, i) =>
      i === set.highlightIndex ? `❯ ${badge[i] ?? ''} ${c.text}` : `　${badge[i] ?? ''} ${c.text}`,
    );
  }
  const hint = armed ? '再点一下·说出所选 ✓' : '滑动选择　·　点按说出　·　双击换一批';
  return frame(status, lines.join('\n'), hint);
}

/** 正在发声。 */
export function speakingScreen(text: string): PageSpec {
  return frame('🔊 正在替你说', `\n${text}`, '');
}

/** 已说出确认（确定感，兼容听障）。 */
export function confirmedScreen(text: string): PageSpec {
  return frame('✓ 已替你说', `\n${text}`, '');
}

/** 紧急呼救：整屏粗框大字；alt 交替两帧造闪烁（同结构 → 无闪 upgrade）。 */
export function emergencyScreen(text: string, alt: boolean): PageSpec {
  const title = alt ? '⚠　紧急呼救　⚠' : '█　紧急呼救　█';
  return {
    zones: [
      { id: 1, name: 'emergency', x: 0, y: 0, w: W, h: H, border: 15, content: `\n${title}\n\n${text}` },
    ],
  };
}
