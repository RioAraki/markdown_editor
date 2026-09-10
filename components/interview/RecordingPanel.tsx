'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { startInterviewCapture, type CapturedAnswer, type InterviewCapture } from '@/lib/interviewCapture';
import type { InterviewRecording } from '@/types/recording';
import { protectRecording } from '@/lib/protectRecording';
import { prepareRecording } from '@/lib/prepareRecording';
import { LiveRecordingWaveform } from './LiveRecordingWaveform';
import { RecordingPlayer } from './RecordingPlayer';
import { LocalAudio } from './LocalAudio';
import { RECORDING_WARNING_SECONDS } from '@/lib/recordingLimits';

const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const errorText = (e: unknown) => e instanceof Error ? e.message : '录音操作失败，请重试';
const endpoint = (question: string, id?: string) => `/api/interview/recordings?${new URLSearchParams({ question, ...(id ? { id } : {}) })}`;
async function checked(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? '本地保存失败，请重试');
  return body;
}

/** Mount with a stable question key; histories deliberately span all practice dates. */
export function RecordingPanel({ questionKey, historyOnly = false }: { questionKey: string; historyOnly?: boolean }) {
  const [recordings, setRecordings] = useState<InterviewRecording[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'processing' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<CapturedAnswer | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const capture = useRef<InterviewCapture | null>(null);
  const permission = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const saveBusy = useRef(false);
  const refresh = useCallback(async () => {
    const body = await checked(await fetch(endpoint(questionKey), { cache: 'no-store' }));
    if (alive.current) setRecordings(body.recordings);
  }, [questionKey]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    fetch(endpoint(questionKey), { cache: 'no-store', signal: controller.signal })
      .then(checked).then(body => { if (!controller.signal.aborted) setRecordings(body.recordings); })
      .catch(e => { if (!controller.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { alive.current = false; controller.abort(); permission.current?.abort(); capture.current?.cancel(); };
  }, [questionKey]);
  useEffect(() => {
    const updated = (event: Event) => { if ((event as CustomEvent).detail === questionKey) void refresh().catch(() => {}); };
    window.addEventListener('interview:recordings-updated', updated);
    return () => window.removeEventListener('interview:recordings-updated', updated);
  }, [questionKey, refresh]);
  useEffect(() => {
    if (!pending) { setPreview(''); return; }
    const url = URL.createObjectURL(pending.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 'idle' && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase, pending]);
  useEffect(() => {
    if ((phase === 'idle' && !pending) || !panel.current) return;
    return protectRecording(panel.current, () => setError('请先停止并保存录音；未保存的回答可重试保存或下载备份后放弃，再切换页面。'));
  }, [phase, pending]);

  async function save(take: CapturedAnswer) {
    if (saveBusy.current) return;
    saveBusy.current = true;
    setPhase('saving'); setError('');
    try {
      let rec: InterviewRecording = await checked(await fetch(`${endpoint(questionKey, take.id)}&duration=${take.duration}`, {
        method: 'POST', headers: { 'Content-Type': take.blob.type }, body: take.blob,
      }));
      if (!rec.enhancement) {
        if (alive.current) setPhase('processing');
        let prepared: Awaited<ReturnType<typeof prepareRecording>> | undefined;
        try { prepared = await prepareRecording(take.blob); }
        catch { if (alive.current) setError('原始录音已保存。本次自动整理未完成，仍可回放原音。'); }
        if (prepared) {
          const form = new FormData();
          form.set('audio', prepared.audio, 'cleaned.wav');
          form.set('analysis', JSON.stringify(prepared.analysis));
          if (alive.current) setPhase('saving');
          rec = await checked(await fetch(endpoint(questionKey, take.id), { method: 'PUT', body: form }));
        }
      }
      if (!alive.current) return;
      setRecordings(cur => [rec, ...cur.filter(r => r.id !== rec.id)]); setPending(null); setExpanded(true);
      window.dispatchEvent(new CustomEvent('interview:recordings-updated', { detail: questionKey }));
    } catch (e) { if (alive.current) setError(`${errorText(e)}。录音仍可试听、下载或重试保存。`); }
    finally { saveBusy.current = false; if (alive.current) setPhase('idle'); }
  }
  async function start() {
    if (operation.current || pending || phase !== 'idle') return;
    operation.current = true;
    setError(''); setLimitReached(false); setElapsed(0); setPhase('permission');
    const controller = new AbortController();
    permission.current = controller;
    try {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) throw new Error('请通过 localhost 或 127.0.0.1 打开本机页面录音');
      const current = await startInterviewCapture(controller.signal);
      if (!alive.current || controller.signal.aborted) { current.cancel(); return; }
      capture.current = current;
      setPhase('recording');
      void current.finished.then(take => {
        if (!alive.current) return;
        capture.current = null; setLimitReached(!!take.reachedLimit); setPending(take); void save(take);
      }).catch(e => {
        if (alive.current) { setError(errorText(e)); setPhase('idle'); }
      }).finally(() => { operation.current = false; });
    } catch (e) {
      operation.current = false;
      if (alive.current) {
        setPhase('idle');
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '麦克风权限未开启，请在浏览器地址栏允许麦克风后重试' : errorText(e));
      }
    }
  }
  async function change(id: string, method: 'PATCH' | 'DELETE') {
    if (busyId) return;
    setBusyId(id); setError('');
    try {
      const body = await checked(await fetch(endpoint(questionKey, id), {
        method, ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) } : {}),
      }));
      if (!alive.current) return;
      setRecordings(cur => method === 'DELETE' ? cur.filter(r => r.id !== id) : cur.map(r => r.id === id ? body : r));
      setEditing(null); setDeleting(null);
      window.dispatchEvent(new CustomEvent('interview:recordings-updated', { detail: questionKey }));
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setBusyId(null); }
  }

  return <div ref={panel} className="mt-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs" aria-label="本题录音与回放">
    <div className="flex items-center gap-2 flex-wrap">
      {!historyOnly && (phase === 'recording' ? <button type="button" onClick={() => { void capture.current?.stop(); }} className="inline-flex items-center gap-1 rounded bg-rose-600 text-white px-2 py-1.5"><Square className="w-3 h-3" />停止并保存 · {durationLabel(elapsed)}</button>
        : <button type="button" disabled={phase !== 'idle' || !!pending} onClick={() => void start()} className="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-2 py-1.5 disabled:opacity-40">{phase === 'idle' ? <Mic className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}{phase === 'permission' ? '等待麦克风权限…' : phase === 'processing' ? '整理静音与波形…' : phase === 'saving' ? '保存到本机…' : '开始录音'}</button>)}
      <button type="button" onClick={() => setExpanded(v => !v)} className="text-stone-600 hover:text-indigo-700">{expanded ? '收起回放' : `历史录音（${recordings.length}）`}</button>
      <span className="text-[10px] text-stone-400">仅本地 · 每次回答单独保留</span>
      {phase === 'permission' && <button type="button" onClick={() => { permission.current?.abort(); setError('已取消等待；若权限窗口仍在显示，请关闭或拒绝它。'); }}>取消</button>}
    </div>
    {phase === 'recording' && capture.current && <LiveRecordingWaveform stream={capture.current.stream} />}
    {phase === 'recording' && <p className="mt-1 text-stone-500">{elapsed >= RECORDING_WARNING_SECONDS ? '已超过 5 分钟，建议收尾。满 7 分钟将自动停止并保存。' : '单次最多 7 分钟，录完自动整理，原音同时保留。'}</p>}
    {limitReached && <p role="status" className="mt-2 text-amber-700">已到 7 分钟，录音已自动停止。</p>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error} <button type="button" className="underline" onClick={() => void refresh().then(() => setError('')).catch(e => setError(errorText(e)))}>重新加载列表</button></p>}
    {pending && preview && <div className="mt-2 space-y-2">
      <p className="text-amber-700">{phase === 'processing' ? '原始录音已保存，正在本地整理静音…' : phase === 'saving' ? '正在保存这次回答…' : '这次回答尚未完成保存'}</p>
      <LocalAudio key={preview} src={preview} label="试听本次录音" />
      {phase === 'idle' && <div className="flex gap-3"><button type="button" className="text-indigo-700 underline" onClick={() => void save(pending)}>重试保存</button><a href={preview} download={`录音-${Date.now()}.${pending.blob.type.includes('mp4') ? 'm4a' : pending.blob.type.includes('ogg') ? 'ogg' : 'webm'}`} className="underline">下载备份</a><button type="button" className="text-stone-500" onClick={() => setDiscarding(true)}>放弃这次录音</button></div>}
      {discarding && phase === 'idle' && <div className="flex gap-3 text-rose-700"><span>放弃尚未保存的部分？已保存的原音仍会保留。</span><button type="button" onClick={() => { setPending(null); setDiscarding(false); setError(''); void refresh().catch(e => setError(errorText(e))); }}>确认放弃</button><button type="button" onClick={() => setDiscarding(false)}>取消</button></div>}
    </div>}
    {expanded && <div className="mt-2 space-y-3">
      {loading ? <p className="text-stone-400">加载录音…</p> : recordings.length === 0 && <p className="text-stone-400">还没有录音。录下第一遍，再比较下一次表达。</p>}
      {recordings.map(rec => <div key={rec.id} className="border-t border-stone-100 pt-2 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {editing === rec.id ? <><input aria-label="录音名称" value={name} maxLength={120} onChange={e => setName(e.target.value)} className="flex-1 min-w-0 border rounded px-2 py-1" /><button type="button" disabled={!!busyId || !name.trim()} onClick={() => void change(rec.id, 'PATCH')} className="text-indigo-700">保存名称</button><button type="button" onClick={() => setEditing(null)}>取消</button></>
            : <><span className="flex-1 min-w-0 break-words text-stone-700">{rec.name}</span><span className="text-stone-400">{durationLabel(rec.duration)}</span><button type="button" disabled={!!busyId} onClick={() => { setEditing(rec.id); setName(rec.name); }} className="text-stone-500 hover:text-indigo-700">重命名</button><button type="button" disabled={!!busyId} onClick={() => setDeleting(rec.id)} className="text-stone-500 hover:text-rose-700">删除</button></>}
        </div>
        <RecordingPlayer record={rec} src={endpoint(questionKey, rec.id)} onUpdated={updated => { setRecordings(cur => cur.map(r => r.id === updated.id ? updated : r)); window.dispatchEvent(new CustomEvent('interview:recordings-updated', { detail: questionKey })); }} />
        {deleting === rec.id && <div className="flex gap-3 items-center text-rose-700"><span>删除这条本地录音？</span><button type="button" disabled={!!busyId} onClick={() => void change(rec.id, 'DELETE')}>确认删除</button><button type="button" onClick={() => setDeleting(null)} className="text-stone-500">取消</button></div>}
      </div>)}
    </div>}
  </div>;
}
