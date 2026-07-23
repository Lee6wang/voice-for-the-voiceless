// 无声之声 · 手机控制页（跑在官方 Even App 的 WebView 里）
// 职责：backend 地址与状态灯 /「启用声音」解锁 / profile 表单 / 调试镜像与模拟输入。
// 眼镜 HUD 才是主界面，这里只是配置+联调面板，纯 DOM 不引框架。

import type { Candidate, UserProfile } from '@vftv/shared';
import type { RawInput, UiState } from '@vftv/shared';
import { fetchHealth, fetchProfile, saveProfile } from './api';
import { audioUnlocked, unlockAudio } from './audio';
import { getBackendUrl, setBackendUrl, USER_ID } from './config';

export interface UiHandlers {
  onSimulateHeard(text: string): void;
  onSimInput(input: RawInput): void;
  onProfileChanged(profile: UserProfile): void;
}

let handlers: UiHandlers;
let profile: UserProfile = { userId: USER_ID, commonPhrases: [] };

export function currentProfile(): UserProfile {
  return profile;
}

const CSS = `
  :root { color-scheme: dark; }
  body { background:#101418; color:#e8edf2; font:15px/1.6 -apple-system,system-ui,sans-serif; }
  #app { max-width:520px; margin:0 auto; padding:14px 16px 40px; }
  h1 { font-size:19px; margin:6px 0 2px; }
  .sub { color:#8b98a5; font-size:12px; margin-bottom:12px; }
  .card { background:#1a2027; border:1px solid #2a323c; border-radius:12px; padding:12px 14px; margin-bottom:12px; }
  .card h2 { font-size:14px; margin:0 0 8px; color:#aab7c4; }
  .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
  input, textarea, select { flex:1; background:#0d1116; color:#e8edf2; border:1px solid #2a323c; border-radius:8px; padding:8px 10px; font-size:14px; box-sizing:border-box; width:100%; }
  textarea { min-height:64px; resize:vertical; }
  button { background:#2563eb; color:#fff; border:0; border-radius:8px; padding:8px 14px; font-size:14px; }
  button.ghost { background:#243040; }
  button:disabled { opacity:.5; }
  .lights { display:flex; gap:10px; flex-wrap:wrap; }
  .light { display:flex; align-items:center; gap:5px; font-size:13px; color:#aab7c4; }
  .dot { width:9px; height:9px; border-radius:50%; background:#5c6a78; }
  .dot.on { background:#22c55e; } .dot.off { background:#ef4444; }
  #mirrorState { font-weight:600; }
  .cand { padding:5px 8px; border-radius:6px; margin:2px 0; background:#0d1116; }
  .cand.hl { background:#1d4ed8; }
  .simrow { display:flex; gap:6px; flex-wrap:wrap; }
  .simrow button { flex:1; min-width:70px; background:#243040; }
  #toast { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); background:#000c; padding:8px 16px; border-radius:20px; font-size:13px; opacity:0; transition:opacity .25s; pointer-events:none; }
  #toast.show { opacity:1; }
`;

export function mountUi(h: UiHandlers): void {
  handlers = h;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <h1>无声之声</h1>
    <div class="sub">眼镜听对方说话 · HUD 出 4 个候选 · 戒指选择 · 手机替你发声</div>

    <div class="card">
      <h2>连接</h2>
      <div class="row"><input id="backendUrl" placeholder="http://<Mac IP>:8787" /><button id="saveUrl" class="ghost">保存</button></div>
      <div class="lights">
        <span class="light"><i id="d-backend" class="dot"></i>backend</span>
        <span class="light"><i id="d-llm" class="dot"></i>LLM</span>
        <span class="light"><i id="d-tts" class="dot"></i>TTS</span>
        <span class="light"><i id="d-asr" class="dot"></i>ASR</span>
        <span class="light"><i id="d-glasses" class="dot"></i>眼镜</span>
      </div>
      <div class="row"><button id="refreshHealth" class="ghost">刷新状态</button><button id="unlock">🔊 启用声音</button></div>
    </div>

    <div class="card">
      <h2>实时状态</h2>
      <div id="mirrorState">IDLE</div>
      <div id="mirrorDetail" class="sub">等待开始</div>
      <div id="mirrorHeard" class="sub"></div>
      <div id="mirrorCands"></div>
    </div>

    <div class="card">
      <h2>我的表达（profile）</h2>
      <div class="row"><input id="pName" placeholder="名字（候选自我介绍用）" /></div>
      <div class="row"><select id="pTone">
        <option value="gentle">温和</option><option value="plain">平实</option><option value="humor">幽默</option>
      </select></div>
      <div class="row"><textarea id="pPhrases" placeholder="常用语，一行一条"></textarea></div>
      <div class="row"><input id="pEmergency" placeholder="紧急呼救语（镜腿双击播报）" /></div>
      <div class="row"><select id="pVoice">
        <option value="zh-CN-XiaoxiaoNeural">晓晓（女·默认）</option>
        <option value="zh-CN-YunxiNeural">云希（男）</option>
        <option value="zh-CN-YunyangNeural">云扬（男播音）</option>
        <option value="zh-CN-XiaoyiNeural">晓伊（女柔）</option>
      </select></div>
      <div class="row"><button id="saveProfile">保存到 backend</button></div>
    </div>

    <div class="card">
      <h2>调试（无眼镜时用）</h2>
      <div class="row"><input id="simText" value="周末要不要一起去爬山？" /><button id="simHeard" class="ghost">模拟对方说话</button></div>
      <div class="simrow">
        <button data-sim="tap">按一下</button>
        <button data-sim="swipe_up">上滑</button>
        <button data-sim="swipe_down">下滑</button>
        <button data-sim="double_tap">双击</button>
        <button data-sim="temple_double_tap">镜腿双击</button>
      </div>
    </div>

    <div id="toast"></div>
  `;

  (document.getElementById('backendUrl') as HTMLInputElement).value = getBackendUrl();
  bind('saveUrl', () => {
    const url = (document.getElementById('backendUrl') as HTMLInputElement).value;
    setBackendUrl(url);
    toast('已保存 backend 地址');
    void refreshHealth();
  });
  bind('refreshHealth', () => void refreshHealth());
  bind('unlock', async () => {
    const ok = await unlockAudio();
    toast(ok ? '声音已启用 ✓' : '解锁失败，请再点一次');
  });
  bind('saveProfile', async () => {
    profile = readForm();
    handlers.onProfileChanged(profile);
    const ok = await saveProfile(profile);
    toast(ok ? '已保存（backend 会预录关键句）' : 'backend 不可达，已缓存到本机');
  });
  bind('simHeard', () => {
    const text = (document.getElementById('simText') as HTMLInputElement).value.trim();
    if (text) handlers.onSimulateHeard(text);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-sim]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onSimInput(btn.dataset.sim as RawInput));
  });

  void loadProfileIntoForm();
  void refreshHealth();
}

function bind(id: string, fn: () => void): void {
  document.getElementById(id)!.addEventListener('click', fn);
}

function readForm(): UserProfile {
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
  return {
    userId: USER_ID,
    name: val('pName') || undefined,
    tone: ((document.getElementById('pTone') as HTMLSelectElement).value || undefined) as UserProfile['tone'],
    commonPhrases: (document.getElementById('pPhrases') as HTMLTextAreaElement).value
      .split('\n').map((s) => s.trim()).filter(Boolean),
    emergencyText: val('pEmergency') || undefined,
    voice: (document.getElementById('pVoice') as HTMLSelectElement).value,
  };
}

async function loadProfileIntoForm(): Promise<void> {
  profile = await fetchProfile();
  (document.getElementById('pName') as HTMLInputElement).value = profile.name ?? '';
  (document.getElementById('pTone') as HTMLSelectElement).value = profile.tone ?? 'gentle';
  (document.getElementById('pPhrases') as HTMLTextAreaElement).value = (profile.commonPhrases ?? []).join('\n');
  (document.getElementById('pEmergency') as HTMLInputElement).value = profile.emergencyText ?? '';
  if (profile.voice) (document.getElementById('pVoice') as HTMLSelectElement).value = profile.voice;
  handlers.onProfileChanged(profile);
}

export async function refreshHealth(): Promise<void> {
  const health = await fetchHealth();
  setDot('d-backend', !!health?.ok);
  setDot('d-llm', !!health?.llm);
  setDot('d-tts', !!health?.tts);
  setDot('d-asr', !!health?.asr);
}

export function setGlassesConnected(on: boolean): void {
  setDot('d-glasses', on);
}

function setDot(id: string, on: boolean): void {
  const el = document.getElementById(id);
  if (el) el.className = `dot ${on ? 'on' : 'off'}`;
}

/** session 的手机镜像：状态 + 候选列表同步显示（演示时观众看手机屏即可懂） */
export function renderMirror(
  state: UiState,
  detail: string,
  set?: { heard: string; candidates: Candidate[]; highlight: number },
): void {
  document.getElementById('mirrorState')!.textContent = state;
  document.getElementById('mirrorDetail')!.textContent =
    audioUnlocked() ? detail : `${detail}（⚠️ 未启用声音）`;
  document.getElementById('mirrorHeard')!.textContent = set?.heard ? `对方：「${set.heard}」` : '';
  const box = document.getElementById('mirrorCands')!;
  box.innerHTML = (set?.candidates ?? [])
    .map((c, i) => `<div class="cand${i === set!.highlight ? ' hl' : ''}">${i + 1}. ${esc(c.text)}</div>`)
    .join('');
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]!);
}

let toastTimer: number | null = null;
function toast(msg: string): void {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}
