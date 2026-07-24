import {
  pickTemplateCandidates,
  type Candidate,
  type CandidatesRequest,
  type CandidatesResponse,
  type ConversationTurn,
  type InteractionMode,
  type SceneContext,
  type UserProfile,
} from '@vftv/shared';
import { generateCandidates } from './candidates';

export type CandidateGenerator = (
  heardText: string,
  profile: UserProfile,
  exclude: string[],
  context?: SceneContext,
  mode?: InteractionMode,
  history?: ConversationTurn[],
) => Promise<Candidate[]>;

/**
 * /candidates 的可单测响应逻辑。
 * LLM 成功与模板兜底都显式标注 source，旧客户端仍可忽略该可选字段。
 */
export async function createCandidatesResponse(
  request: CandidatesRequest,
  generator: CandidateGenerator = generateCandidates,
  onFallback: (error: unknown) => void = (error) => {
    console.warn(
      '[candidates] fallback to templates:',
      error instanceof Error ? error.message : error,
    );
  },
): Promise<CandidatesResponse> {
  const {
    turnId,
    heardText,
    profile,
    exclude = [],
    context,
    mode,
    history,
  } = request;
  try {
    const candidates = await generator(
      heardText,
      profile,
      exclude,
      context,
      mode,
      history,
    );
    return { turnId, candidates, source: 'llm' };
  } catch (error) {
    onFallback(error);
    return {
      turnId,
      candidates: pickTemplateCandidates(heardText, exclude),
      source: 'template',
    };
  }
}
