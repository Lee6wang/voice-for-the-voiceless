import type { PlaybackResult } from './playback';

export interface FlowToken {
  id: number;
  signal: AbortSignal;
}

/**
 * 单一流程令牌控制器。
 * 每次 begin/cancel 都会使旧令牌失效，并通过 onCancel 统一停止采音和播音。
 */
export class FlowTokenController {
  private currentId = 0;
  private controller: AbortController | null = null;

  constructor(private readonly onCancel: () => void) {}

  begin(): FlowToken {
    this.cancel();
    this.controller = new AbortController();
    return { id: this.currentId, signal: this.controller.signal };
  }

  cancel(): void {
    this.currentId++;
    this.controller?.abort();
    this.controller = null;
    this.onCancel();
  }

  isActive(flow: FlowToken): boolean {
    return flow.id === this.currentId && !flow.signal.aborted;
  }

  finish(flow: FlowToken): void {
    if (flow.id === this.currentId) this.controller = null;
  }
}

/**
 * 紧急语严格顺序播放两遍；取消后不启动下一遍。
 * failed 仍允许尝试第二遍，给临时播放器故障一次恢复机会。
 */
export async function playEmergencyTwice(
  play: (pass: 0 | 1) => Promise<PlaybackResult>,
  isActive: () => boolean,
): Promise<PlaybackResult> {
  let allCompleted = true;
  for (const pass of [0, 1] as const) {
    if (!isActive()) return 'cancelled';
    const result = await play(pass);
    if (result === 'cancelled' || !isActive()) return 'cancelled';
    if (result !== 'completed') allCompleted = false;
  }
  return allCompleted ? 'completed' : 'failed';
}
