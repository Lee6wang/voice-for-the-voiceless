// 无声之声 · 插件主入口
// 职责：等桥 → 建 HUD → 事件路由（sysEvent 输入 / audioEvent PCM）→ 会话状态机。
// 无桥环境（纯浏览器 npm run dev）自动降级：控制页 + 模拟按钮照常可用，方便无眼镜联调。

import { OsEventTypeList, EventSourceType, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { RawInput } from '@vftv/shared';
import { initHud, hudText } from './hud';
import { Session } from './session';
import { currentProfile, mountUi, renderMirror, setGlassesConnected } from './ui';

let bridge: EvenAppBridge | null = null;

const session = new Session(
  {
    setMic: async (on) => {
      await bridge?.audioControl(on);
    },
    onMirror: renderMirror,
  },
  currentProfile,
);

mountUi({
  onSimulateHeard: (text) => void session.simulateHeard(text),
  onSimInput: (input) => void session.handleInput(input),
  onProfileChanged: () => {
    /* currentProfile() 每次实时读，无需额外处理 */
  },
});

/**
 * sysEvent → RawInput 映射（契约 §2）：
 * - CLICK(0，PB 省略零值 → 用 ?? 0 兜底) = tap
 * - SCROLL_TOP/BOTTOM = swipe_up / swipe_down
 * - DOUBLE_CLICK：戒指 = double_tap（换一批）；镜腿 = temple_double_tap（紧急呼救）
 */
function mapInput(eventType: OsEventTypeList, source?: EventSourceType): RawInput | null {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      return 'tap';
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'swipe_up';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'swipe_down';
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L ||
        source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R
        ? 'temple_double_tap'
        : 'double_tap';
    default:
      return null;
  }
}

async function connectBridge(): Promise<void> {
  // 桥 8s 内没就绪 = 不在 Even App 里（浏览器直开），走无眼镜调试模式
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
  const found = await Promise.race([waitForEvenAppBridge(), timeout]);
  if (!found) {
    setGlassesConnected(false);
    console.info('[vftv] no Even bridge — browser debug mode (use 调试 card)');
    return;
  }
  bridge = found;
  const ok = await initHud(bridge);
  setGlassesConnected(ok);
  if (ok) hudText('无声之声已就绪\n按一下戒指开始聆听');

  bridge.onEvenHubEvent((event) => {
    // PCM 分片（LISTENING 期间 recorder 才累积，其余状态丢弃防回声）
    const pcm = event.audioEvent?.audioPcm;
    if (pcm) session.pushPcm(pcm);

    const sys = event.sysEvent;
    const sysType = sys?.eventType ?? (event.sysEvent ? OsEventTypeList.CLICK_EVENT : null);
    if (sysType === null || sysType === undefined) return;

    // 系统退出：还麦克风，官方模板同款处理
    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      void bridge?.audioControl(false);
      return;
    }
    if (
      sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT ||
      sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT ||
      sysType === OsEventTypeList.IMU_DATA_REPORT
    ) {
      return; // 生命周期/IMU 与交互无关
    }

    const input = mapInput(sysType, sys?.eventSource);
    if (input) void session.handleInput(input);
  });

  window.addEventListener('beforeunload', () => void bridge?.audioControl(false));
}

void connectBridge();
