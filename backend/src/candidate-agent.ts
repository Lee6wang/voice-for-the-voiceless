// 无声之声 · 受约束 Candidate Agent
// 实时路径只做确定性记忆召回 + 一次候选生成；记忆写入由显式反馈驱动。

import {
  CANDIDATE_MAX_LEN,
  candidateTextLength,
  type CandidateFeedbackEvent,
  type CandidateFeedbackRequest,
  type CandidateFeedbackResponse,
  type CandidatesRequest,
  type CandidatesResponse,
  type ConversationTurn,
} from '@vftv/shared';
import {
  createCandidatesResponse,
  type CandidateGenerator,
} from './candidate-response';
import type {
  MemoryRepository,
  RecalledBehaviorMemory,
} from './memory-store';

const FEEDBACK_EVENTS = new Set<CandidateFeedbackEvent>([
  'displayed',
  'refreshed',
  'selected',
  'played',
  'play_failed',
]);

function isShortId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export function candidatesRequestError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'JSON body required';
  const request = value as Partial<CandidatesRequest>;
  if (!isShortId(request.turnId)) return 'turnId required';
  if (request.sessionId !== undefined && !isShortId(request.sessionId)) {
    return 'sessionId must be a non-empty string';
  }
  if (typeof request.heardText !== 'string' || request.heardText.length > 2000) {
    return 'heardText must be a string no longer than 2000 characters';
  }
  if (!request.profile || !isShortId(request.profile.userId)) return 'profile.userId required';
  if (
    !Array.isArray(request.profile.commonPhrases) ||
    request.profile.commonPhrases.some((phrase) => typeof phrase !== 'string')
  ) {
    return 'profile.commonPhrases must be an array';
  }
  if (
    request.exclude !== undefined &&
    (!Array.isArray(request.exclude) ||
      request.exclude.some((text) => typeof text !== 'string'))
  ) {
    return 'exclude must be a string array';
  }
  if (
    request.history !== undefined &&
    (!Array.isArray(request.history) ||
      request.history.some(
        (turn) =>
          !turn ||
          typeof turn.heard !== 'string' ||
          typeof turn.said !== 'string',
      ))
  ) {
    return 'history must contain heard/said string pairs';
  }
  if (
    request.mode !== undefined &&
    request.mode !== 'reply' &&
    request.mode !== 'active'
  ) {
    return 'mode must be reply or active';
  }
  return null;
}

export function feedbackRequestError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'JSON body required';
  const feedback = value as Partial<CandidateFeedbackRequest>;
  for (const [name, field] of [
    ['eventId', feedback.eventId],
    ['userId', feedback.userId],
    ['sessionId', feedback.sessionId],
    ['turnId', feedback.turnId],
    ['candidateId', feedback.candidateId],
  ] as const) {
    if (!isShortId(field)) return `${name} required`;
  }
  if (
    typeof feedback.text !== 'string' ||
    !feedback.text.trim() ||
    candidateTextLength(feedback.text.trim()) > CANDIDATE_MAX_LEN
  ) {
    return `text must be 1-${CANDIDATE_MAX_LEN} characters`;
  }
  if (!feedback.event || !FEEDBACK_EVENTS.has(feedback.event)) {
    return 'unsupported feedback event';
  }
  return null;
}

function mergeHistory(
  stored: ConversationTurn[],
  provided?: ConversationTurn[],
): ConversationTurn[] | undefined {
  const merged: ConversationTurn[] = [];
  const seen = new Set<string>();
  for (const turn of [...stored, ...(provided ?? [])]) {
    if (!turn || typeof turn.heard !== 'string' || typeof turn.said !== 'string') continue;
    const key = `${turn.heard}\u0000${turn.said}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(turn);
  }
  return merged.length > 0 ? merged.slice(-3) : undefined;
}

export class CandidateAgent {
  constructor(
    private readonly memory: MemoryRepository | null,
    private readonly generator?: CandidateGenerator,
  ) {}

  async run(request: CandidatesRequest): Promise<CandidatesResponse> {
    let memories: RecalledBehaviorMemory[] = [];
    let storedHistory: ConversationTurn[] = [];
    if (this.memory) {
      try {
        memories = this.memory.recallBehavior(
          request.profile.userId,
          request.context,
          request.mode,
        );
        if (request.sessionId) {
          storedHistory = this.memory.recentTurns(
            request.profile.userId,
            request.sessionId,
          );
        }
      } catch (error) {
        console.warn(
          '[agent] memory recall skipped:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    const enrichedRequest: CandidatesRequest = {
      ...request,
      history: mergeHistory(storedHistory, request.history),
    };
    const response = await createCandidatesResponse(
      enrichedRequest,
      this.generator,
      undefined,
      memories,
    );
    const enrichedResponse: CandidatesResponse = {
      ...response,
      memoryUsed: memories.length,
    };

    if (this.memory) {
      try {
        this.memory.recordTurn({ request: enrichedRequest, response: enrichedResponse });
      } catch (error) {
        console.warn(
          '[agent] turn persistence skipped:',
          error instanceof Error ? error.message : error,
        );
      }
    }
    return enrichedResponse;
  }

  recordFeedback(feedback: CandidateFeedbackRequest): CandidateFeedbackResponse {
    if (!this.memory) throw new Error('memory unavailable');
    const { duplicate } = this.memory.recordFeedback({
      ...feedback,
      text: feedback.text.trim(),
    });
    return { ok: true, duplicate };
  }
}
