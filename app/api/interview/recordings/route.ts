import { NextResponse } from 'next/server';
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
    const { data, meta } = await readAudio(question, id, url.searchParams.get('variant') === 'cleaned');
    const headers = { ...privateHeaders, 'Content-Type': meta.mimeType, 'Accept-Ranges': 'bytes' };
    const range = req.headers.get('range');
    if (!range) return new Response(new Uint8Array(data), { headers: { ...headers, 'Content-Length': String(data.length) } });
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = match?.[1] ? Number(match[1]) : 0;
    let end = match?.[2] ? Number(match[2]) : data.length - 1;
    if (match && !match[1] && match[2]) { start = Math.max(0, data.length - Number(match[2])); end = data.length - 1; }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${data.length}` } });
    }
    end = Math.min(end, data.length - 1);
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${data.length}` },
    });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const { question, id, url } = params(req);
    const mimeType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(mimeType)) throw new RecordingError(415, '不支持此录音格式');
    const duration = Number(url.searchParams.get('duration') ?? 0);
    if (!Number.isFinite(duration) || duration < 0 || duration > 86400) throw new RecordingError(400, '无效的录音时长');
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
