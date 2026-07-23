// 无声之声 · profile 最小持久化（AGENTS.md §7 Step 4）
// Hackathon 口径：单 JSON 文件，启动时载入、每次写入落盘；不做账号系统。
// 数据文件在 backend/data/ 下，已被 .gitignore 忽略。

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserProfile } from '@vftv/shared';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'profiles.json');

const profiles = new Map<string, UserProfile>();

/** 启动时调用：从磁盘恢复（文件不存在/损坏时静默从空开始） */
export function loadProfiles(): void {
  try {
    if (!existsSync(DATA_FILE)) return;
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as UserProfile[];
    for (const p of raw) {
      if (p?.userId) profiles.set(p.userId, p);
    }
    console.log(`[store] loaded ${profiles.size} profile(s) from disk`);
  } catch (e) {
    console.warn('[store] failed to load profiles, starting empty:', e);
  }
}

export function getProfile(userId: string): UserProfile | undefined {
  return profiles.get(userId);
}

/** 保存并同步落盘（数据量极小，直接同步写，避免进程退出丢数据） */
export function saveProfile(profile: UserProfile): void {
  profiles.set(profile.userId, profile);
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify([...profiles.values()], null, 2), 'utf-8');
  } catch (e) {
    console.error('[store] failed to persist profiles:', e);
  }
}
