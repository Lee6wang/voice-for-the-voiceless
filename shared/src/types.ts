// 无声之声 · 共享类型（接口契约的单一真相源）
// 修改 API 结构 = 改这里；glasses-app 与 backend 都 import 本文件，绝不复制。
// 对应文档：docs/接口契约.md

/** 一条候选回复 */
export interface Candidate {
  /** 稳定 id，供选择/埋点 */
  id: string;
  /** 展示 & 朗读文本，≤12 字 */
  text: string;
}

/** 一屏候选（固定 4 条） */
export interface CandidateSet {
  /** 对应哪一轮对方发言 */
  turnId: string;
  /** ASR 转写的"对方说了什么"（HUD 顶部可显示） */
  heardText: string;
  /** 候选，长度固定 4 */
  candidates: Candidate[];
  /** 当前高亮项，默认 0 */
  highlightIndex: number;
}

/** 眼镜端交互状态（见接口契约 §2 状态机） */
export type UiState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'CANDIDATES'
  | 'SPEAKING';

/** 原始输入事件（R1 戒指 / 镜腿触控，语义随状态而变） */
export type RawInput =
  | 'tap' //           IDLE: 开始聆听 ; CANDIDATES: 确认选中→朗读
  | 'swipe_up' //      CANDIDATES: 上一个候选
  | 'swipe_down' //    CANDIDATES: 下一个候选
  | 'double_tap' //    IDLE: 唤主动模式 ; CANDIDATES: 换一批
  | 'temple_double_tap'; // 任意状态: 紧急呼救

/** 用户个性化配置（结构化字段全部可选、加性；B 端不接也不报错） */
export interface UserProfile {
  userId: string;
  /** 用于候选里的自我介绍 */
  name?: string;
  /** 身份/职业，如「学生」「程序员」「店主」，帮候选贴合身份 */
  role?: string;
  /** 表达困难类型，如「社恐」「口吃」「发音不清」「反应慢」「易紧张」，让候选更省力稳妥 */
  challenges?: string[];
  /** 兴趣/擅长话题，用于破冰闲聊 */
  interests?: string[];
  /** 避免的字眼/话题，候选须回避 */
  avoidWords?: string[];
  /** 简洁度偏好：terse 更短、normal 正常 */
  verbosity?: 'terse' | 'normal';
  /** 常用语，喂进 LLM prompt */
  commonPhrases: string[];
  /** 语气偏好 */
  tone?: 'gentle' | 'plain' | 'humor';
  /** TTS 音色 id */
  voice?: string;
  /** 紧急呼救要喊的话 */
  emergencyText?: string;
}

/** 交互模式（reply=应答 / active=主动开口 / emergency=紧急）。
 *  注意：emergency 保持固定文本广播、不经 /candidates（离线/低延迟 fail-safe）。 */
export type InteractionMode = 'reply' | 'active' | 'emergency';

// ---- backend HTTP 接口的请求/响应（见接口契约 §3）----

export interface AsrRequest {
  /** base64 PCM 16kHz mono */
  audio: string;
  final?: boolean;
}
export interface AsrResponse {
  text: string;
}

/** 场景上下文（插件采集，backend 注入 prompt；全部可选，缺了就当没有） */
export interface SceneContext {
  /** 本地时间 HH:mm */
  localTime?: string;
  /** 时段标签，如「午餐时段」 */
  timeOfDay?: string;
  /** 场景标签，如「餐厅」；插件手选，或 backend 按经纬度反查 POI 得出 */
  scene?: string;
  /** 对话对象/关系，如「陌生人」「朋友」「家人」「上级」「同事」「服务员」 */
  partner?: string;
  /** 经纬度（scene 缺失时 backend 可反查） */
  lat?: number;
  lon?: number;
}

/** 一轮已完成的对话（多轮上下文：对方说了什么 + 用户选了什么） */
export interface ConversationTurn {
  /** 对方说的话（ASR 转写） */
  heard: string;
  /** 用户选中并说出的候选 */
  said: string;
}

export interface CandidatesRequest {
  turnId: string;
  heardText: string;
  profile: UserProfile;
  /** 换一批时传，避免重复 */
  exclude?: string[];
  /** 场景上下文（时间/地点/对象），候选会贴合情境 */
  context?: SceneContext;
  /** 交互模式，缺省按 'reply'（emergency 不会走此接口） */
  mode?: InteractionMode;
  /** 多轮上下文（最近几轮对话，可选、加性；backend 消费为可选增强） */
  history?: ConversationTurn[];
}
export interface CandidatesResponse {
  turnId: string;
  candidates: Candidate[];
  /** 候选由真实 LLM 或 backend 模板库生成；旧 backend 可不返回。 */
  source?: 'llm' | 'template';
}

export interface TtsRequest {
  text: string;
  voice?: string;
}
export interface TtsResponse {
  /** base64 mp3/wav */
  audio: string;
  /** 音频 MIME，如 'audio/mpeg'；可选，缺省按 mp3 处理（向后兼容） */
  mime?: string;
}

/** GET /health 响应。 */
export interface HealthResponse {
  ok: boolean;
  llm: boolean;
  tts: boolean;
  asr: boolean;
  uptime: number;
}

/** 候选恒为 4 条 */
export const CANDIDATE_COUNT = 4;
/** 候选文本长度上限 */
export const CANDIDATE_MAX_LEN = 12;
