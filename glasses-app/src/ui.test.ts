import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateTextLength } from '@vftv/shared';
import { DEFAULT_ACTIVE_GROUPS, DEFAULT_SETTINGS, normalizeSettings } from './ui';

test('default quick-expression presets are four deterministic HUD-ready groups', () => {
  assert.deepEqual(
    DEFAULT_ACTIVE_GROUPS.map((group) => group.name),
    ['基础', '沟通', '需求', '结束'],
  );
  for (const group of DEFAULT_ACTIVE_GROUPS) {
    assert.equal(group.phrases.length, 4);
    assert.equal(new Set(group.phrases).size, 4);
    for (const phrase of group.phrases) {
      assert.ok(phrase.length > 0);
      assert.ok(candidateTextLength(phrase) <= 12);
    }
  }
});

test('normalizeSettings upgrades untouched legacy active groups to the new presets', () => {
  const migrated = normalizeSettings({
    activeGroups: [
      { id: 'g_saved_1', name: '打招呼', phrases: ['你好，很高兴认识你', '早上好', '好久不见', '回头见'] },
      { id: 'g_saved_2', name: '需求', phrases: ['请帮我一下', '请给我一杯水', '我想休息一下', '请再说一遍'] },
      { id: 'g_saved_3', name: '缓冲', phrases: ['等我一下', '容我想想', '我在听', '稍后回复你'] },
      { id: 'g_saved_4', name: '告别', phrases: ['我先失陪一下', '今天先到这', '谢谢你的理解', '我们下次再聊'] },
    ],
  });
  assert.deepEqual(migrated.activeGroups, DEFAULT_ACTIVE_GROUPS);
});

test('normalizeSettings preserves customized legacy groups', () => {
  const migrated = normalizeSettings({
    activeGroups: [
      { id: 'g_hello', name: '我的招呼', phrases: ['你好'] },
    ],
  });
  assert.deepEqual(migrated.activeGroups, [
    { id: 'g_hello', name: '我的招呼', phrases: ['你好'] },
  ]);
});

test('normalizeSettings deep-fills fields missing from an older KVS value', () => {
  const migrated = normalizeSettings({
    twoStepConfirm: false,
    listenSeconds: 3,
    scene: 'work',
  });
  assert.equal(migrated.twoStepConfirm, false);
  assert.equal(migrated.listenSeconds, 3);
  assert.equal(migrated.scene, 'work');
  assert.equal(migrated.partner, 'default');
  assert.deepEqual(migrated.scenePhrases.dining, DEFAULT_SETTINGS.scenePhrases.dining);
  assert.ok(migrated.activeGroups.length > 0);
});

test('normalizeSettings repairs invalid enums and malformed nested values', () => {
  const migrated = normalizeSettings({
    listenSeconds: 9,
    scene: 'invalid',
    partner: 'invalid',
    activeGroups: [{ id: '', name: 42, phrases: 'not-an-array' }],
    scenePhrases: { work: ['保留这句'], dining: 'bad' },
  });
  assert.equal(migrated.listenSeconds, DEFAULT_SETTINGS.listenSeconds);
  assert.equal(migrated.scene, DEFAULT_SETTINGS.scene);
  assert.equal(migrated.partner, DEFAULT_SETTINGS.partner);
  assert.deepEqual(migrated.activeGroups[0].phrases, []);
  assert.deepEqual(migrated.scenePhrases.work, ['保留这句']);
  assert.deepEqual(migrated.scenePhrases.dining, []);
  assert.deepEqual(migrated.scenePhrases.social, DEFAULT_SETTINGS.scenePhrases.social);
});
