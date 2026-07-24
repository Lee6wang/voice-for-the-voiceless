// 无声之声 · companion UI（手机端菜单页/配置页）
// 官方 asr 模板范式：手机屏是插件的一等界面——状态 chip、眼镜 HUD 镜像、个性化配置表单。
// 本模块只管 DOM 视图与表单序列化；持久化(KVS)与内存 profile 由 main.ts 的 onSave 回调负责。

import type { UserProfile } from '@vftv/shared';

type ViewName = 'menu' | 'config';

/** 场景预设 id（影响候选生成与快捷句的短语包） */
export type SceneId = 'default' | 'work' | 'dining' | 'social';

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  twoStepConfirm: true,
  offlineMode: false,
  mirrorHud: false,
  listenSeconds: 4,
  scene: 'default',
};

let speakPhraseCb: ((text: string) => void) | null = null;
let emergencyDismissCb: (() => void) | null = null;

export function showView(name: ViewName): void {
  byId('view-menu')?.classList.toggle('active', name === 'menu');
  byId('view-config')?.classList.toggle('active', name === 'config');
}

/** 更新菜单页状态 chip（跟随状态机：待机/聆听中/…） */
export function setStatus(text: string): void {
  const el = byId('status');
  if (el) el.textContent = text;
}

export function initUi(opts: {
  profile: UserProfile;
  settings: AppSettings;
  onboarded: boolean;
  onSave: (p: UserProfile, s: AppSettings) => void;
  onSpeakPhrase: (text: string) => void;
  onOnboarded: () => void;
  onSceneChange: (scene: SceneId) => void;
}): void {
  speakPhraseCb = opts.onSpeakPhrase;
  fillForm(opts.profile, opts.settings);
  setActiveScene(opts.settings.scene);

  // 场景切换 chips
  document.querySelectorAll<HTMLButtonElement>('.scene-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const scene = (chip.dataset.scene ?? 'default') as SceneId;
      setActiveScene(scene);
      opts.onSceneChange(scene);
    });
  });

  // 30 秒上手卡：首启显示，看过不再弹
  const onboard = byId('onboard');
  if (onboard && !opts.onboarded) onboard.hidden = false;
  byId('btn-onboard-ok')?.addEventListener('click', () => {
    if (onboard) onboard.hidden = true;
    opts.onOnboarded();
  });

  // 紧急警示：点按任意处解除
  byId('emergency-overlay')?.addEventListener('click', () => {
    hideEmergency();
    emergencyDismissCb?.();
  });

  byId('btn-config')?.addEventListener('click', () => showView('config'));
  byId('btn-back')?.addEventListener('click', () => showView('menu'));
  byId('btn-save')?.addEventListener('click', () => {
    opts.onSave(readForm(), readSettings());
    const msg = byId('save-msg');
    if (msg) {
      msg.textContent = '已保存 ✓ 立即生效';
      setTimeout(() => {
        if (msg.textContent?.startsWith('已保存')) msg.textContent = '';
      }, 2500);
    }
  });
}

/** 场景 chips 选中态。 */
export function setActiveScene(scene: SceneId): void {
  document.querySelectorAll<HTMLButtonElement>('.scene-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.scene === scene);
  });
}

/** 快捷句发声板：把常用语渲染为点按即说的按钮（保存/切场景后重新渲染）。 */
export function renderQuickPhrases(phrases: string[]): void {
  const card = byId('quick-card');
  const list = byId('quick-list');
  if (!card || !list) return;
  list.innerHTML = '';
  card.hidden = phrases.length === 0;
  for (const text of phrases) {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = `🔊 ${text}`;
    btn.addEventListener('click', () => speakPhraseCb?.(text));
    list.appendChild(btn);
  }
}

/** 紧急呼救：手机全屏红色警示（点按解除时回调 onDismiss）。 */
export function showEmergency(text: string, onDismiss: () => void): void {
  emergencyDismissCb = onDismiss;
  const overlay = byId('emergency-overlay');
  const em = byId('em-text');
  if (em) em.textContent = text;
  if (overlay) overlay.hidden = false;
}

export function hideEmergency(): void {
  const overlay = byId('emergency-overlay');
  if (overlay) overlay.hidden = true;
}

// ---- 表单 ⇄ UserProfile ----

function fillForm(p: UserProfile, s: AppSettings): void {
  setValue('f-name', p.name ?? '');
  setValue('f-phrases', p.commonPhrases.join('\n'));
  setValue('f-emergency', p.emergencyText ?? '');
  setValue('f-voice', p.voice ?? '');
  const tone = document.querySelector<HTMLInputElement>(
    `input[name="f-tone"][value="${p.tone ?? 'plain'}"]`,
  );
  if (tone) tone.checked = true;
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
}

function readSettings(): AppSettings {
  const twostep = byId('f-twostep') as HTMLInputElement | null;
  const offline = byId('f-offline') as HTMLInputElement | null;
  const mirror = byId('f-mirror') as HTMLInputElement | null;
  const listenRaw = document.querySelector<HTMLInputElement>('input[name="f-listen"]:checked')?.value;
  const listenSeconds = (Number(listenRaw) || 4) as AppSettings['listenSeconds'];
  const activeChip = document.querySelector<HTMLButtonElement>('.scene-chip.active');
  return {
    twoStepConfirm: twostep?.checked ?? true,
    offlineMode: offline?.checked ?? false,
    mirrorHud: mirror?.checked ?? false,
    listenSeconds,
    scene: (activeChip?.dataset.scene ?? 'default') as SceneId,
  };
}

function readForm(): UserProfile {
  const phrases = getValue('f-phrases')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const tone = document.querySelector<HTMLInputElement>('input[name="f-tone"]:checked')
    ?.value as UserProfile['tone'];
  return {
    userId: 'demo', // 单设备本地存储，固定值即可（契约 §4）
    name: getValue('f-name').trim() || undefined,
    commonPhrases: phrases,
    tone: tone ?? 'plain',
    voice: getValue('f-voice').trim() || undefined,
    emergencyText: getValue('f-emergency').trim() || undefined,
  };
}

// ---- DOM 小工具 ----

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function getValue(id: string): string {
  return (byId(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
}

function setValue(id: string, value: string): void {
  const el = byId(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) el.value = value;
}
