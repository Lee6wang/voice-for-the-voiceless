import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCandidateTexts,
  sanitizeCandidates,
} from './candidates';

const EXPECTED = ['挺好的', '容我想想', '你呢', '还不错'];

test('parses a direct JSON array', () => {
  assert.deepEqual(parseCandidateTexts(JSON.stringify(EXPECTED)), EXPECTED);
});

test('parses a fenced JSON array', () => {
  const raw = `\`\`\`json\n${JSON.stringify(EXPECTED)}\n\`\`\``;
  assert.deepEqual(parseCandidateTexts(raw), EXPECTED);
});

test('parses a JSON array wrapped in another JSON string', () => {
  assert.deepEqual(
    parseCandidateTexts(JSON.stringify(JSON.stringify(EXPECTED))),
    EXPECTED,
  );
});

test('parses quotes escaped without an outer JSON string', () => {
  const raw = '[\n\\"挺好的\\",\n\\"容我想想\\",\n\\"你呢\\",\n\\"还不错\\"\n]';
  assert.deepEqual(parseCandidateTexts(raw), EXPECTED);
});

test('falls back to numbered lines without leaking brackets or slashes', () => {
  const raw = '1. 挺好的\n2. 容我想想\n3. 你呢\n4. 还不错';
  assert.deepEqual(parseCandidateTexts(raw), EXPECTED);
});

test('sanitizes, deduplicates and fills to exactly four candidates', () => {
  const result = sanitizeCandidates(
    ['挺好的', '挺好的', '这句话明显超过十二个汉字所以不能显示'],
    '你今天感觉怎么样？',
    [],
  );
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map((candidate) => candidate.text)).size, 4);
  assert.ok(result.every((candidate) => candidate.text.length <= 12));
});
