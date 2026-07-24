import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCandidateTexts, type CandidatesRequest } from '@vftv/shared';
import { createCandidatesResponse } from './candidate-response';

const request: CandidatesRequest = {
  turnId: 'turn-1',
  heardText: '你今天感觉怎么样？',
  profile: { userId: 'demo', commonPhrases: [] },
};

test('/candidates marks a successful generated response as llm', async () => {
  const response = await createCandidatesResponse(
    request,
    async (heardText) =>
      normalizeCandidateTexts(['挺好的', '有点累', '还不错', '你呢'], heardText),
  );
  assert.equal(response.turnId, request.turnId);
  assert.equal(response.source, 'llm');
  assert.equal(response.candidates.length, 4);
});

test('/candidates marks generator failure as template fallback', async () => {
  const response = await createCandidatesResponse(
    request,
    async () => {
      throw new Error('provider unavailable');
    },
    () => {},
  );
  assert.equal(response.turnId, request.turnId);
  assert.equal(response.source, 'template');
  assert.equal(response.candidates.length, 4);
});
