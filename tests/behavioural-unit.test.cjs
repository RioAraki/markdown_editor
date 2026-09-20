const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');
const { dataTest, readData } = require('./helpers/data-test.cjs');

const load = makeLoader();
const { parseBehaviouralUnit, behaviouralUnitText } = load(
  path.resolve(__dirname, '../../diary/shared/interview/behavioural.ts'),
);

// A 行为故事 line has to carry two things that used to be mutually exclusive:
// which question it is, and what you wrote about the attempt. Unlike the
// question banks — whose answers live in qbank/*.md — a spoken answer's notes
// have nowhere else to go, so both share the line and the split has to be
// lossless in both directions. Getting this wrong would show the question text
// inside the notes box and then overwrite the question when you typed there.

test('a line with no id is entirely a note (existing days)', () => {
  // This is what every 行为故事 line written so far looks like: the subject is
  // in the day's items: marker, the trailing is the answer.
  const written = '好的，我叫李悦，2019 年毕业于多伦多大学 / 之后去了亚马逊';
  assert.equal(parseBehaviouralUnit(written), null, 'must not claim an un-prefixed line');
});

test('id, question and note round-trip without loss', () => {
  const text = behaviouralUnitText('bh-cn-intro', '请用中文介绍一下你自己', '讲了 90 秒，偏长');
  assert.equal(text, '[bh-cn-intro] 请用中文介绍一下你自己 · 讲了 90 秒，偏长');
  const p = parseBehaviouralUnit(text);
  assert.deepEqual(p, {
    id: 'bh-cn-intro',
    title: '请用中文介绍一下你自己',
    note: '讲了 90 秒，偏长',
  });
  assert.equal(behaviouralUnitText(p.id, p.title, p.note), text, 'reserialising must be stable');
});

test('a note containing the separator survives the round trip', () => {
  const note = '第一段太长 · 第二段还行 · 结尾要练';
  const text = behaviouralUnitText('bh-challenge', '最大的技术挑战', note);
  const p = parseBehaviouralUnit(text);
  assert.equal(p.title, '最大的技术挑战', 'the title must not absorb the note');
  assert.equal(p.note, note, 'the note must come back whole');
  assert.equal(behaviouralUnitText(p.id, p.title, p.note), text);
});

test('an empty note leaves no trailing separator', () => {
  const text = behaviouralUnitText('bh-collab', '跨团队协作');
  assert.equal(text, '[bh-collab] 跨团队协作');
  assert.equal(parseBehaviouralUnit(text).note, '');
  // Typing then clearing the box must not leave " · " behind.
  assert.equal(behaviouralUnitText('bh-collab', '跨团队协作', '   '), text);
});

test('ids from the other unit kinds are left alone', () => {
  // parseStoryUnit owns [rs-news-service-1]; parseQuestionUnit owns
  // [qta-60c768a5]. Anchoring to bh- keeps the three from fighting.
  for (const other of [
    '[rs-news-service-1] 这个项目的难点',
    '[qta-60c768a5] 什么是条件概率？',
    '#721 账户合并 · 磕磕绊绊',
  ]) {
    assert.equal(parseBehaviouralUnit(other), null, `must not claim: ${other}`);
  }
});

dataTest('all behavioural inventory ids are actually matched', () => {
  // The prefix anchor is only safe if the inventory really uses it; a future
  // question added under a different id would silently render as a plain note.
  // Data, not code — so it skips inside a release build, which carries none.
  const inv = readData('inventory.json');
  const ids = (inv.domains ?? [])
    .filter((d) => d.track === 'behavioral')
    .flatMap((d) => (d.modules ?? []).flatMap((m) => (m.items ?? []).map((i) => i.id)));
  assert.ok(ids.length > 0, 'expected behavioural items in the inventory');
  const unmatched = ids.filter(
    (id) => parseBehaviouralUnit(behaviouralUnitText(id, 'x'))?.id !== id,
  );
  assert.deepEqual(unmatched, [], `these ids do not round-trip: ${unmatched.join(', ')}`);
});
