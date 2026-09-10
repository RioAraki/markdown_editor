const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tidyAudio, waveformPeaks, encodeWave } = require('./helpers/load-typescript.cjs')()(path.resolve('lib/audioProcessing.ts'));
const rate = 10000;
const signal = (...parts) => Float32Array.from(parts.flatMap(([seconds, amplitude]) => Array.from({ length: seconds * rate }, (_, i) => amplitude * Math.sin(2 * Math.PI * 300 * i / rate))));

test('trims silent edges and shortens long gaps while retaining every speech sample', () => {
  const input = signal([1, 0], [1, .3], [1.5, 0], [1, .2], [1, 0]);
  const result = tidyAudio(input, rate);
  assert.ok(result.samples.length < input.length - 25000);
  assert.ok(result.samples.length > 20000);
  assert.equal(result.status, 'trimmed');
  assert.ok(result.removedSeconds > 2.5);
  assert.equal(Array.from(result.samples).filter(v => Math.abs(v) > .05).length, Array.from(input).filter(v => Math.abs(v) > .05).length);
  assert.equal(result.waveform.length, 240);
});
test('natural short pauses and quiet speech are preserved', () => {
  const input = signal([.5, .025], [.15, 0], [.5, .025]);
  const result = tidyAudio(input, rate);
  assert.equal(result.samples.length, input.length);
  assert.equal(result.status, 'unchanged');
});
test('an all-silent or too-quiet recording is retained, never erased', () => {
  for (const input of [new Float32Array(12000), signal([1, .0005])]) {
    const result = tidyAudio(input, rate);
    assert.equal(result.status, 'quiet');
    assert.deepEqual(result.samples, input);
  }
});

test('a louder phrase or transient must not cause quiet words to be removed', () => {
  for (const input of [signal([1, .01], [1, .2], [1, .01]), signal([8, .002], [.2, .3], [2, .002]), signal([1, .0005], [1, .3], [1, .0005])]) {
    const result = tidyAudio(input, rate);
    assert.equal(result.samples.length, input.length);
    assert.deepEqual(result.samples, input);
  }
});
test('waveforms stay on a common absolute amplitude scale and WAV duration matches output', () => {
  const soft = waveformPeaks(signal([1, .02]), 10);
  const loud = waveformPeaks(signal([1, .6]), 10);
  assert.ok(loud[0] > soft[0] * 10);
  const input = signal([.1, .3]);
  const wav = encodeWave(input, rate);
  const view = new DataView(wav);
  assert.equal(view.getUint32(24, true), rate);
  assert.equal(view.getUint32(40, true), input.length * 2);
  assert.equal(view.getUint16(22, true), 1);
});
