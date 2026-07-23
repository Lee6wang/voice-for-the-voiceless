// 无声之声 · 模板库（双层兜底共用同一份）
// - backend 侧：LLM 超时/报错时用它出候选
// - glasses-app 插件端：断网/backend 不可达时用它出候选（保证无网可演）
// 见文档 docs/无声之声-项目方案.md §附录 A

import { Candidate, CANDIDATE_COUNT } from './types';

export interface TemplateRule {
  /** 命中关键词（正则），优先级从上到下 */
  match: RegExp;
  /** 候选文本，社交润滑语优先 */
  candidates: string[];
}

/** 意图分类规则（关键词匹配，优先级从上到下） */
export const TEMPLATE_RULES: TemplateRule[] = [
  { match: /(你好|您好|认识|久仰|初次)/, candidates: ['你好，很高兴认识你', '最近挺好的', '呵呵～', '换一批'] },
  { match: /(名字|叫什么|怎么称呼|你是谁)/, candidates: ['我叫……', '我是参赛选手', '叫我小X就好', '换一批'] },
  { match: /(觉得|看法|意见|怎么想|如何看)/, candidates: ['我认同', '我有点不同看法', '容我想想', '你先说，我在听'] },
  { match: /(是不是|对吗|确认|好吗|行不行)/, candidates: ['是的', '我觉得不太行', '可能吧', '我再确认下'] },
  { match: /(为什么|怎么办|如何|多少|哪个)/, candidates: ['等我一下', '这个问题有点大', '我需要点时间想', '我们稍后聊可以吗'] },
  { match: /(走了|再见|结束|拜拜|回头)/, candidates: ['我先失陪一下', '今天先到这', '谢谢你的理解', '我们下次再聊'] },
];

/** 兜底候选（未命中任何规则时） */
export const FALLBACK_CANDIDATES = ['是的', '我不太确定', '容我想想', '换一批'];

let _seq = 0;
function toCandidates(texts: string[], exclude: string[]): Candidate[] {
  const filtered = texts.filter((t) => !exclude.includes(t));
  const picked = (filtered.length >= CANDIDATE_COUNT ? filtered : [...filtered, ...FALLBACK_CANDIDATES])
    .slice(0, CANDIDATE_COUNT);
  return picked.map((text) => ({ id: `tpl_${_seq++}`, text }));
}

/**
 * 根据对方说的话，用模板库出 4 条候选（永远返回 4 条）。
 * backend 与 glasses-app 共用此函数，保证两层兜底行为一致。
 */
export function pickTemplateCandidates(heardText: string, exclude: string[] = []): Candidate[] {
  const rule = TEMPLATE_RULES.find((r) => r.match.test(heardText));
  return toCandidates(rule ? rule.candidates : FALLBACK_CANDIDATES, exclude);
}
