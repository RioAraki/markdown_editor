const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.resolve('components/interview/LiveRecordingWaveform.tsx');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test('live meter reads the active stream, never routes to speakers, and frees analysis resources', () => {
  const states = [], cleanups = [];
  let index = 0, tick, disconnected = 0, closed = 0, cleared = 0, connectedTo;
  const stream = {};
  const analyser = { fftSize: 1024, getFloatTimeDomainData: data => data.fill(.5), disconnect: () => { disconnected++; } };
  const source = { connect: target => { connectedTo = target; }, disconnect: () => { disconnected++; } };
  class Context {
    createMediaStreamSource(value) { assert.equal(value, stream); return source; }
    createAnalyser() { return analyser; }
    resume() { return Promise.resolve(); }
    close() { closed++; return Promise.resolve(); }
  }
  const exports = {};
  vm.runInNewContext(code, {
    exports, AudioContext: Context,
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { cleared++; },
    require(name) {
      if (name === 'react') return {
        useState(initial) { const i = index++; states[i] = initial; return [initial, value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
        useEffect(fn) { cleanups.push(fn()); },
      };
      return require(name);
    },
  }, { filename: file });
  exports.LiveRecordingWaveform({ stream });
  tick();
  assert.equal(connectedTo, analyser);
  assert.equal(states[0].length, 80);
  assert.equal(states[0][79], .5);
  assert.equal(states[1], .5);
  cleanups.forEach(fn => fn());
  assert.equal(disconnected, 2);
  assert.equal(closed, 1);
  assert.equal(cleared, 1);
});
