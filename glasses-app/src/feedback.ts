import {
  CANDIDATE_MAX_LEN,
  candidateTextLength,
  type Candidate,
  type CandidateFeedbackRequest,
  type CandidateSet,
  type SceneContext,
} from '@vftv/shared';

export function isPlayedFeedback(value: unknown): value is CandidateFeedbackRequest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CandidateFeedbackRequest>;
  const ids = [
    item.eventId,
    item.userId,
    item.sessionId,
    item.turnId,
    item.candidateId,
  ];
  return (
    item.event === 'played' &&
    ids.every(
      (id) =>
        typeof id === 'string' &&
        id.trim().length > 0 &&
        id.length <= 128,
    ) &&
    typeof item.text === 'string' &&
    item.text.trim().length > 0 &&
    candidateTextLength(item.text.trim()) <= CANDIDATE_MAX_LEN &&
    (item.mode === undefined || item.mode === 'reply' || item.mode === 'active')
  );
}

export function buildPlayedFeedback(input: {
  sessionId: string;
  userId: string;
  turn: CandidateSet;
  chosen: Candidate;
  context: SceneContext;
  offlineMode: boolean;
}): CandidateFeedbackRequest | null {
  const { sessionId, userId, turn, chosen, context, offlineMode } = input;
  if (
    offlineMode ||
    turn.turnId.startsWith('privacy_') ||
    turn.turnId.startsWith('local_')
  ) {
    return null;
  }
  return {
    eventId: `${sessionId}:${turn.turnId}:${chosen.id}:played`,
    userId,
    sessionId,
    turnId: turn.turnId,
    candidateId: chosen.id,
    text: chosen.text,
    event: 'played',
    context,
    mode: turn.turnId.startsWith('active_') ? 'active' : 'reply',
  };
}
