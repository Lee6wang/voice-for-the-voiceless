import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Sqlite from 'better-sqlite3';
import {
  normalizeCandidateTexts,
  type CandidateFeedbackRequest,
  type CandidatesRequest,
  type CandidatesResponse,
} from '@vftv/shared';
import {
  CandidateAgent,
  candidatesRequestError,
  feedbackRequestError,
} from './candidate-agent';
import {
  SqliteMemoryRepository,
  type RecalledBehaviorMemory,
} from './memory-store';

function request(
  turnId: string,
  heardText: string,
  sessionId = 'session-1',
): CandidatesRequest {
  return {
    turnId,
    sessionId,
    heardText,
    profile: { userId: 'device-1', commonPhrases: [] },
    context: { scene: '餐厅', partner: '服务员' },
    mode: 'reply',
  };
}

function response(turnId: string, heardText: string): CandidatesResponse {
  return {
    turnId,
    candidates: normalizeCandidateTexts(['温水就好'], heardText),
    source: 'llm',
  };
}

function feedback(
  eventId: string,
  turnId: string,
  text: string,
  context = { scene: '餐厅', partner: '服务员' },
): CandidateFeedbackRequest {
  return {
    eventId,
    userId: 'device-1',
    sessionId: 'session-1',
    turnId,
    candidateId: `candidate-${eventId}`,
    text,
    event: 'played',
    context,
    mode: 'reply',
  };
}

test('new candidate fields are optional and malformed feedback is rejected', () => {
  const legacyRequest = {
    turnId: 'legacy-turn',
    heardText: '你好',
    profile: { userId: 'demo', commonPhrases: [] },
  };
  assert.equal(candidatesRequestError(legacyRequest), null);
  assert.match(
    candidatesRequestError({ ...legacyRequest, exclude: 'not-an-array' }) ?? '',
    /exclude/,
  );
  assert.match(
    candidatesRequestError({ ...legacyRequest, history: [{}] }) ?? '',
    /history/,
  );
  assert.match(
    candidatesRequestError({ ...legacyRequest, mode: 'emergency' }) ?? '',
    /mode/,
  );
  assert.match(
    feedbackRequestError({ ...feedback('event-1', 'turn-1', ''), text: '' }) ?? '',
    /text/,
  );
  assert.match(
    feedbackRequestError({ ...feedback('event-2', 'turn-1', '好的'), event: 'unknown' }) ?? '',
    /unsupported/,
  );
});

test('feedback is idempotent and only played events become behavior memory', () => {
  const memory = new SqliteMemoryRepository(':memory:');
  try {
    const turn = request('turn-1', '想喝什么？');
    memory.recordTurn({ request: turn, response: response(turn.turnId, turn.heardText) });

    assert.deepEqual(memory.recordFeedback(feedback('event-1', turn.turnId, '温水就好')), {
      duplicate: false,
    });
    assert.deepEqual(memory.recordFeedback(feedback('event-1', turn.turnId, '温水就好')), {
      duplicate: true,
    });
    memory.recordFeedback({
      ...feedback('event-2', turn.turnId, '咖啡也行'),
      event: 'selected',
    });

    assert.deepEqual(memory.recallBehavior('device-1', turn.context, 'reply'), [
      { text: '温水就好', playCount: 1, score: 7 },
    ]);
    assert.deepEqual(
      memory.recallBehavior(
        'device-1',
        { scene: '工作场合', partner: '上级' },
        'reply',
      ),
      [],
    );
  } finally {
    memory.close();
  }
});

test('behavior memory survives a backend restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vftv-memory-'));
  const filename = join(directory, 'memory.sqlite');
  try {
    const first = new SqliteMemoryRepository(filename);
    const turn = request('turn-1', '想喝什么？');
    try {
      first.recordTurn({ request: turn, response: response(turn.turnId, turn.heardText) });
      first.recordFeedback(feedback('event-1', turn.turnId, '温水就好'));
    } finally {
      first.close();
    }

    const restarted = new SqliteMemoryRepository(filename);
    try {
      assert.deepEqual(restarted.recallBehavior('device-1', turn.context, 'reply'), [
        { text: '温水就好', playCount: 1, score: 7 },
      ]);
    } finally {
      restarted.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('migrates the legacy turns primary key without losing session history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vftv-memory-migration-'));
  const filename = join(directory, 'memory.sqlite');
  try {
    const legacy = new Sqlite(filename);
    legacy.exec(`
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
        PRIMARY KEY (user_id, turn_id)
      );
      CREATE INDEX idx_turns_session_created
        ON turns (user_id, session_id, created_at DESC);
    `);
    const legacyTurn = request('shared-turn-id', '第一轮', 'session-1');
    legacy.prepare(`
      INSERT INTO turns (
        user_id, session_id, turn_id, heard_text, mode,
        context_json, candidates_json, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      legacyTurn.profile.userId,
      legacyTurn.sessionId,
      legacyTurn.turnId,
      legacyTurn.heardText,
      legacyTurn.mode,
      JSON.stringify(legacyTurn.context),
      JSON.stringify(response(legacyTurn.turnId, legacyTurn.heardText).candidates),
      'llm',
      new Date().toISOString(),
    );
    legacy.close();

    const migrated = new SqliteMemoryRepository(filename);
    try {
      migrated.recordFeedback(
        feedback('legacy-event', legacyTurn.turnId, '第一句'),
      );
      const secondSession = request('shared-turn-id', '第二轮', 'session-2');
      migrated.recordTurn({
        request: secondSession,
        response: response(secondSession.turnId, secondSession.heardText),
      });
      migrated.recordFeedback({
        ...feedback('second-event', secondSession.turnId, '第二句'),
        sessionId: 'session-2',
      });

      assert.deepEqual(migrated.recentTurns('device-1', 'session-1'), [
        { heard: '第一轮', said: '第一句' },
      ]);
      assert.deepEqual(migrated.recentTurns('device-1', 'session-2'), [
        { heard: '第二轮', said: '第二句' },
      ]);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('candidate agent recalls completed session turns and behavior preferences', async () => {
  const memory = new SqliteMemoryRepository(':memory:');
  try {
    const previous = request('turn-1', '想喝什么？');
    memory.recordTurn({
      request: previous,
      response: response(previous.turnId, previous.heardText),
    });
    memory.recordFeedback(feedback('event-1', previous.turnId, '温水就好'));

    let receivedHistory: CandidatesRequest['history'];
    let receivedMemories: RecalledBehaviorMemory[] | undefined;
    const agent = new CandidateAgent(
      memory,
      async (heardText, _profile, _exclude, _context, _mode, history, memories) => {
        receivedHistory = history;
        receivedMemories = memories;
        return normalizeCandidateTexts(['好的', '稍等一下'], heardText);
      },
    );

    const result = await agent.run(request('turn-2', '还要别的吗？'));

    assert.deepEqual(receivedHistory, [{ heard: '想喝什么？', said: '温水就好' }]);
    assert.deepEqual(receivedMemories, [{ text: '温水就好', playCount: 1, score: 7 }]);
    assert.equal(result.memoryUsed, 1);
    assert.equal(result.candidates.length, 4);
  } finally {
    memory.close();
  }
});
