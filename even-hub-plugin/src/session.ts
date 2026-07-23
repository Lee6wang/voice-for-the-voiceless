// 无声之声 · 会话状态机（契约 §2）
// IDLE → LISTENING → THINKING → CANDIDATES → SPEAKING → IDLE
// 纯编排逻辑：硬件桥（麦克风开关）与手机页镜像都用回调注入，方便模拟器/浏览器调试。

import type { Candidate, UserProfile } from '@vftv/shared';
import type { RawInput, UiState } from '@vftv/shared';
import { fetchAsr, fetchCandidates, fetchTts } from './api';
import { PcmRecorder, playBase64Mp3, speakFallback } from './audio';
import { hudCandidates, hudText } from './hud';

/** push-to-listen 最长采音时长（超时自动定稿），契约 §2 */
const MAX_LISTEN_MS = 5000;
/** 采音过短视为误触（<0.4s 丢弃） */
const MIN_LISTEN_SEC = 0.4;

export interface SessionHooks {
  /** 开/关眼镜麦克风（bridge.audioControl；无桥环境传 no-op） */
  setMic(on: boolean): Promise<void> | void;
  /** 手机控制页镜像（状态 + 说明文字 + 当前候选），可选 */
  onMirror?(state: UiState, detail: string, set?: { heard: string; candidates: Candidate[]; highlight: number }): void;
}

export class Session {
  state: UiState = 'IDLE';
  private recorder = new PcmRecorder();
  private listenTimer: number | null = null;
  private turnSeq = 0;
  private turnId = '';
  private heardText = '';
  private candidates: Candidate[] = [];
  private highlight = 0;
  private shownTexts: string[] = []; // 换一批时的 exclude 累积

  constructor(
    private hooks: SessionHooks,
    private getProfile: () => UserProfile,
  ) {}

  /** G2 麦克风 PCM 分片入口（main.ts 的 audioEvent 直接转发进来） */
  pushPcm(chunk: Uint8Array): void {
    this.recorder.push(chunk);
  }

  /** R1 / 镜腿输入事件入口（语义随状态而变，契约 §2） */
  async handleInput(input: RawInput): Promise<void> {
    if (input === 'temple_double_tap') return this.emergency();
    switch (this.state) {
      case 'IDLE':
        if (input === 'tap') return this.startListening();
        break;
      case 'LISTENING':
        if (input === 'tap') return this.finishListening(); // 再按一下提前定稿
        break;
      case 'CANDIDATES':
        if (input === 'swipe_up') return this.moveHighlight(-1);
        if (input === 'swipe_down') return this.moveHighlight(1);
        if (input === 'tap') return this.confirm();
        if (input === 'double_tap') return this.refreshCandidates();
        break;
      // THINKING / SPEAKING 期间忽略输入，防连点
    }
  }

  /** 手机控制页调试入口：跳过采音/ASR，直接用一句文字走候选链路 */
  async simulateHeard(text: string): Promise<void> {
    if (this.state === 'THINKING' || this.state === 'SPEAKING') return;
    this.newTurn(text);
    await this.toCandidates();
  }

  // ---- 状态迁移 ----

  private async startListening(): Promise<void> {
    this.setState('LISTENING', '聆听中…（再按一下结束）');
    hudText('● 聆听中…');
    this.recorder.start();
    await this.hooks.setMic(true);
    this.listenTimer = window.setTimeout(() => void this.finishListening(), MAX_LISTEN_MS);
  }

  private async finishListening(): Promise<void> {
    if (this.listenTimer !== null) {
      clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
    await this.hooks.setMic(false);
    const seconds = this.recorder.seconds;
    const audioB64 = this.recorder.stop();
    if (!audioB64 || seconds < MIN_LISTEN_SEC) {
      this.setState('IDLE', '没听到声音，按一下重试');
      hudText('没听到声音\n按一下戒指重试');
      return;
    }
    this.setState('THINKING', '识别中…');
    hudText('… 识别中');
    let text = '';
    try {
      text = (await fetchAsr(audioB64)).trim();
    } catch {
      // ASR 失败走空文本分支
    }
    if (!text) {
      this.setState('IDLE', '没听清，按一下重试');
      hudText('没听清，请对方再说一遍\n按一下戒指重试');
      return;
    }
    this.newTurn(text);
    await this.toCandidates();
  }

  private newTurn(heardText: string): void {
    this.turnSeq += 1;
    this.turnId = `t${Date.now()}-${this.turnSeq}`;
    this.heardText = heardText;
    this.shownTexts = [];
  }

  private async toCandidates(exclude: string[] = []): Promise<void> {
    this.setState('THINKING', '生成候选…');
    hudText(`「${this.heardText}」\n… 正在想怎么回`);
    const { candidates, offline } = await fetchCandidates(
      this.turnId,
      this.heardText,
      this.getProfile(),
      exclude,
    );
    this.candidates = candidates;
    this.highlight = 0;
    this.shownTexts.push(...candidates.map((c) => c.text));
    this.setState('CANDIDATES', offline ? '候选（离线模板）' : '候选就绪', this.mirrorSet());
    hudCandidates(this.heardText, this.candidates, this.highlight);
  }

  private moveHighlight(delta: number): void {
    const n = this.candidates.length;
    if (n === 0) return;
    this.highlight = (this.highlight + delta + n) % n;
    this.setState('CANDIDATES', '候选', this.mirrorSet());
    hudCandidates(this.heardText, this.candidates, this.highlight);
  }

  private async refreshCandidates(): Promise<void> {
    await this.toCandidates([...this.shownTexts]);
  }

  private async confirm(): Promise<void> {
    const chosen = this.candidates[this.highlight];
    if (!chosen) return;
    await this.speak(chosen.text);
  }

  /** 镜腿双击：任意状态直接朗读紧急呼救语（契约 §2） */
  private async emergency(): Promise<void> {
    if (this.listenTimer !== null) {
      clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
    this.recorder.stop();
    await this.hooks.setMic(false);
    const text = this.getProfile().emergencyText?.trim() || '请帮帮我，我需要帮助';
    await this.speak(text, true);
  }

  /** 朗读：/tts MP3 → Web Speech → HUD 纯文字，三级降级（契约 §5） */
  private async speak(text: string, isEmergency = false): Promise<void> {
    this.setState('SPEAKING', `播放：${text}`);
    hudText(`🔊 ${text}`);
    try {
      const resp = await fetchTts(text, this.getProfile().voice);
      await playBase64Mp3(resp.audio, resp.mime);
    } catch {
      if (!speakFallback(text)) {
        // 最后一级：手机没声也让眼镜/手机屏保留大字，撑 3 秒
        hudText(`（请看手机屏幕）\n${text}`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        await new Promise((r) => setTimeout(r, Math.max(1500, text.length * 250)));
      }
    }
    if (isEmergency) {
      this.setState('IDLE', '紧急呼救已播报');
      hudText(`已播报紧急呼救\n${text}`);
    } else {
      this.setState('IDLE', '已发声，按一下开始下一轮');
      hudText('✓ 已发声\n按一下戒指听下一句');
    }
  }

  private mirrorSet() {
    return { heard: this.heardText, candidates: this.candidates, highlight: this.highlight };
  }

  private setState(state: UiState, detail: string, set?: ReturnType<Session['mirrorSet']>): void {
    this.state = state;
    this.hooks.onMirror?.(state, detail, set);
  }
}
