import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateTextLength,
  normalizeCandidateTexts,
  type UserProfile,
} from '@vftv/shared';
import {
  buildSystemPrompt,
  buildUserPrompt,
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
  assert.ok(result.every((candidate) => candidateTextLength(candidate.text) <= 12));
});

test('normalizes empty, duplicate and overlong input to four unique candidates', () => {
  const result = normalizeCandidateTexts(
    ['', ' 好的 ', '好的', '这是一句肯定超过十二个字符所以不能进入眼镜候选的文本'],
    '随便聊聊',
  );
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map((candidate) => candidate.text)).size, 4);
  assert.ok(result.every((candidate) => candidate.text.trim() === candidate.text));
  assert.ok(result.every((candidate) => candidateTextLength(candidate.text) <= 12));
});

test('counts emoji as one Unicode character when enforcing HUD length', () => {
  const twelveEmoji = '😀'.repeat(12);
  const thirteenEmoji = '😀'.repeat(13);
  const result = normalizeCandidateTexts([twelveEmoji, thirteenEmoji], '');
  assert.ok(result.some((candidate) => candidate.text === twelveEmoji));
  assert.ok(result.every((candidate) => candidate.text !== thirteenEmoji));
});

test('keeps four unique candidates when the previous batch exhausts the fallback pool', () => {
  const previous = normalizeCandidateTexts([], '').map((candidate) => candidate.text);
  const result = normalizeCandidateTexts([], '', { exclude: previous });
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map((candidate) => candidate.text)).size, 4);
  assert.ok(result.every((candidate) => !previous.includes(candidate.text)));
});

for (const count of [0, 1, 3, 4, 10]) {
  test(`normalizes an active phrase group with ${count} item(s)`, () => {
    const phrases = Array.from({ length: count }, (_, index) => `短语${index + 1}`);
    const result = normalizeCandidateTexts(phrases, '主动表达', { idPrefix: 'active' });
    assert.equal(result.length, 4);
    assert.equal(new Set(result.map((candidate) => candidate.text)).size, 4);
  });
}

test('buildSystemPrompt injects structured profile fields', () => {
  const profile: UserProfile = {
    userId: 'demo',
    name: '小李',
    role: '学生',
    challenges: ['社恐', '口吃'],
    interests: ['篮球'],
    avoidWords: ['年龄'],
    verbosity: 'terse',
    commonPhrases: ['稍后回你'],
    tone: 'gentle',
  };
  const prompt = buildSystemPrompt(profile);
  assert.match(prompt, /学生/); // role
  assert.match(prompt, /社恐、口吃/); // challenges
  assert.match(prompt, /篮球/); // interests
  assert.match(prompt, /禁止出现.*年龄/); // avoidWords
  assert.match(prompt, /更短/); // verbosity=terse
  assert.match(prompt, /稍后回你/); // commonPhrases
});

test('buildUserPrompt adds partner and renders recent history in reply mode', () => {
  const prompt = buildUserPrompt(
    '你中午想吃什么？',
    [],
    { localTime: '12:10', partner: '服务员' },
    'reply',
    [{ heard: '你吃了吗', said: '还没呢' }],
  );
  assert.match(prompt, /正在和服务员对话/); // partner
  assert.match(prompt, /上文/); // history rendered
  assert.match(prompt, /对方刚刚说/); // reply framing
});

test('buildUserPrompt reframes intent in active mode', () => {
  const prompt = buildUserPrompt('打招呼', [], undefined, 'active');
  assert.match(prompt, /主动开口/); // active framing
  assert.doesNotMatch(prompt, /对方刚刚说/); // not reply framing
});
