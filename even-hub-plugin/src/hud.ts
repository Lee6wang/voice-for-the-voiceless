// 无声之声 · HUD 渲染（眼镜端 576x288 文本容器）
// 官方 asr 模板同款单容器方案：全部界面状态压成一段文本，120ms 防抖写入
// （BLE 渲染队列慢，频繁 upgrade 会堆积）。

import {
  CreateStartUpPageContainer,
  EvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import type { Candidate } from '@vftv/shared';

const CONTAINER_ID = 1;
const CONTAINER_NAME = 'voiceless';

let bridge: EvenAppBridge | null = null;
let lastRender = '';
let pending = '';
let timer: number | null = null;

/** 启动页容器：眼镜 HUD 唯一画布 */
export async function initHud(b: EvenAppBridge): Promise<boolean> {
  bridge = b;
  const container = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: CONTAINER_ID,
    containerName: CONTAINER_NAME,
    content: '无声之声已连接',
    isEventCapture: 1, // 捕获 tap/swipe/double-tap 事件
  });
  const created = await b.createStartUpPageContainer(
    new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [container] }),
  );
  return created === 0;
}

function flush(): void {
  if (timer !== null) return;
  timer = window.setTimeout(async () => {
    timer = null;
    if (pending === lastRender || !bridge) return;
    lastRender = pending;
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content: pending,
      }),
    );
  }, 120);
}

/** 直接写一段文本到 HUD（状态提示用） */
export function hudText(text: string): void {
  pending = text;
  flush();
}

/** 渲染 4 候选 + 高亮（▶ 标记当前项；顶部一行显示对方的话） */
export function hudCandidates(heardText: string, candidates: Candidate[], highlight: number): void {
  const head = heardText ? `「${clip(heardText, 18)}」` : '';
  const lines = candidates.map((c, i) => `${i === highlight ? '▶' : '  '} ${i + 1}. ${c.text}`);
  pending = [head, ...lines].filter(Boolean).join('\n');
  flush();
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
