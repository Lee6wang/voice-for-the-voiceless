import assert from 'node:assert/strict';
import test from 'node:test';
import { FlowTokenController, playEmergencyTwice } from './flow';
import type { PlaybackResult } from './playback';

test('emergency invalidates an older flow before it can show confirmation', async () => {
  const flows = new FlowTokenController(() => {});
  const oldFlow = flows.begin();
  let finishRequest!: () => void;
  const request = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  let showedConfirmation = false;
  const oldWork = (async () => {
    await request;
    if (flows.isActive(oldFlow)) showedConfirmation = true;
  })();

  flows.cancel();
  finishRequest();
  await oldWork;

  assert.equal(showedConfirmation, false);
});

test('emergency phrases play twice without overlap', async () => {
  const resolvers: Array<(result: PlaybackResult) => void> = [];
  let activePlayers = 0;
  let maximumPlayers = 0;
  let calls = 0;
  const sequence = playEmergencyTwice(
    () =>
      new Promise<PlaybackResult>((resolve) => {
        calls++;
        activePlayers++;
        maximumPlayers = Math.max(maximumPlayers, activePlayers);
        resolvers.push((result) => {
          activePlayers--;
          resolve(result);
        });
      }),
    () => true,
  );

  await Promise.resolve();
  assert.equal(calls, 1);
  resolvers[0]('completed');
  await Promise.resolve();
  assert.equal(calls, 2);
  resolvers[1]('completed');

  assert.equal(await sequence, 'completed');
  assert.equal(maximumPlayers, 1);
});

test('dismissing emergency stops the current pass and never starts the second', async () => {
  let resolvePlayback: ((result: PlaybackResult) => void) | undefined;
  let calls = 0;
  const flows = new FlowTokenController(() => resolvePlayback?.('cancelled'));
  const emergencyFlow = flows.begin();
  const sequence = playEmergencyTwice(
    () =>
      new Promise<PlaybackResult>((resolve) => {
        calls++;
        resolvePlayback = resolve;
      }),
    () => flows.isActive(emergencyFlow),
  );
  await Promise.resolve();

  flows.cancel();

  assert.equal(await sequence, 'cancelled');
  assert.equal(calls, 1);
});
