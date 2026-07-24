import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings } from './ui';

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
