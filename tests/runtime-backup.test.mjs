import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('backup verifies contents and never overwrites a previous backup', async () => {
  const { copyVerified } = await import('../scripts/runtime/backup.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-backup-'));
  try {
    const source = path.join(root, 'source');
    const destination = path.join(root, 'backup');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'entry.md'), 'personal entry');
    const files = await copyVerified(source, destination);
    assert.equal(files.length, 1);
    assert.equal(await fs.readFile(path.join(destination, 'entry.md'), 'utf8'), 'personal entry');
    await fs.writeFile(path.join(source, 'entry.md'), 'new entry');
    await assert.rejects(copyVerified(source, destination), /exist|overwrite/i);
    assert.equal(await fs.readFile(path.join(destination, 'entry.md'), 'utf8'), 'personal entry');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('sandbox initialization retains siblings and refuses to replace user test edits', async () => {
  const { initializeSandbox } = await import('../scripts/runtime/backup.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-sandbox-'));
  try {
    const data = path.join(root, 'original/data');
    await fs.mkdir(path.join(data, 'interview/log'), { recursive: true });
    await fs.mkdir(path.join(data, 'interview/qbank'), { recursive: true });
    await fs.mkdir(path.join(data, 'diary'), { recursive: true });
    await fs.writeFile(path.join(data, 'interview/qbank/item.md'), 'question');
    const sources = { DIARY_DATA_PATH: path.join(data, 'diary'), INTERVIEW_LOG_PATH: path.join(data, 'interview/log') };
    const first = await initializeSandbox('development', root, sources);
    assert.equal(await fs.readFile(path.join(first.EDITOR_DATA_ROOT, 'diary/data/interview/qbank/item.md'), 'utf8'), 'question');
    await fs.writeFile(path.join(first.EDITOR_DATA_ROOT, 'diary/data/interview/qbank/item.md'), 'edited');
    await assert.rejects(initializeSandbox('development', root, sources), /exist|overwrite/i);
    assert.equal(await fs.readFile(path.join(first.EDITOR_DATA_ROOT, 'diary/data/interview/qbank/item.md'), 'utf8'), 'edited');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('sandbox maps a renamed log and an external plan without overwriting default siblings', async () => {
  const { initializeSandbox } = await import('../scripts/runtime/backup.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-overrides-'));
  try {
    const source = path.join(root, 'original/training');
    await fs.mkdir(path.join(source, 'custom-log'), { recursive: true });
    await fs.writeFile(path.join(source, 'custom-log/day.md'), 'training entry');
    await fs.writeFile(path.join(source, 'plan.json'), 'default sibling');
    const external = path.join(root, 'custom-plan.json');
    await fs.writeFile(external, 'selected plan');
    const profile = await initializeSandbox('candidate', root, { TRAINING_LOG_PATH: path.join(source, 'custom-log'), TRAINING_PLAN_PATH: external });
    assert.equal(await fs.readFile(path.join(profile.TRAINING_LOG_PATH, 'day.md'), 'utf8'), 'training entry');
    assert.equal(await fs.readFile(profile.TRAINING_PLAN_PATH, 'utf8'), 'selected plan');
    assert.equal(await fs.readFile(path.join(profile.EDITOR_DATA_ROOT, 'diary/data/training/plan.json'), 'utf8'), 'default sibling');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
