import assert from 'node:assert/strict';
import test from 'node:test';
import { chatComplete, type LlmConfig } from './llm';

const baseConfig: LlmConfig = {
  baseUrl: 'https://provider.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 1000,
};

test('sends provider thinking mode only when explicitly configured', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '["好的"]' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  await chatComplete({ ...baseConfig, thinking: 'disabled' }, 'system', 'user');
  await chatComplete(baseConfig, 'system', 'user');

  assert.deepEqual(bodies[0].thinking, { type: 'disabled' });
  assert.equal('thinking' in bodies[1], false);
});
