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

/** 用户个性化配置 */
export interface UserProfile {
  userId: string;
  /** 用于候选里的自我介绍 */
  name?: string;
  /** 常用语，喂进 LLM prompt */
  commonPhrases: string[];
  /** 语气偏好 */
  tone?: 'gentle' | 'plain' | 'humor';
  /** TTS 音色 id */
  voice?: string;
  /** 紧急呼救要喊的话 */
  emergencyText?: string;
}

// ---- backend HTTP 接口的请求/响应（见接口契约 §3）----

export interface AsrRequest {
  /** base64 PCM 16kHz mono */
  audio: string;
  final?: boolean;
}
export interface AsrResponse {
  text: string;
}

export interface CandidatesRequest {
  turnId: string;
  heardText: string;
  profile: UserProfile;
  /** 换一批时传，避免重复 */
  exclude?: string[];
}
export interface CandidatesResponse {
  turnId: string;
  candidates: Candidate[];
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

/** 候选恒为 4 条 */
export const CANDIDATE_COUNT = 4;
/** 候选文本长度上限 */
export const CANDIDATE_MAX_LEN = 12;
