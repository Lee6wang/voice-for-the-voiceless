// 无声之声 · 场景上下文采集（三层，可靠性递减）：
// ① 时间：手机本地时钟，永远可得；
// ② 场景手选：控制页选定，存 localStorage（演示最稳，室内 GPS 不准时用它）；
// ③ GPS 自动：navigator.geolocation 拿经纬度传给 backend 反查 POI（尽力而为）。

import type { SceneContext } from '@vftv/shared';

const SCENE_KEY = 'vftv.scene'; // 'auto' = GPS 自动 / '' = 关闭 / 其他 = 手选场景标签

/** 手选场景可选项（控制页下拉；与 backend OSM 映射的常用标签一致） */
export const SCENE_OPTIONS = ['餐厅', '咖啡馆', '医院', '学校', '超市', '车站', '公司', '家里'];

export function getSceneSetting(): string {
  return localStorage.getItem(SCENE_KEY) ?? 'auto';
}

export function setSceneSetting(value: string): void {
  localStorage.setItem(SCENE_KEY, value);
}

/** 时段标签：饭点单独标出（对候选生成最有用），其余粗分 */
function timeOfDayLabel(h: number, m: number): string {
  const t = h + m / 60;
  if (t >= 6.5 && t < 9) return '早餐时段';
  if (t >= 11 && t < 13.5) return '午餐时段';
  if (t >= 17 && t < 20) return '晚餐时段';
  if (t >= 9 && t < 11) return '上午';
  if (t >= 13.5 && t < 17) return '下午';
  if (t >= 20 && t < 23) return '晚上';
  return '深夜';
}

// GPS 结果缓存 2 分钟：候选请求在对话中很频繁，别每轮都等定位
let cachedPos: { lat: number; lon: number; at: number } | null = null;

function getPosition(timeoutMs = 3000): Promise<{ lat: number; lon: number } | null> {
  if (cachedPos && Date.now() - cachedPos.at < 120_000) {
    return Promise.resolve(cachedPos);
  }
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cachedPos), timeoutMs); // 超时用旧值兜底
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        cachedPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() };
        resolve(cachedPos);
      },
      () => {
        clearTimeout(timer);
        resolve(cachedPos); // 拒绝授权/失败：有旧值用旧值，否则 null
      },
      { maximumAge: 120_000, timeout: timeoutMs },
    );
  });
}

/** 组装本轮的场景上下文（时间必有；场景按设置分流） */
export async function buildSceneContext(): Promise<SceneContext> {
  const now = new Date();
  const ctx: SceneContext = {
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    timeOfDay: timeOfDayLabel(now.getHours(), now.getMinutes()),
  };
  const setting = getSceneSetting();
  if (setting === 'auto') {
    const pos = await getPosition();
    if (pos) {
      ctx.lat = pos.lat;
      ctx.lon = pos.lon; // scene 留给 backend 反查
    }
  } else if (setting) {
    ctx.scene = setting; // 手选：最可靠，直接带标签
  }
  return ctx;
}
