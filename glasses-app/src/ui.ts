// 无声之声 · companion UI（手机端菜单页/配置页）
// 官方 asr 模板范式：手机屏是插件的一等界面——状态 chip、眼镜 HUD 镜像、个性化配置表单。
// 本模块只管 DOM 视图与表单序列化；持久化(KVS)与内存 profile 由 main.ts 的 onSave 回调负责。

import {
  CANDIDATE_MAX_LEN,
  candidateTextLength,
  type HealthResponse,
  type UiState,
  type UserProfile,
} from '@vftv/shared';

type ViewName = 'menu' | 'config';

/** 场景预设 id（影响候选生成与快捷句的短语包） */
export type SceneId = 'default' | 'work' | 'dining' | 'social';

/** 场景中文名（配置页短语包编辑器的标签，也供菜单页 chips） */
export const SCENE_LABELS: Record<SceneId, string> = {
  default: '通用',
  work: '工作',
  dining: '点餐',
  social: '聚会',
};

/** 一组主动模式短语（用户可增删改） */
export interface PhraseGroup {
  id: string;
  name: string;
  phrases: string[];
}

/** 对话对象 id（会话级，派生进 SceneContext.partner 传给后端） */
export type PartnerId =
  | 'default'
  | 'stranger'
  | 'friend'
  | 'family'
  | 'senior'
  | 'colleague'
  | 'staff';

/** 主动模式分组默认值（用户未配置时的初始预设，之后完全可改） */
export const DEFAULT_ACTIVE_GROUPS: PhraseGroup[] = [
  { id: 'g_hello', name: '打招呼', phrases: ['你好，很高兴认识你', '早上好', '好久不见', '回头见'] },
  { id: 'g_need', name: '需求', phrases: ['请帮我一下', '请给我一杯水', '我想休息一下', '请再说一遍'] },
  { id: 'g_buffer', name: '缓冲', phrases: ['等我一下', '容我想想', '我在听', '稍后回复你'] },
  { id: 'g_bye', name: '告别', phrases: ['我先失陪一下', '今天先到这', '谢谢你的理解', '我们下次再聊'] },
];

/** 场景短语包默认值（用户未配置时的初始预设，之后完全可改） */
export const DEFAULT_SCENE_PHRASES: Record<SceneId, string[]> = {
  default: [],
  work: ['我先记一下，稍后回复你', '这个我需要确认一下', '可以发我文字吗', '我们约个时间细聊'],
  dining: ['请给我一杯温水', '我要这个，谢谢', '请少辣，谢谢', '麻烦帮我打包'],
  social: ['很高兴见到你', '你先说，我在听', '我去下洗手间', '今天很开心，先走啦'],
};

/** 预设的表达困难标签（与 HTML 里的固定复选项一致；其余为用户自定义） */
const PRESET_CHALLENGES = ['社恐', '口吃', '发音不清', '反应慢', '易紧张'];

/** 本地操作偏好（存 KVS 'settings'，不进 UserProfile，不影响契约/B） */
export interface AppSettings {
  /** 两步确认：候选选中后再点一下才说出（防误触，默认开） */
  twoStepConfirm: boolean;
  /** 纯离线模式：不联网，候选走内置模板库、发声走本机语音（隐私/无网） */
  offlineMode: boolean;
  /** 手机镜像眼镜画面（默认关保隐私，演示时开；纯浏览器下恒显示） */
  mirrorHud: boolean;
  /** 聆听时长（秒） */
  listenSeconds: 3 | 4 | 5;
  /** 当前场景 */
  scene: SceneId;
  /** 当前对话对象（会话级，仅派生进 SceneContext.partner，不入 UserProfile） */
  partner: PartnerId;
  /** 主动模式分组（用户完全自定义，取代写死的预设） */
  activeGroups: PhraseGroup[];
  /** 场景短语包（用户可编辑，取代写死的预设） */
  scenePhrases: Record<SceneId, string[]>;
  /** 大字模式：每屏 2 条候选 + 翻页（可读性） */
  bigText: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  twoStepConfirm: true,
  offlineMode: false,
  mirrorHud: false,
  listenSeconds: 4,
  scene: 'default',
  partner: 'default',
  activeGroups: DEFAULT_ACTIVE_GROUPS,
  scenePhrases: DEFAULT_SCENE_PHRASES,
  bigText: false,
};

const SCENE_IDS: SceneId[] = ['default', 'work', 'dining', 'social'];
const PARTNER_IDS: PartnerId[] = [
  'default',
  'stranger',
  'friend',
  'family',
  'senior',
  'colleague',
  'staff',
];

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** 兼容旧 KVS：校验枚举并深度补齐主动分组和各场景短语包。 */
export function normalizeSettings(value: unknown): AppSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<AppSettings>) : {};
  const activeGroups = Array.isArray(raw.activeGroups)
    ? raw.activeGroups
        .filter((group): group is PhraseGroup => !!group && typeof group === 'object')
        .map((group, index) => ({
          id: typeof group.id === 'string' && group.id ? group.id : `migrated_${index}`,
          name: typeof group.name === 'string' ? group.name : '未命名',
          phrases: stringList(group.phrases),
        }))
    : DEFAULT_ACTIVE_GROUPS.map((group) => ({ ...group, phrases: [...group.phrases] }));
  const rawPhrases =
    raw.scenePhrases && typeof raw.scenePhrases === 'object'
      ? (raw.scenePhrases as Partial<Record<SceneId, unknown>>)
      : {};
  const scenePhrases = Object.fromEntries(
    SCENE_IDS.map((scene) => [
      scene,
      scene in rawPhrases
        ? stringList(rawPhrases[scene])
        : [...DEFAULT_SCENE_PHRASES[scene]],
    ]),
  ) as Record<SceneId, string[]>;

  return {
    twoStepConfirm:
      typeof raw.twoStepConfirm === 'boolean'
        ? raw.twoStepConfirm
        : DEFAULT_SETTINGS.twoStepConfirm,
    offlineMode:
      typeof raw.offlineMode === 'boolean' ? raw.offlineMode : DEFAULT_SETTINGS.offlineMode,
    mirrorHud: typeof raw.mirrorHud === 'boolean' ? raw.mirrorHud : DEFAULT_SETTINGS.mirrorHud,
    listenSeconds: [3, 4, 5].includes(Number(raw.listenSeconds))
      ? (Number(raw.listenSeconds) as AppSettings['listenSeconds'])
      : DEFAULT_SETTINGS.listenSeconds,
    scene: SCENE_IDS.includes(raw.scene as SceneId)
      ? (raw.scene as SceneId)
      : DEFAULT_SETTINGS.scene,
    partner: PARTNER_IDS.includes(raw.partner as PartnerId)
      ? (raw.partner as PartnerId)
      : DEFAULT_SETTINGS.partner,
    activeGroups,
    scenePhrases,
    bigText: typeof raw.bigText === 'boolean' ? raw.bigText : DEFAULT_SETTINGS.bigText,
  };
}

export type CandidateOrigin =
  | 'llm'
  | 'backend-template'
  | 'client-template'
  | 'active-phrase'
  | 'privacy-quick';

export interface DiagnosticsSnapshot {
  hubMode: 'browser' | 'bridge';
  deviceConnected: boolean | null;
  backendState: 'idle' | 'checking' | 'ready' | 'unreachable' | 'privacy';
  backendOrigin: string;
  health?: HealthResponse;
  pcmBytes?: number;
  pcmDurationMs?: number;
  asrMs?: number;
  candidatesMs?: number;
  ttsMs?: number;
  totalMs?: number;
  candidateOrigin?: CandidateOrigin;
  playback?: 'backend-audio' | 'web-speech' | 'silent' | 'cancelled';
  lastError?: string;
}

let speakPhraseCb: ((text: string) => void) | null = null;
let emergencyDismissCb: (() => void) | null = null;
let formDirty = false;
let quickExpanded = false;
let toastTimer: number | undefined;

type VisualState = UiState | 'DISCONNECTED';

const STATUS_PRESENTATION: Record<
  VisualState,
  { title: string; detail: string; action: string }
> = {
  IDLE: {
    title: '准备好了',
    detail: '轻点 R1 戒指，开始聆听',
    action: '轻点开始',
  },
  LISTENING: {
    title: '正在聆听',
    detail: '再轻点一次，可以提前结束',
    action: '再点结束',
  },
  THINKING: {
    title: '正在理解对话',
    detail: '正在为你准备四条表达',
    action: '请稍候',
  },
  CANDIDATES: {
    title: '候选已就绪',
    detail: '上下滑动选择，轻点确认',
    action: '滑动选择',
  },
  SPEAKING: {
    title: '正在替你说',
    detail: '声音结束前不会重新开麦',
    action: '播放期间锁定',
  },
  DISCONNECTED: {
    title: 'G2 连接已断开',
    detail: '保持 Even App 打开，正在等待重连',
    action: '打开 Even App',
  },
};

export function showView(name: ViewName): void {
  byId('view-menu')?.classList.toggle('active', name === 'menu');
  byId('view-config')?.classList.toggle('active', name === 'config');
  document.body.dataset.view = name;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

/** 更新首页 Hero；文字、图形和 data-state 共同表达状态，不只依赖颜色。 */
export function setStatus(text: string, state: VisualState = 'IDLE'): void {
  const presentation = STATUS_PRESENTATION[state];
  setText('status-kicker', text);
  setText('status', presentation.title);
  setText('status-detail', presentation.detail);
  setText('status-action', presentation.action);
  const hero = byId('status-hero');
  if (hero) hero.dataset.state = state;
}

/** 更新折叠设备检查卡；只展示运行状态和耗时，不展示文本、profile 或音频。 */
export function renderDiagnostics(d: DiagnosticsSnapshot): void {
  setText('diag-hub', d.hubMode === 'bridge' ? 'Even bridge' : '浏览器模式');
  setText(
    'diag-device',
    d.deviceConnected == null ? '未知' : d.deviceConnected ? '已连接' : '未连接',
  );
  const backendLabel: Record<DiagnosticsSnapshot['backendState'], string> = {
    idle: '未检查',
    checking: '检查中…',
    ready: '可用',
    unreachable: '不可达',
    privacy: '隐私快捷模式（未联网）',
  };
  setText('diag-backend', `${backendLabel[d.backendState]} · ${d.backendOrigin}`);
  setText(
    'diag-capabilities',
    d.health
      ? `ASR ${flag(d.health.asr)} · LLM ${flag(d.health.llm)} · TTS ${flag(d.health.tts)}`
      : '—',
  );
  const rate =
    d.pcmBytes != null && d.pcmDurationMs
      ? Math.round((d.pcmBytes * 1000) / d.pcmDurationMs)
      : undefined;
  setText(
    'diag-pcm',
    d.pcmBytes == null
      ? '—'
      : `${d.pcmBytes} B / ${duration(d.pcmDurationMs)}${rate ? ` · ${rate} B/s` : ''}`,
  );
  setText(
    'diag-timing',
    `ASR ${ms(d.asrMs)} · 候选 ${ms(d.candidatesMs)} · TTS ${ms(d.ttsMs)} · 总计 ${ms(d.totalMs)}`,
  );
  const originLabel: Record<CandidateOrigin, string> = {
    llm: 'LLM',
    'backend-template': 'Backend 模板',
    'client-template': '客户端模板',
    'active-phrase': '主动短语',
    'privacy-quick': '隐私快捷',
  };
  const playbackLabel: Record<NonNullable<DiagnosticsSnapshot['playback']>, string> = {
    'backend-audio': 'Backend MP3',
    'web-speech': '本机语音',
    silent: '未发声',
    cancelled: '已取消',
  };
  setText('diag-origin', d.candidateOrigin ? originLabel[d.candidateOrigin] : '—');
  setText('diag-playback', d.playback ? playbackLabel[d.playback] : '—');
  setText('diag-error', d.lastError || '无');

  if (d.hubMode === 'browser') {
    setIndicator('header-device', 'header-device-text', '浏览器预览', 'neutral');
  } else if (d.deviceConnected == null) {
    setIndicator('header-device', 'header-device-text', 'G2 检查中', 'neutral');
  } else if (d.deviceConnected) {
    setIndicator('header-device', 'header-device-text', 'G2 已连接', 'ready');
  } else {
    setIndicator('header-device', 'header-device-text', 'G2 未连接', 'error');
  }

  const backendIndicator: Record<
    DiagnosticsSnapshot['backendState'],
    { text: string; status: 'neutral' | 'ready' | 'warning' | 'error' }
  > = {
    idle: { text: '服务未检查', status: 'neutral' },
    checking: { text: '服务检查中', status: 'neutral' },
    ready: { text: '服务正常', status: 'ready' },
    unreachable: { text: '服务离线', status: 'error' },
    privacy: { text: '隐私模式', status: 'warning' },
  };
  const backend = backendIndicator[d.backendState];
  setIndicator(
    'header-backend',
    'header-backend-text',
    backend.text,
    backend.status,
  );
}

export function initUi(opts: {
  profile: UserProfile;
  settings: AppSettings;
  onboarded: boolean;
  onSave: (p: UserProfile, s: AppSettings) => void;
  onSpeakPhrase: (text: string) => void;
  onOnboarded: () => void;
  onSceneChange: (scene: SceneId) => void;
  onPartnerChange: (partner: PartnerId) => void;
  onRetryHealth: () => void;
}): void {
  speakPhraseCb = opts.onSpeakPhrase;
  fillForm(opts.profile, opts.settings);
  setActiveScene(opts.settings.scene);
  setActivePartner(opts.settings.partner);
  setFormDirty(false);

  // 场景切换 chips（仅 data-scene，与对话对象 chips 隔离）
  document.querySelectorAll<HTMLButtonElement>('.scene-chip[data-scene]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const scene = (chip.dataset.scene ?? 'default') as SceneId;
      setActiveScene(scene);
      opts.onSceneChange(scene);
    });
  });

  // 对话对象选项较多，使用紧凑下拉减少首页噪音。
  byId('partner-select')?.addEventListener('change', (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const partner = PARTNER_IDS.includes(select.value as PartnerId)
      ? (select.value as PartnerId)
      : 'default';
    setActivePartner(partner);
    opts.onPartnerChange(partner);
  });

  // 30 秒上手卡：首启显示，看过不再弹
  const onboard = byId('onboard');
  if (onboard && !opts.onboarded) {
    onboard.hidden = false;
    document.body.classList.add('modal-open');
  }
  byId('btn-onboard-ok')?.addEventListener('click', () => {
    if (onboard) onboard.hidden = true;
    document.body.classList.remove('modal-open');
    opts.onOnboarded();
  });

  // 紧急警示：点按任意处解除
  byId('emergency-overlay')?.addEventListener('click', () => {
    hideEmergency();
    emergencyDismissCb?.();
  });

  byId('btn-config')?.addEventListener('click', () => showView('config'));
  byId('btn-back')?.addEventListener('click', () => showView('menu'));
  byId('btn-health-retry')?.addEventListener('click', opts.onRetryHealth);
  byId('btn-quick-more')?.addEventListener('click', toggleQuickPhrases);

  // 主动模式分组：新增一个空分组卡
  byId('btn-add-group')?.addEventListener('click', () => {
    byId('f-active-groups')?.appendChild(buildGroupCard('', []));
    setFormDirty(true);
  });

  // 自定义表达困难标签：回车或点「添加」都可追加
  const addChallenge = () => {
    const input = byId('f-challenge-input') as HTMLInputElement | null;
    const v = (input?.value ?? '').trim();
    if (!v) return;
    addCustomChallengeChip(v, true);
    if (input) input.value = '';
    setFormDirty(true);
  };
  byId('btn-add-challenge')?.addEventListener('click', addChallenge);
  byId('f-challenge-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      addChallenge();
    }
  });

  const form = byId('config-form');
  const markDirty = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target?.id === 'f-challenge-input') return;
    target?.removeAttribute('aria-invalid');
    clearFormError();
    setFormDirty(true);
  };
  form?.addEventListener('input', markDirty);
  form?.addEventListener('change', markDirty);

  byId('btn-save')?.addEventListener('click', () => {
    clearInvalidFields();
    const validationIssue = validateCandidateFields();
    if (validationIssue) {
      showValidationIssue(validationIssue);
      return;
    }
    const nextProfile = readForm();
    const nextSettings = readSettings();
    opts.onSave(nextProfile, nextSettings);
    setFormDirty(false);
    showSaveToast();
  });
}

/** 场景 chips 选中态。 */
export function setActiveScene(scene: SceneId): void {
  document.querySelectorAll<HTMLButtonElement>('.scene-chip[data-scene]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.scene === scene);
  });
}

/** 对话对象 chips 选中态。 */
export function setActivePartner(partner: PartnerId): void {
  const select = byId('partner-select') as HTMLSelectElement | null;
  if (select) select.value = partner;
}

/** 快捷句发声板：把常用语渲染为点按即说的按钮（保存/切场景后重新渲染；可传排序器）。 */
export function renderQuickPhrases(phrases: string[], sortBy?: (a: string, b: string) => number): void {
  const card = byId('quick-card');
  const list = byId('quick-list');
  const moreList = byId('quick-more-list');
  const moreButton = byId('btn-quick-more') as HTMLButtonElement | null;
  if (!card || !list || !moreList || !moreButton) return;
  const ordered = sortBy ? [...phrases].sort(sortBy) : phrases;
  list.innerHTML = '';
  moreList.innerHTML = '';
  quickExpanded = false;
  card.hidden = false;

  if (ordered.length === 0) {
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'quick-empty';
    empty.innerHTML =
      '<strong>还没有快捷表达</strong><span>前往个性化配置添加常用语</span>';
    empty.addEventListener('click', () => showView('config'));
    list.appendChild(empty);
  } else {
    ordered.slice(0, 4).forEach((text) => list.appendChild(buildQuickButton(text)));
    ordered.slice(4).forEach((text) => moreList.appendChild(buildQuickButton(text)));
  }

  moreButton.hidden = ordered.length <= 4;
  moreList.hidden = true;
  moreButton.textContent = ordered.length > 4 ? `查看全部 ${ordered.length} 条` : '查看全部';
  moreButton.setAttribute('aria-expanded', 'false');
}

function buildQuickButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-btn';

  const icon = document.createElement('span');
  icon.className = 'quick-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M11 5 6.8 8.5H4v7h2.8L11 19V5Z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

  const label = document.createElement('span');
  label.className = 'quick-text';
  label.textContent = text;

  button.append(icon, label);
  button.addEventListener('click', () => speakPhraseCb?.(text));
  return button;
}

function toggleQuickPhrases(): void {
  const moreList = byId('quick-more-list');
  const button = byId('btn-quick-more') as HTMLButtonElement | null;
  if (!moreList || !button || button.hidden) return;
  quickExpanded = !quickExpanded;
  moreList.hidden = !quickExpanded;
  const total = 4 + moreList.childElementCount;
  button.textContent = quickExpanded ? '收起更多表达' : `查看全部 ${total} 条`;
  button.setAttribute('aria-expanded', String(quickExpanded));
}

/** 紧急呼救：手机全屏红色警示（点按解除时回调 onDismiss）。 */
export function showEmergency(text: string, onDismiss: () => void): void {
  emergencyDismissCb = onDismiss;
  const overlay = byId('emergency-overlay');
  const em = byId('em-text');
  if (em) em.textContent = text;
  if (overlay) {
    overlay.hidden = false;
    document.body.classList.add('modal-open');
  }
}

export function hideEmergency(): void {
  const overlay = byId('emergency-overlay');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('modal-open');
}

/** 所有会作为 HUD 候选出现的可编辑短语必须非空且不超过契约长度。 */
interface ValidationIssue {
  message: string;
  target: HTMLElement;
}

function validateCandidateFields(): ValidationIssue | null {
  const check = (
    label: string,
    phrases: string[],
    target: HTMLElement,
  ): ValidationIssue | null => {
    const long = phrases.find((text) => candidateTextLength(text) > CANDIDATE_MAX_LEN);
    return long
      ? {
          message: `${label}「${long}」超过 ${CANDIDATE_MAX_LEN} 字`,
          target,
        }
      : null;
  };

  const commonTarget = byId('f-phrases');
  if (!commonTarget) return null;
  const commonError = check('常用语', linesFromValue('f-phrases'), commonTarget);
  if (commonError) return commonError;

  for (const ta of Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      '#f-scene-phrases textarea[data-scene]',
    ),
  )) {
    const scene = ta.dataset.scene as SceneId;
    const error = check(`${SCENE_LABELS[scene]}场景短语`, splitLines(ta.value), ta);
    if (error) return error;
  }

  const cards = Array.from(document.querySelectorAll<HTMLElement>('#f-active-groups .group-card'));
  for (const card of cards) {
    const name = (card.querySelector<HTMLInputElement>('.grp-name')?.value ?? '').trim() || '未命名';
    const phrases = splitLines(
      card.querySelector<HTMLTextAreaElement>('.grp-phrases')?.value ?? '',
    );
    const phraseField = card.querySelector<HTMLTextAreaElement>('.grp-phrases');
    if (!phraseField) continue;
    if (phrases.length === 0) {
      return {
        message: `主动分组「${name}」至少需要一条短语`,
        target: phraseField,
      };
    }
    const error = check(`主动分组「${name}」`, phrases, phraseField);
    if (error) return error;
  }
  return null;
}

function setFormDirty(dirty: boolean): void {
  formDirty = dirty;
  const saveButton = byId('btn-save') as HTMLButtonElement | null;
  const saveState = byId('config-save-state');
  const message = byId('save-msg');

  if (saveButton) saveButton.disabled = !dirty;
  if (saveState) {
    saveState.textContent = dirty ? '未保存' : '已同步';
    saveState.classList.toggle('dirty', dirty);
  }
  if (message && !message.classList.contains('error')) {
    message.textContent = dirty ? '有尚未保存的更改' : '所有更改已保存';
  }
}

function clearFormError(): void {
  const message = byId('save-msg');
  if (!message?.classList.contains('error')) return;
  message.classList.remove('error');
  message.textContent = formDirty ? '有尚未保存的更改' : '所有更改已保存';
}

function clearInvalidFields(): void {
  document
    .querySelectorAll<HTMLElement>('#config-form [aria-invalid="true"]')
    .forEach((field) => field.removeAttribute('aria-invalid'));
  clearFormError();
}

function showValidationIssue(issue: ValidationIssue): void {
  const message = byId('save-msg');
  if (message) {
    message.textContent = issue.message;
    message.classList.add('error');
  }
  issue.target.setAttribute('aria-invalid', 'true');
  const section = issue.target.closest<HTMLDetailsElement>('details.settings-section');
  if (section) section.open = true;
  window.requestAnimationFrame(() => {
    issue.target.focus({ preventScroll: true });
    issue.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function showSaveToast(): void {
  const toast = byId('save-toast');
  if (!toast) return;
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toast.hidden = false;
  window.requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => {
      toast.hidden = true;
    }, 220);
  }, 2200);
}

// ---- 表单 ⇄ UserProfile ----

function fillForm(p: UserProfile, s: AppSettings): void {
  setValue('f-name', p.name ?? '');
  setValue('f-role', p.role ?? '');
  setValue('f-phrases', p.commonPhrases.join('\n'));
  setValue('f-interests', (p.interests ?? []).join('\n'));
  setValue('f-avoid', (p.avoidWords ?? []).join('\n'));
  setValue('f-emergency', p.emergencyText ?? '');
  setValue('f-voice', p.voice ?? '');
  const challenges = new Set(p.challenges ?? []);
  // 预设项按存档勾选
  document.querySelectorAll<HTMLInputElement>('#f-challenges input[name="f-challenge"]').forEach((cb) => {
    cb.checked = challenges.has(cb.value);
  });
  // 存档里非预设的 → 追加为自定义 chip
  for (const c of challenges) {
    if (!PRESET_CHALLENGES.includes(c)) addCustomChallengeChip(c, true);
  }
  // 主动模式分组 + 场景短语包（用户完全自定义）
  renderActiveGroupsEditor(s.activeGroups);
  fillScenePhrases(s.scenePhrases);
  const tone = document.querySelector<HTMLInputElement>(
    `input[name="f-tone"][value="${p.tone ?? 'plain'}"]`,
  );
  if (tone) tone.checked = true;
  const verbosity = document.querySelector<HTMLInputElement>(
    `input[name="f-verbosity"][value="${p.verbosity ?? 'normal'}"]`,
  );
  if (verbosity) verbosity.checked = true;
  const twostep = byId('f-twostep') as HTMLInputElement | null;
  if (twostep) twostep.checked = s.twoStepConfirm;
  const offline = byId('f-offline') as HTMLInputElement | null;
  if (offline) offline.checked = s.offlineMode;
  const mirror = byId('f-mirror') as HTMLInputElement | null;
  if (mirror) mirror.checked = s.mirrorHud;
  const listen = document.querySelector<HTMLInputElement>(
    `input[name="f-listen"][value="${s.listenSeconds}"]`,
  );
  if (listen) listen.checked = true;
  const bigtext = byId('f-bigtext') as HTMLInputElement | null;
  if (bigtext) bigtext.checked = s.bigText;
}

function readSettings(): AppSettings {
  const twostep = byId('f-twostep') as HTMLInputElement | null;
  const offline = byId('f-offline') as HTMLInputElement | null;
  const mirror = byId('f-mirror') as HTMLInputElement | null;
  const bigtext = byId('f-bigtext') as HTMLInputElement | null;
  const listenRaw = document.querySelector<HTMLInputElement>('input[name="f-listen"]:checked')?.value;
  const listenSeconds = (Number(listenRaw) || 4) as AppSettings['listenSeconds'];
  const activeScene = document.querySelector<HTMLButtonElement>('.scene-chip[data-scene].active');
  const partnerSelect = byId('partner-select') as HTMLSelectElement | null;
  return {
    twoStepConfirm: twostep?.checked ?? true,
    offlineMode: offline?.checked ?? false,
    mirrorHud: mirror?.checked ?? false,
    listenSeconds,
    scene: (activeScene?.dataset.scene ?? 'default') as SceneId,
    partner: PARTNER_IDS.includes(partnerSelect?.value as PartnerId)
      ? (partnerSelect?.value as PartnerId)
      : 'default',
    activeGroups: readActiveGroups(),
    scenePhrases: readScenePhrases(),
    bigText: bigtext?.checked ?? false,
  };
}

// ---- 主动模式分组 / 场景短语包 / 自定义困难标签 的动态编辑器 ----

/** 稳定 id（新增分组用）。 */
function gid(): string {
  return `g_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
}

/** 重建主动模式分组编辑器（清空后按 groups 重建）。 */
function renderActiveGroupsEditor(groups: PhraseGroup[]): void {
  const box = byId('f-active-groups');
  if (!box) return;
  box.innerHTML = '';
  for (const g of groups) box.appendChild(buildGroupCard(g.name, g.phrases));
}

/** 单个分组卡：分组名输入 + 删除 + 多行短语。 */
function buildGroupCard(name: string, phrases: string[]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'group-card';
  const head = document.createElement('div');
  head.className = 'group-head';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'grp-name';
  nameInput.placeholder = '分组名（如 打招呼）';
  nameInput.value = name;
  nameInput.setAttribute('aria-label', name ? `主动分组「${name}」名称` : '主动分组名称');
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'grp-del';
  del.textContent = '删除';
  del.setAttribute('aria-label', name ? `删除主动分组「${name}」` : '删除主动分组');
  del.addEventListener('click', () => {
    card.remove();
    clearFormError();
    setFormDirty(true);
  });
  head.appendChild(nameInput);
  head.appendChild(del);
  const ta = document.createElement('textarea');
  ta.className = 'grp-phrases';
  ta.placeholder = '每行一条短语';
  ta.value = phrases.join('\n');
  ta.setAttribute('aria-label', name ? `主动分组「${name}」短语` : '主动分组短语');
  nameInput.addEventListener('input', () => {
    const nextName = nameInput.value.trim();
    nameInput.setAttribute(
      'aria-label',
      nextName ? `主动分组「${nextName}」名称` : '主动分组名称',
    );
    ta.setAttribute(
      'aria-label',
      nextName ? `主动分组「${nextName}」短语` : '主动分组短语',
    );
    del.setAttribute(
      'aria-label',
      nextName ? `删除主动分组「${nextName}」` : '删除主动分组',
    );
  });
  card.appendChild(head);
  card.appendChild(ta);
  return card;
}

/** 从 DOM 读主动模式分组（丢弃名与短语都空的卡）。 */
function readActiveGroups(): PhraseGroup[] {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('#f-active-groups .group-card'));
  const groups: PhraseGroup[] = [];
  for (const card of cards) {
    const name = (card.querySelector<HTMLInputElement>('.grp-name')?.value ?? '').trim();
    const phrases = (card.querySelector<HTMLTextAreaElement>('.grp-phrases')?.value ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name && phrases.length === 0) continue;
    groups.push({ id: gid(), name: name || '未命名', phrases });
  }
  return groups;
}

/** 回填场景短语包（按 data-scene 逐个 textarea）。 */
function fillScenePhrases(map: Record<SceneId, string[]>): void {
  document
    .querySelectorAll<HTMLTextAreaElement>('#f-scene-phrases textarea[data-scene]')
    .forEach((ta) => {
      const scene = ta.dataset.scene as SceneId;
      ta.value = (map[scene] ?? []).join('\n');
    });
}

/** 从 DOM 读场景短语包。 */
function readScenePhrases(): Record<SceneId, string[]> {
  const map: Record<SceneId, string[]> = { default: [], work: [], dining: [], social: [] };
  document
    .querySelectorAll<HTMLTextAreaElement>('#f-scene-phrases textarea[data-scene]')
    .forEach((ta) => {
      const scene = ta.dataset.scene as SceneId;
      map[scene] = ta.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    });
  return map;
}

/** 追加一个自定义困难标签 chip（复用 .chips 勾选样式，name=f-challenge 便于统一读取）。 */
function addCustomChallengeChip(value: string, checked = true): void {
  const box = byId('f-challenges');
  if (!box || !value) return;
  // 已存在（预设或自定义）就只勾上，不重复
  const existing = Array.from(
    box.querySelectorAll<HTMLInputElement>('input[name="f-challenge"]'),
  ).find((cb) => cb.value === value);
  if (existing) {
    existing.checked = checked;
    return;
  }
  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.name = 'f-challenge';
  cb.value = value;
  cb.checked = checked;
  const span = document.createElement('span');
  span.textContent = value;
  label.appendChild(cb);
  label.appendChild(span);
  box.appendChild(label);
}

function readForm(): UserProfile {
  const tone = document.querySelector<HTMLInputElement>('input[name="f-tone"]:checked')
    ?.value as UserProfile['tone'];
  const verbosity = document.querySelector<HTMLInputElement>('input[name="f-verbosity"]:checked')
    ?.value as UserProfile['verbosity'];
  const challenges = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="f-challenge"]:checked'),
  ).map((cb) => cb.value);
  return {
    userId: 'demo', // 单设备本地存储，固定值即可（契约 §4）
    name: getValue('f-name').trim() || undefined,
    role: getValue('f-role').trim() || undefined,
    challenges: challenges.length ? challenges : undefined,
    interests: linesOf('f-interests'),
    avoidWords: linesOf('f-avoid'),
    verbosity: verbosity ?? 'normal',
    commonPhrases: linesFromValue('f-phrases'),
    tone: tone ?? 'plain',
    voice: getValue('f-voice').trim() || undefined,
    emergencyText: getValue('f-emergency').trim() || undefined,
  };
}

/** 读多行 textarea 为去空去重的非空行数组；空则返 undefined（不入契约）。 */
function linesOf(id: string): string[] | undefined {
  const arr = linesFromValue(id);
  return arr.length ? arr : undefined;
}

// ---- DOM 小工具 ----

function splitLines(value: string): string[] {
  return [...new Set(value.split('\n').map((text) => text.trim()).filter(Boolean))];
}

function linesFromValue(id: string): string[] {
  return splitLines(getValue(id));
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(id: string, value: string): void {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setIndicator(
  containerId: string,
  textId: string,
  text: string,
  status: 'neutral' | 'ready' | 'warning' | 'error',
): void {
  const container = byId(containerId);
  if (container) container.dataset.status = status;
  setText(textId, text);
}

function flag(value: boolean): string {
  return value ? '✓' : '✗';
}

function ms(value: number | undefined): string {
  return value == null ? '—' : `${Math.round(value)}ms`;
}

function duration(value: number | undefined): string {
  if (value == null) return '0 ms';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function getValue(id: string): string {
  return (byId(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
}

function setValue(id: string, value: string): void {
  const el = byId(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) el.value = value;
}
