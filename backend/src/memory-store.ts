// 无声之声 · 受约束 Agent 的持久化记忆
// 只保存文本轮次和候选生命周期事件；原始音频永不进入本数据库。

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Sqlite from 'better-sqlite3';
import type {
  CandidateFeedbackRequest,
  CandidatesRequest,
  CandidatesResponse,
  ConversationTurn,
  InteractionMode,
  SceneContext,
} from '@vftv/shared';

const DEFAULT_DB_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'memory.sqlite',
);
const DEFAULT_SESSION_TTL_HOURS = 24;

export interface RecalledBehaviorMemory {
  text: string;
  playCount: number;
  score: number;
}

export interface CandidateTurnRecord {
  request: CandidatesRequest;
  response: CandidatesResponse;
}

export interface MemoryRepository {
  recordTurn(record: CandidateTurnRecord): void;
  recordFeedback(feedback: CandidateFeedbackRequest): { duplicate: boolean };
  recentTurns(userId: string, sessionId: string, limit?: number): ConversationTurn[];
  recallBehavior(
    userId: string,
    context?: SceneContext,
    mode?: InteractionMode,
    limit?: number,
  ): RecalledBehaviorMemory[];
  close(): void;
}

interface RecentTurnRow {
  heard: string;
  said: string;
}

interface BehaviorRow {
  text: string;
  play_count: number;
  score: number;
}

interface TableInfoRow {
  name: string;
  pk: number;
}

export class SqliteMemoryRepository implements MemoryRepository {
  private readonly db: Sqlite.Database;
  private readonly sessionTtlMs: number;

  constructor(
    filename = DEFAULT_DB_FILE,
    sessionTtlHours = Number(
      process.env.MEMORY_SESSION_TTL_HOURS ?? DEFAULT_SESSION_TTL_HOURS,
    ),
  ) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    const safeTtlHours =
      Number.isFinite(sessionTtlHours) && sessionTtlHours > 0
        ? sessionTtlHours
        : DEFAULT_SESSION_TTL_HOURS;
    this.sessionTtlMs = safeTtlHours * 60 * 60 * 1000;
    this.db = new Sqlite(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrateLegacyTurnsPrimaryKey();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        heard_text TEXT NOT NULL,
        mode TEXT NOT NULL,
        context_json TEXT NOT NULL,
        candidates_json TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, session_id, turn_id)
      );

      CREATE INDEX IF NOT EXISTS idx_turns_session_created
        ON turns (user_id, session_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS feedback_events (
        event_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        text TEXT NOT NULL,
        event TEXT NOT NULL,
        scene TEXT NOT NULL,
        partner TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_user_event
        ON feedback_events (user_id, event, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_feedback_session_turn
        ON feedback_events (user_id, session_id, turn_id);
    `);
    this.db.pragma('user_version = 1');
    this.purgeExpiredTurns();
  }

  recordTurn({ request, response }: CandidateTurnRecord): void {
    const sessionId = request.sessionId?.trim();
    if (!sessionId) return;
    this.purgeExpiredTurns();
    this.db.prepare(`
      INSERT INTO turns (
        user_id, session_id, turn_id, heard_text, mode,
        context_json, candidates_json, source, created_at
      ) VALUES (
        @userId, @sessionId, @turnId, @heardText, @mode,
        @contextJson, @candidatesJson, @source, @createdAt
      )
      ON CONFLICT(user_id, session_id, turn_id) DO UPDATE SET
        heard_text = excluded.heard_text,
        mode = excluded.mode,
        context_json = excluded.context_json,
        candidates_json = excluded.candidates_json,
        source = excluded.source
    `).run({
      userId: request.profile.userId,
      sessionId,
      turnId: request.turnId,
      heardText: request.heardText,
      mode: request.mode ?? 'reply',
      contextJson: JSON.stringify(request.context ?? {}),
      candidatesJson: JSON.stringify(response.candidates),
      source: response.source ?? 'llm',
      createdAt: new Date().toISOString(),
    });
  }

  recordFeedback(feedback: CandidateFeedbackRequest): { duplicate: boolean } {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO feedback_events (
        event_id, user_id, session_id, turn_id, candidate_id,
        text, event, scene, partner, mode, created_at
      ) VALUES (
        @eventId, @userId, @sessionId, @turnId, @candidateId,
        @text, @event, @scene, @partner, @mode, @createdAt
      )
    `).run({
      eventId: feedback.eventId,
      userId: feedback.userId,
      sessionId: feedback.sessionId,
      turnId: feedback.turnId,
      candidateId: feedback.candidateId,
      text: feedback.text,
      event: feedback.event,
      scene: feedback.context?.scene ?? '',
      partner: feedback.context?.partner ?? '',
      mode: feedback.mode ?? 'reply',
      createdAt: new Date().toISOString(),
    });
    return { duplicate: result.changes === 0 };
  }

  recentTurns(userId: string, sessionId: string, limit = 3): ConversationTurn[] {
    const rows = this.db.prepare(`
      SELECT t.heard_text AS heard, f.text AS said
      FROM feedback_events f
      JOIN turns t
        ON t.user_id = f.user_id
       AND t.session_id = f.session_id
       AND t.turn_id = f.turn_id
      WHERE f.user_id = ?
        AND f.session_id = ?
        AND f.event = 'played'
      ORDER BY f.created_at DESC, f.rowid DESC
      LIMIT ?
    `).all(userId, sessionId, limit) as RecentTurnRow[];
    return rows.reverse();
  }

  recallBehavior(
    userId: string,
    context?: SceneContext,
    mode: InteractionMode = 'reply',
    limit = 6,
  ): RecalledBehaviorMemory[] {
    const rows = this.db.prepare(`
      SELECT
        text,
        COUNT(*) AS play_count,
        SUM(
          1
          + CASE WHEN @scene <> '' AND scene = @scene THEN 3 ELSE 0 END
          + CASE WHEN @partner <> '' AND partner = @partner THEN 2 ELSE 0 END
          + CASE WHEN mode = @mode THEN 1 ELSE 0 END
        ) AS score
      FROM feedback_events
      WHERE user_id = @userId
        AND event = 'played'
        AND mode = @mode
        AND (@scene = '' OR scene = '' OR scene = @scene)
        AND (@partner = '' OR partner = '' OR partner = @partner)
      GROUP BY text
      ORDER BY score DESC, play_count DESC, MAX(created_at) DESC, MAX(rowid) DESC
      LIMIT @limit
    `).all({
      userId,
      scene: context?.scene ?? '',
      partner: context?.partner ?? '',
      mode,
      limit,
    }) as BehaviorRow[];
    return rows.map((row) => ({
      text: row.text,
      playCount: row.play_count,
      score: row.score,
    }));
  }

  close(): void {
    this.db.close();
  }

  private purgeExpiredTurns(): void {
    const cutoff = new Date(Date.now() - this.sessionTtlMs).toISOString();
    this.db.prepare('DELETE FROM turns WHERE created_at < ?').run(cutoff);
  }

  private migrateLegacyTurnsPrimaryKey(): void {
    const exists = this.db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = 'turns'
    `).get();
    if (!exists) return;

    const primaryKey = (this.db.pragma('table_info(turns)') as TableInfoRow[])
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    if (primaryKey.join(',') === 'user_id,session_id,turn_id') return;
    if (primaryKey.join(',') !== 'user_id,turn_id') {
      throw new Error(`unsupported turns primary key: ${primaryKey.join(',') || 'none'}`);
    }

    this.db.transaction(() => {
      this.db.exec(`
        ALTER TABLE turns RENAME TO turns_legacy_v0;

        CREATE TABLE turns (
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          heard_text TEXT NOT NULL,
          mode TEXT NOT NULL,
          context_json TEXT NOT NULL,
          candidates_json TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, session_id, turn_id)
        );

        INSERT INTO turns (
          user_id, session_id, turn_id, heard_text, mode,
          context_json, candidates_json, source, created_at
        )
        SELECT
          user_id, session_id, turn_id, heard_text, mode,
          context_json, candidates_json, source, created_at
        FROM turns_legacy_v0;

        DROP TABLE turns_legacy_v0;
      `);
    })();
    console.log('[memory] migrated turns primary key to include session_id');
  }
}
