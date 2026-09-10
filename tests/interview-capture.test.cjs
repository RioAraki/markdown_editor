const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');
const { startInterviewCapture } = makeLoader()(path.resolve('lib/interviewCapture.ts'));
const { protectRecording } = makeLoader()(path.resolve('lib/protectRecording.ts'));

class FakeRecorder {
  static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
  state = 'inactive';
  mimeType = 'audio/webm';
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['final audio'], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}
let releases;
test.beforeEach(() => {
  releases = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { releases++; } }] }) } } });
  globalThis.MediaRecorder = FakeRecorder;
});
test.after(() => { delete globalThis.MediaRecorder; delete globalThis.navigator; });

test('stop includes the final audio chunk and releases the microphone', async () => {
  const capture = await startInterviewCapture(new AbortController().signal);
  const take = await capture.stop();
  assert.equal(await take.blob.text(), 'final audio');
  assert.equal(take.blob.type, 'audio/webm');
  assert.ok(take.duration >= 0);
  assert.equal(releases, 1);
});
test('only one question can own the microphone, and cancel releases it', async () => {
  const capture = await startInterviewCapture(new AbortController().signal);
  await assert.rejects(startInterviewCapture(new AbortController().signal), /另一道题/);
  capture.cancel();
  assert.equal(releases, 1);
  const next = await startInterviewCapture(new AbortController().signal);
  next.cancel();
});
test('leaving while permission is pending closes the late microphone stream', async () => {
  const controller = new AbortController();
  navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
    queueMicrotask(() => resolve({ getTracks: () => [{ stop: () => { releases++; } }] }));
  });
  const pending = startInterviewCapture(controller.signal);
  controller.abort();
  await assert.rejects(pending, /取消/);
  assert.equal(releases, 1);
  const next = await startInterviewCapture(new AbortController().signal);
  next.cancel();
});
test('permission refusal does not leave the recorder locked', async () => {
  const original = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); };
  await assert.rejects(startInterviewCapture(new AbortController().signal), /Permission denied/);
  navigator.mediaDevices.getUserMedia = original;
  const next = await startInterviewCapture(new AbortController().signal);
  next.cancel();
});

test('unsaved capture blocks in-app navigation but allows its own controls, and releases the guard', () => {
  globalThis.Node = EventTarget;
  globalThis.document = new EventTarget();
  let blocked = 0;
  let inside = false;
  const remove = protectRecording({ contains: () => inside }, () => { blocked++; });
  try {
    const outside = new Event('click', { cancelable: true });
    document.dispatchEvent(outside);
    assert.equal(outside.defaultPrevented, true);
    assert.equal(blocked, 1);
    inside = true;
    const stopButton = new Event('click', { cancelable: true });
    document.dispatchEvent(stopButton);
    assert.equal(stopButton.defaultPrevented, false);
    remove();
    inside = false;
    const navigation = new Event('click', { cancelable: true });
    document.dispatchEvent(navigation);
    assert.equal(navigation.defaultPrevented, false);
  } finally { remove(); delete globalThis.Node; delete globalThis.document; }
});
