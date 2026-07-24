import assert from 'node:assert/strict';
import test from 'node:test';
import type { CandidateSet } from '@vftv/shared';
import { buildPlayedFeedback, isPlayedFeedback } from './feedback';

const turn: CandidateSet = {
  turnId: 'turn-1',
  heardText: '想喝什么？',
  candidates: [{ id: 'candidate-1', text: '温水就好' }],
  highlightIndex: 0,
};

test('builds a deterministic played event for retry-safe feedback', () => {
  const input = {
    sessionId: 'session-1',
    userId: 'device-1',
    turn,
    chosen: turn.candidates[0],
    context: { scene: '餐厅', partner: '服务员' },
    offlineMode: false,
  };
  const first = buildPlayedFeedback(input);
  const retry = buildPlayedFeedback(input);

  assert.deepEqual(retry, first);
  assert.equal(first?.event, 'played');
  assert.equal(first?.mode, 'reply');
});

test('does not report privacy, local fallback or offline interactions', () => {
  for (const turnId of ['privacy_1', 'local_1']) {
    assert.equal(
      buildPlayedFeedback({
        sessionId: 'session-1',
        userId: 'device-1',
        turn: { ...turn, turnId },
        chosen: turn.candidates[0],
        context: {},
        offlineMode: false,
      }),
      null,
    );
  }
  assert.equal(
    buildPlayedFeedback({
      sessionId: 'session-1',
      userId: 'device-1',
      turn,
      chosen: turn.candidates[0],
      context: {},
      offlineMode: true,
    }),
    null,
  );
});

test('marks active-mode choices without changing the feedback contract', () => {
  const result = buildPlayedFeedback({
    sessionId: 'session-1',
    userId: 'device-1',
    turn: { ...turn, turnId: 'active_1' },
    chosen: turn.candidates[0],
    context: {},
    offlineMode: false,
  });
  assert.equal(result?.mode, 'active');
});

test('rejects corrupt persisted outbox entries before retrying them', () => {
  assert.equal(isPlayedFeedback(null), false);
  assert.equal(isPlayedFeedback({ event: 'played' }), false);
  assert.equal(
    isPlayedFeedback({
      eventId: 'event-1',
      userId: 'device-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      candidateId: 'candidate-1',
      text: '这是一条明显超过十二个字不能进入反馈的句子',
      event: 'played',
    }),
    false,
  );
  const valid = buildPlayedFeedback({
    sessionId: 'session-1',
    userId: 'device-1',
    turn,
    chosen: turn.candidates[0],
    context: {},
    offlineMode: false,
  });
  assert.equal(isPlayedFeedback(valid), true);
});
