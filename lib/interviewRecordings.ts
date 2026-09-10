import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { InterviewRecording, RecordingEnhancement } from '@/types/recording';

export const MAX_RECORDING_BYTES = 64 * 1024 * 1024;
const ROOT = path.resolve(process.env.INTERVIEW_RECORDINGS_PATH || path.join(process.cwd(), '.local/interview-recordings'));
const KEY = /^(?:behavioral:[a-z0-9-]+|resume:[a-z0-9-]+:[a-z0-9-]+)$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class RecordingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function questionDirectory(question: string) {
  if (question.length > 180 || !KEY.test(question)) throw new RecordingError(400, '无效的题目');
  // Colons cannot be used in Windows directory names; key grammar makes this one-to-one.
  return path.join(ROOT, ...question.split(':'));
}
function takeDirectory(question: string, id: string) {
  if (!ID.test(id)) throw new RecordingError(400, '无效的录音编号');
  return path.join(questionDirectory(question), id);
}
export async function listRecordings(question: string): Promise<InterviewRecording[]> {
  const dir = questionDirectory(question);
  const entries = await fs.readdir(dir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  const records = await Promise.all(entries.filter(id => ID.test(id)).map(async id => {
    try { return await readRecording(question, id); }
    catch (e) { if (e instanceof RecordingError && e.status === 404) return null; throw e; }
  }));
  return records.filter((r): r is InterviewRecording => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function readRecording(question: string, id: string): Promise<InterviewRecording> {
  try {
    const dir = takeDirectory(question, id);
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
    const enhancement = await fs.readFile(path.join(dir, 'enhanced/analysis.json'), 'utf8').then(JSON.parse).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    });
    return { ...meta, enhancement };
  }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new RecordingError(404, '录音不存在');
    throw e;
  }
}
export async function readAudio(question: string, id: string, cleaned = false) {
  const meta = await readRecording(question, id);
  if (cleaned && !meta.enhancement) throw new RecordingError(404, '此录音还没有整理版');
  return {
    meta: cleaned ? { ...meta, mimeType: 'audio/wav', duration: meta.enhancement!.duration } : meta,
    data: await fs.readFile(path.join(takeDirectory(question, id), cleaned ? 'enhanced/audio.wav' : 'audio')),
  };
}

export async function saveEnhancement(question: string, id: string, audio: Buffer, input: unknown) {
  const meta = await readRecording(question, id);
  if (meta.enhancement) return meta; // retry after a lost response
  const a = input as RecordingEnhancement | null;
  const peaks = (v: unknown) => Array.isArray(v) && v.length === 240 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
  if (!a || a.version !== 1 || !['trimmed', 'unchanged', 'quiet'].includes(a.status) ||
    ![a.duration, a.originalDuration, a.removedSeconds].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 86400) ||
    a.duration <= 0 || Math.abs(a.originalDuration - a.duration - a.removedSeconds) > .03 || !peaks(a.waveform) || !peaks(a.originalWaveform)) throw new RecordingError(400, '无效的波形或整理结果');
  // Our encoder writes a canonical mono 16-bit PCM WAV. Check bytes against
  // metadata so waveform time and the seekable media cannot silently disagree.
  if (audio.length < 46 || audio.length > MAX_RECORDING_BYTES || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data' ||
    audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(24) < 8000 || audio.readUInt32LE(24) > 96000 ||
    Math.abs((audio.length - 44) / 2 / audio.readUInt32LE(24) - a.duration) > .03) throw new RecordingError(400, '整理音频与时长不匹配');
  const dir = takeDirectory(question, id);
  const temp = path.join(dir, `.enhancing-${randomUUID()}`);
  await fs.mkdir(temp); // do not recreate a recording concurrently deleted by the user
  try {
    const analysis: RecordingEnhancement = { version: 1, status: a.status, duration: a.duration, originalDuration: a.originalDuration, removedSeconds: a.removedSeconds, waveform: a.waveform, originalWaveform: a.originalWaveform };
    await fs.writeFile(path.join(temp, 'audio.wav'), audio);
    await fs.writeFile(path.join(temp, 'analysis.json'), JSON.stringify(analysis));
    await fs.rename(temp, path.join(dir, 'enhanced'));
  } catch (e) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((e as NodeJS.ErrnoException).code ?? '') || !(await readRecording(question, id)).enhancement) throw e;
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
  return readRecording(question, id);
}
export async function saveRecording(question: string, data: Buffer, mimeType: string, duration: number, requestedId?: string) {
  const parent = questionDirectory(question);
  if (requestedId) {
    try { return await readRecording(question, requestedId); }
    catch (e) { if (!(e instanceof RecordingError && e.status === 404)) throw e; }
  }
  const now = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  const meta: InterviewRecording = {
    id: requestedId || randomUUID(), createdAt: now.toISOString(), duration, mimeType, size: data.length,
    name: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`,
  };
  const temp = path.join(parent, `.pending-${randomUUID()}`);
  await fs.mkdir(temp, { recursive: true });
  try {
    await fs.writeFile(path.join(temp, 'audio'), data);
    await fs.writeFile(path.join(temp, 'meta.json'), JSON.stringify(meta));
    await fs.rename(temp, takeDirectory(question, meta.id));
  } catch (e) {
    await fs.rm(temp, { recursive: true, force: true });
    if (requestedId && ['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((e as NodeJS.ErrnoException).code ?? '')) return readRecording(question, requestedId);
    throw e;
  }
  return meta;
}
export async function renameRecording(question: string, id: string, name: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || /[\x00-\x1f]/.test(name)) {
    throw new RecordingError(400, '名称需要为 1–120 个字符');
  }
  const meta = { ...await readRecording(question, id), name: name.trim() };
  const dir = takeDirectory(question, id);
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(meta));
    await fs.rename(temp, path.join(dir, 'meta.json'));
  } finally { await fs.rm(temp, { force: true }); }
  return meta;
}
export async function deleteRecording(question: string, id: string) {
  await readRecording(question, id);
  await fs.rm(takeDirectory(question, id), { recursive: true });
}
