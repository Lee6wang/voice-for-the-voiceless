import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlaybackController,
  type AudioLike,
  type PlaybackAdapters,
  type SpeechUtteranceLike,
} from './playback';

class FakeAudio implements AudioLike {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 1;
  paused = false;
  rejectPlay = false;

  play(): Promise<void> {
    return this.rejectPlay ? Promise.reject(new Error('blocked')) : Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

function harness() {
  const audios: FakeAudio[] = [];
  let utterance: SpeechUtteranceLike | null = null;
  let speechCancelCount = 0;
  const adapters: PlaybackAdapters = {
    createAudio: () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio;
    },
    speech: {
      create: () => {
        utterance = { lang: '', onend: null, onerror: null };
        return utterance;
      },
      speak: () => {},
      cancel: () => {
        speechCancelCount++;
      },
    },
    setTimer: () => 1,
    clearTimer: () => {},
  };
  return {
    controller: new PlaybackController(adapters),
    audios,
    getUtterance: () => utterance,
    getSpeechCancelCount: () => speechCancelCount,
  };
}

test('audio remains pending until ended', async () => {
  const h = harness();
  let settled = false;
  const result = h.controller.playAudio('abc').then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  h.audios[0].onended?.();
  assert.equal(await result, 'completed');
});

test('play rejection reports failed', async () => {
  const h = harness();
  const audio = new FakeAudio();
  audio.rejectPlay = true;
  h.audios.push(audio);
  const controller = new PlaybackController({
    createAudio: () => audio,
    speech: null,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  assert.equal(await controller.playAudio('abc'), 'failed');
});

test('stop cancels a playing audio and rewinds it', async () => {
  const h = harness();
  const result = h.controller.playAudio('abc');
  await Promise.resolve();
  h.controller.stop();
  assert.equal(await result, 'cancelled');
  assert.equal(h.audios[0].paused, true);
  assert.equal(h.audios[0].currentTime, 0);
});

test('starting a new audio cancels the previous one', async () => {
  const h = harness();
  const first = h.controller.playAudio('one');
  await Promise.resolve();
  const second = h.controller.playAudio('two');
  assert.equal(await first, 'cancelled');
  h.audios[1].onended?.();
  assert.equal(await second, 'completed');
});

test('speech can be cancelled without reporting failure', async () => {
  const h = harness();
  const result = h.controller.speakText('你好');
  const utterance = h.getUtterance();
  assert.ok(utterance);
  assert.equal(utterance.lang, 'zh-CN');
  h.controller.stop();
  assert.equal(await result, 'cancelled');
  assert.ok(h.getSpeechCancelCount() >= 1);
});

test('synchronous speech error during cancel still resolves as cancelled', async () => {
  let utterance: SpeechUtteranceLike | null = null;
  const controller = new PlaybackController({
    createAudio: () => new FakeAudio(),
    speech: {
      create: () => {
        utterance = { lang: '', onend: null, onerror: null };
        return utterance;
      },
      speak: () => {},
      cancel: () => utterance?.onerror?.(),
    },
    setTimer: () => 1,
    clearTimer: () => {},
  });
  const result = controller.speakText('请帮帮我');
  controller.stop();
  assert.equal(await result, 'cancelled');
});
