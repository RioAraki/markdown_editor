import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { MAX_RECORDING_SECONDS } from '@/lib/recordingLimits';
import {
  MAX_RECORDING_BYTES, RecordingError, questionDirectory, listRecordings,
  readAudio, saveRecording, renameRecording, deleteRecording, saveEnhancement,
} from '@/lib/interviewRecordings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };

function params(req: Request) {
  const url = new URL(req.url);
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  // This editor can bind to a LAN address. Audio must still only be accessible on this computer.
  // Next constructs req.url with its bind hostname (0.0.0.0 in dev), so check
  // the browser's actual Host and match Origin against that authority.
  const authority = new URL(`${url.protocol}//${req.headers.get('host') || url.host}`);
  if (!local(authority.hostname)) throw new RecordingError(403, '请通过 localhost 或 127.0.0.1 使用本地录音');
  const origin = req.headers.get('origin');
  if ((origin && origin !== authority.origin) || req.headers.get('sec-fetch-site') === 'cross-site') throw new RecordingError(403, '仅允许本机页面访问录音');
  const question = url.searchParams.get('question') ?? '';
  questionDirectory(question);
  return { question, id: url.searchParams.get('id') ?? '', url };
}
function errorResponse(e: unknown) {
  return NextResponse.json({ error: e instanceof RecordingError ? e.message : '本地录音操作失败，请重试' }, {
    status: e instanceof RecordingError ? e.status : 500, headers: privateHeaders,
  });
}
export async function GET(req: Request) {
  try {
    const { question, id, url } = params(req);
    if (!id) return NextResponse.json({ recordings: await listRecordings(question) }, { headers: privateHeaders });
    const strength = url.searchParams.get('strength') || undefined;
    if (strength !== undefined && strength !== 'standard' && strength !== 'compact') throw new RecordingError(400, '无效的整理强度');
    const { file, size, meta } = await readAudio(question, id, url.searchParams.get('variant') === 'cleaned', strength);
    // Bounded chunks, including full responses. Cancelling the web stream closes the file.
    const stream = (start = 0, end = size - 1) => Readable.toWeb(createReadStream(file, { start, end, highWaterMark: 64 * 1024 }), {
      strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength },
    }) as ReadableStream<Uint8Array>;
    const headers = { ...privateHeaders, 'Content-Type': meta.mimeType, 'Accept-Ranges': 'bytes' };
    const range = req.headers.get('range');
    if (!range) return new Response(stream(), { headers: { ...headers, 'Content-Length': String(size) } });
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = match?.[1] ? Number(match[1]) : 0;
    let end = match?.[2] ? Number(match[2]) : size - 1;
    if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    return new Response(stream(start, end), {
      status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const { question, id, url } = params(req);
    const mimeType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(mimeType)) throw new RecordingError(415, '不支持此录音格式');
    const duration = Number(url.searchParams.get('duration') ?? 0);
    if (!Number.isFinite(duration) || duration < 0 || duration > MAX_RECORDING_SECONDS) throw new RecordingError(400, '单条录音不能超过 7 分钟');
    if (Number(req.headers.get('content-length')) > MAX_RECORDING_BYTES) throw new RecordingError(413, '单条录音不能超过 64 MB');
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = req.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RECORDING_BYTES) { await reader.cancel(); throw new RecordingError(413, '单条录音不能超过 64 MB'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    if (!size) throw new RecordingError(400, '录音为空，请重新录制');
    return NextResponse.json(await saveRecording(question, Buffer.concat(chunks), mimeType, duration, id || undefined), { status: 201, headers: privateHeaders });
  } catch (e) { return errorResponse(e); }
}
export async function PATCH(req: Request) {
  try {
    const { question, id } = params(req);
    const body = await req.json().catch(() => { throw new RecordingError(400, '无效的名称'); });
    return NextResponse.json(await renameRecording(question, id, body?.name), { headers: privateHeaders });
  } catch (e) { return errorResponse(e); }
}
export async function DELETE(req: Request) {
  try {
    const { question, id } = params(req);
    await deleteRecording(question, id);
    return NextResponse.json({ deleted: id }, { headers: privateHeaders });
  } catch (e) { return errorResponse(e); }
}

/** Preserve the original first; publish the processed audio and both waveforms together. */
export async function PUT(req: Request) {
  try {
    const { question, id } = params(req);
    const limit = MAX_RECORDING_BYTES + 16000;
    if (Number(req.headers.get('content-length')) > limit) throw new RecordingError(413, '整理版过大，原始录音已保留');
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) throw new RecordingError(400, '缺少整理结果');
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { await reader.cancel(); throw new RecordingError(413, '整理版过大，原始录音已保留'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers.get('content-type') ?? '' } }).formData()
      .catch(() => { throw new RecordingError(400, '无效的整理结果'); });
    const audio = form.get('audio');
    const analysisText = form.get('analysis');
    if (!(audio instanceof Blob) || audio.type !== 'audio/wav' || typeof analysisText !== 'string' || analysisText.length > 12000) throw new RecordingError(400, '缺少音频或波形');
    let analysis: unknown;
    try { analysis = JSON.parse(analysisText); } catch { throw new RecordingError(400, '无效的波形'); }
    return NextResponse.json(await saveEnhancement(question, id, Buffer.from(await audio.arrayBuffer()), analysis), { headers: privateHeaders });
  } catch (e) { return errorResponse(e); }
}
