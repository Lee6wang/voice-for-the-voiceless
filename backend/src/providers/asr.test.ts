import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasSpeechEnergy } from './asr';

test('rejects digital silence and tiny numerical noise', () => {
  assert.equal(hasSpeechEnergy(new Float32Array(16000)), false);
  assert.equal(hasSpeechEnergy(new Float32Array(16000).fill(0.0001)), false);
});

test('accepts a conservative speech-like waveform', () => {
  const samples = Float32Array.from(
    { length: 16000 },
    (_, i) => Math.sin((2 * Math.PI * 220 * i) / 16000) * 0.02,
  );
  assert.equal(hasSpeechEnergy(samples), true);
});
