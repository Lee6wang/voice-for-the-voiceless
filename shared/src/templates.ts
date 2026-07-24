// 无声之声 · 模板库（双层兜底共用同一份）
// - backend 侧：LLM 超时/报错时用它出候选
// - glasses-app 插件端：断网/backend 不可达时用它出候选（保证无网可演）
// 见文档 docs/无声之声-项目方案.md §附录 A

import { Candidate, CANDIDATE_COUNT, CANDIDATE_MAX_LEN } from './types';

export interface TemplateRule {
  /** 命中关键词（正则），优先级从上到下 */
  match: RegExp;
  /** 候选文本，社交润滑语优先 */
  candidates: string[];
}

/** 意图分类规则（关键词匹配，优先级从上到下；具体场景在前，通用规则在后） */
export const TEMPLATE_RULES: TemplateRule[] = [
  // —— 安全与身体（最高优先级）——
  { match: /(没事吧|要不要紧|受伤|救护车|报警)/, candidates: ['我没事，谢谢', '我需要帮助', '请帮我联系家人', '别担心'] },
  { match: /(身体|不舒服|生病|好点了吗|去医院|吃药)/, candidates: ['我好多了，谢谢', '有点不舒服', '需要休息一下', '没事，别担心'] },
  // —— 日常高频场景 ——
  { match: /(吃了吗|吃饭|想吃什么|好吃|点菜|饿)/, candidates: ['我想吃面条', '都可以，你定', '我不太饿', '这家不错'] },
  { match: /(喝点什么|喝咖啡|喝茶|奶茶|饮料|口渴)/, candidates: ['温水就好', '我想喝咖啡', '不用了，谢谢', '你点吧'] },
  { match: /(一起|要不要去|来吗|爬山|看电影|聚会)/, candidates: ['好啊，一起去', '下次吧，有点累', '我看下时间', '听起来不错'] },
  { match: /(几点|什么时候|哪天|周末|有空)/, candidates: ['周末可以', '下周吧', '我看看日程', '现在有点忙'] },
  { match: /(在哪|哪里|怎么去|地址|远不远)/, candidates: ['我发定位给你', '就在附近', '打车比较方便', '我也不太熟'] },
  { match: /(多少钱|价格|贵不贵|便宜|划算)/, candidates: ['有点贵', '挺划算的', '我再想想', '可以入手'] },
  // —— 社交互动 ——
  { match: /(帮我|帮忙|拜托|能不能帮|借一下)/, candidates: ['没问题', '我尽量试试', '不太方便，抱歉', '我想想办法'] },
  { match: /(谢谢|感谢|多亏你|麻烦你)/, candidates: ['不客气', '应该的', '小事一桩', '别放心上'] },
  { match: /(对不起|抱歉|不好意思|怪我)/, candidates: ['没关系', '没事的', '别放在心上', '我理解'] },
  { match: /(厉害|真棒|优秀|漂亮|好看|聪明)/, candidates: ['谢谢夸奖', '你也一样', '哈哈，过奖了', '还好啦'] },
  { match: /(工作|项目|进度|上班|加班)/, candidates: ['进展顺利', '还在推进中', '最近有点忙', '按计划进行'] },
  { match: /(天气|下雨|好热|好冷|降温|台风)/, candidates: ['记得带伞', '注意保暖', '天气真不错', '适合出去走走'] },
  { match: /(等一下|稍等|等我|久等|马上来)/, candidates: ['不急，慢慢来', '我等你', '好的', '不着急'] },
  { match: /(听懂|明白吗|理解|懂我的意思)/, candidates: ['我明白你的意思', '能再说一遍吗', '大概懂了', '让我想想'] },
  // —— 通用社交（原有规则，保持靠后兜底）——
  { match: /(你好|您好|认识|久仰|初次)/, candidates: ['你好，很高兴认识你', '最近挺好的', '呵呵～', '换一批'] },
  { match: /(名字|叫什么|怎么称呼|你是谁)/, candidates: ['我叫……', '我是参赛选手', '叫我小X就好', '换一批'] },
  { match: /(觉得|看法|意见|怎么想|如何看)/, candidates: ['我认同', '我有点不同看法', '容我想想', '你先说，我在听'] },
  { match: /(是不是|对吗|确认|好吗|行不行)/, candidates: ['是的', '我觉得不太行', '可能吧', '我再确认下'] },
  { match: /(为什么|怎么办|如何|多少|哪个)/, candidates: ['等我一下', '这个问题有点大', '我需要点时间想', '我们稍后聊可以吗'] },
  { match: /(走了|再见|结束|拜拜|回头)/, candidates: ['我先失陪一下', '今天先到这', '谢谢你的理解', '我们下次再聊'] },
];

/** 兜底候选（未命中任何规则时） */
export const FALLBACK_CANDIDATES = ['是的', '我不太确定', '容我想想', '换一批'];

/** 排除池耗尽时继续补位，保证任何输入下当前批次仍有 4 条不同短句。 */
const RECOVERY_CANDIDATES = [
  '请再说一遍',
  '让我想一下',
  '你先说，我在听',
  '稍后回复你',
  '可以',
  '暂时不行',
  '谢谢',
  '我明白了',
];

let _seq = 0;

export interface NormalizeCandidateOptions {
  exclude?: readonly string[];
  idPrefix?: string;
}

/** HUD 字数按 Unicode code point 计算，避免 emoji 被 UTF-16 代理对重复计数。 */
export function candidateTextLength(text: string): number {
  return Array.from(text).length;
}

/**
 * 把任意文本规范化成一屏候选。
 * 优先避开 exclude；若所有安全短句都曾展示过，以“当前批次仍恰好 4 条且互不重复”为更高优先级。
 */
export function normalizeCandidateTexts(
  texts: readonly string[],
  heardText: string,
  options: NormalizeCandidateOptions = {},
): Candidate[] {
  const exclude = new Set(options.exclude ?? []);
  const matched = TEMPLATE_RULES.find((r) => r.match.test(heardText))?.candidates ?? [];
  const safePool = [...texts, ...matched, ...FALLBACK_CANDIDATES, ...RECOVERY_CANDIDATES];
  const picked: string[] = [];
  const seen = new Set<string>();

  const add = (allowExcluded: boolean) => {
    for (const raw of safePool) {
      const text = raw.trim();
      if (
        !text ||
        candidateTextLength(text) > CANDIDATE_MAX_LEN ||
        seen.has(text) ||
        (!allowExcluded && exclude.has(text))
      ) {
        continue;
      }
      seen.add(text);
      picked.push(text);
      if (picked.length === CANDIDATE_COUNT) return;
    }
  };

  add(false);
  if (picked.length < CANDIDATE_COUNT) add(true);

  const prefix = options.idPrefix ?? 'cand';
  return picked.slice(0, CANDIDATE_COUNT).map((text) => ({ id: `${prefix}_${_seq++}`, text }));
}

/**
 * 根据对方说的话，用模板库出 4 条候选（永远返回 4 条）。
 * backend 与 glasses-app 共用此函数，保证两层兜底行为一致。
 */
export function pickTemplateCandidates(heardText: string, exclude: string[] = []): Candidate[] {
  const rule = TEMPLATE_RULES.find((r) => r.match.test(heardText));
  return normalizeCandidateTexts(rule ? rule.candidates : FALLBACK_CANDIDATES, heardText, {
    exclude,
    idPrefix: 'tpl',
  });
}
