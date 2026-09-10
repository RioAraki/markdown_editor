const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs')();

test('switching playback releases the previous source; stale cleanup cannot stop the new one', () => {
  const { claimPlayback } = load(path.resolve('lib/audioResources.ts'));
  const calls = [];
  const first = claimPlayback(() => calls.push('first'));
  const second = claimPlayback(() => calls.push('second'));
  assert.deepEqual(calls, ['first']);
  first();
  assert.deepEqual(calls, ['first']);
  second(); second();
  assert.deepEqual(calls, ['first', 'second']);
});
test('processing is serialized before loading audio, and an error does not block the queue', async () => {
  const { queueAudioProcessing } = load(path.resolve('lib/audioResources.ts'));
  let release;
  const events = [];
  const first = queueAudioProcessing(async () => { events.push('load first'); await new Promise(r => { release = r; }); throw Error('decode failed'); });
  const rejected = assert.rejects(first, /decode failed/);
  const second = queueAudioProcessing(async () => { events.push('load second'); return 2; });
  await Promise.resolve();
  assert.deepEqual(events, ['load first']);
  release(); await rejected;
  assert.equal(await second, 2);
  assert.deepEqual(events, ['load first', 'load second']);
});
