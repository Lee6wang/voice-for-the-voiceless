// 无声之声 · 运行配置
// backend 地址：手机控制页可改，存 localStorage；默认取插件页面所在主机
// （开发时插件经 http://<Mac IP>:5173 加载，backend 就在同一台 Mac 的 8787）。

const URL_KEY = 'vftv.backendUrl';
const PROFILE_KEY = 'vftv.profileCache';

export const USER_ID = 'demo'; // 比赛口径：固定 demo，不做账号系统

export function getBackendUrl(): string {
  const saved = localStorage.getItem(URL_KEY)?.trim();
  if (saved) return saved.replace(/\/+$/, '');
  const host = location.hostname || 'localhost';
  return `http://${host}:8787`;
}

export function setBackendUrl(url: string): void {
  localStorage.setItem(URL_KEY, url.trim().replace(/\/+$/, ''));
}

// profile 本地缓存：backend 断开时仍能读紧急表达/音色（断网兜底的一部分）
export function cacheProfile(json: string): void {
  localStorage.setItem(PROFILE_KEY, json);
}

export function readCachedProfile(): string | null {
  return localStorage.getItem(PROFILE_KEY);
}
