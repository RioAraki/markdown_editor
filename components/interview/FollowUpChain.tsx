'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { followUpPending, followUpStatus, type FollowUp } from '@shared/interview/stories';
import { RecordingPanel } from './RecordingPanel';
import { AttemptHistory } from './AttemptHistory';
import { CopyInterviewContext } from './CopyInterviewContext';
import { interviewContext, type InterviewContext } from '@/lib/interviewContext';

const LABELS = { todo: '未准备', draft: '有初稿', struggled: '磕磕绊绊', spoken: '已能讲述', skipped: '暂不准备' };
const button = 'text-[11px] px-2 py-1 rounded border border-stone-300 text-stone-600 bg-white hover:border-indigo-400 disabled:opacity-50';
const field = 'w-full px-2.5 py-2 text-xs text-stone-800 placeholder:text-stone-400 leading-relaxed border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
type Patch = Record<string, unknown>;
type Save = (patch: Patch) => Promise<void>;

/** Shared question-owned editor for both the day card and overview. */
export function FollowUpChain({ items, recordingPrefix, storyId, questionId, getQuote, getContext, contextTextRef }: {
  items: FollowUp[]; recordingPrefix: string; storyId: string; questionId: string; getQuote?: () => string;
  getContext?: () => InterviewContext;
  /** Let the main answer's copy button use this same live draft snapshot. */
  contextTextRef?: { current: ((focus?: 'main') => string) | null };
}) {
  const [local, setLocal] = useState(items);
  const [adding, setAdding] = useState(false);
  const [question, setQuestion] = useState('');
  const [quote, setQuote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastAdded, setLastAdded] = useState('');
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const submitting = useRef(false);
  const createId = useRef('');
  const inputId = useId();
  const snapshots = useRef(new Map<string, () => Partial<FollowUp>>());
  const registerDraft = useCallback((id: string, snapshot: () => Partial<FollowUp>) => {
    snapshots.current.set(id, snapshot);
    return () => { if (snapshots.current.get(id) === snapshot) snapshots.current.delete(id); };
  }, []);
  const createDraftKey = `interview-follow-up-create:${storyId}:${questionId}`;
  useEffect(() => {
    const draft = draftObject(createDraftKey);
    if (draft) { setQuestion(draft.question); setQuote(draft.quote); createId.current = draft.id ?? ''; setAdding(true); }
  }, [createDraftKey]);
  const keepCreate = (q: string, source: string) => draftWrite(createDraftKey, JSON.stringify({ question: q, quote: source, id: createId.current }));
  useEffect(() => { if (!pending.current) setLocal(items); }, [items]);
  const save = useCallback<Save>((patch) => {
    pending.current++;
    const operation = queue.current.then(async () => {
      const response = await fetch('/api/interview/stories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, questionId, ...patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败，请重试');
      setLocal(data.answer.followUps ?? []);
    }).finally(() => {
      pending.current--;
      if (!pending.current) window.dispatchEvent(new CustomEvent('interview:stories-updated'));
    });
    queue.current = operation.catch(() => {});
    return operation;
  }, [storyId, questionId]);
  async function create() {
    if (submitting.current || !question.trim()) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      // Stable random decimal ID also works on a LAN HTTP origin; retries reuse it.
      if (!createId.current) createId.current = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString().padStart(10, '0')).join('');
      keepCreate(question, quote);
      await save({ followUpAction: 'create', followUpId: createId.current, followUpQuestion: question.trim(), followUpQuote: quote });
      draftWrite(createDraftKey, null);
      setLastAdded(createId.current); createId.current = ''; setQuestion(''); setQuote(''); setAdding(false); setFilter('all');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { submitting.current = false; setBusy(false); }
  }
  const active = local.filter(f => !f.deleted);
  const remaining = active.filter(followUpPending).length;
  const shown = local.filter(f => filter === 'removed' ? f.deleted : !f.deleted && (filter !== 'pending' || followUpPending(f)));
  function contextText(focus?: 'main') {
    const all = local.filter(f => !f.deleted).map(f => {
      const key = `interview-follow-up-draft:${recordingPrefix}-followup-${f.id.replaceAll('.', '-')}`;
      const answerDraft = draftRead(key);
      const editDraft = draftObject(`${key}:question`);
      return { ...f, ...(answerDraft !== null ? { answer: answerDraft } : {}),
        ...(editDraft ? { q: editDraft.question, quote: editDraft.quote } : {}), ...snapshots.current.get(f.id)?.() };
    });
    if ((question.trim() || quote.trim()) && !all.some(f => f.id === createId.current)) all.push({ id: 'unsaved', q: question, quote, status: 'todo' });
    return interviewContext(getContext?.() ?? { question: questionId }, all, focus);
  }
  useEffect(() => {
    if (!contextTextRef) return;
    contextTextRef.current = contextText;
    return () => { if (contextTextRef.current === contextText) contextTextRef.current = null; };
  }, [contextTextRef, contextText]);
  return <section className="mt-3 border-t border-stone-200 pt-3 space-y-2" aria-label="Follow Up 追问">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <span className="text-xs font-medium text-stone-700">Follow Up <span className="text-[11px] font-normal text-stone-400">{active.length} 条 · {remaining} 条待准备</span></span>
      <div className="flex items-center gap-2 flex-wrap">
        {getQuote && <button type="button" className={button} disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => { const source = getQuote(); setQuote(source); keepCreate(question, source); setAdding(true); }}>引用选中的原话</button>}
        <button type="button" className={button + ' border-indigo-300 text-indigo-700'} disabled={busy} onClick={() => setAdding(true)}>＋ 记一个追问</button>
      </div>
    </div>
    <p className="text-[10px] text-stone-400">只写问题即可保存，何时准备由你决定。追问状态不影响主问题，也不会自动排入每日任务。</p>
    {getContext && <CopyInterviewContext getText={contextText} />}
    {adding && <form className="rounded border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-2" onSubmit={e => { e.preventDefault(); void create(); }}>
      <label htmlFor={inputId} className="text-[11px] text-stone-600">可能被追问什么？</label>
      <input id={inputId} aria-label="追问问题" className={field} required maxLength={2000} value={question} disabled={busy} onChange={e => { setQuestion(e.target.value); keepCreate(e.target.value, quote); }} placeholder="例如：选错模块后，怎么发现并纠正？" autoFocus />
      <label className="block text-[11px] text-stone-500">触发追问的原话（可选）<textarea aria-label="触发追问的原话" className={field + ' mt-1'} rows={2} maxLength={10000} value={quote} disabled={busy} onChange={e => { setQuote(e.target.value); keepCreate(question, e.target.value); }} placeholder="保留当时的原话，之后修改主答案也不会丢失上下文" /></label>
      <div className="flex gap-2"><button type="submit" className={button} disabled={busy || !question.trim()}>{busy ? '保存中…' : '记下来'}</button><button type="button" className={button} disabled={busy} onClick={() => { setAdding(false); setError(''); }}>收起草稿</button></div>
      {error && <p role="alert" className="text-xs text-rose-700">{error} · 输入已保留，可再次点击「记下来」。</p>}
    </form>}
    {local.length > 0 && <label className="block text-[11px] text-stone-500">查看 <select aria-label="筛选追问" value={filter} onChange={e => setFilter(e.target.value)} className="rounded border border-stone-200 bg-white px-1 py-0.5"><option value="all">全部追问</option><option value="pending">待准备</option><option value="removed">已移除（可恢复）</option></select></label>}
    {shown.map(f => <FollowUpItem key={f.id} f={f} initiallyOpen={lastAdded === f.id} onSave={save} registerDraft={registerDraft} recordingKey={/^\d+(?:\.\d+)*$/.test(f.id) ? `${recordingPrefix}-followup-${f.id.replaceAll('.', '-')}` : undefined} />)}
    {shown.length === 0 && <p className="text-[11px] text-stone-400">{filter === 'pending' ? '目前没有待准备的追问。' : filter === 'removed' ? '没有已移除的追问。' : '想到可能被问的细节，就先记在这里。'}</p>}
  </section>;
}

function draftRead(key: string) { try { return window.sessionStorage.getItem(key); } catch { return null; } }
function draftWrite(key: string, text: string | null) { try { if (text === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, text); } catch { /* Keep the in-memory draft when storage is unavailable. */ } }
function draftObject(key: string): { question: string; quote: string; id?: string } | null {
  try { const value = JSON.parse(draftRead(key) ?? 'null'); return value && typeof value.question === 'string' && typeof value.quote === 'string' ? value : null; } catch { return null; }
}

export function FollowUpItem({ f, recordingKey, initiallyOpen, onSave, registerDraft }: { f: FollowUp; recordingKey?: string; initiallyOpen?: boolean; onSave: Save; registerDraft?: (id: string, snapshot: () => Partial<FollowUp>) => () => void }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(f.q);
  const [quote, setQuote] = useState(f.quote ?? '');
  const [text, setText] = useState(f.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dirty = useRef(false);
  const editVersion = useRef(0);
  const latest = useRef(f.answer ?? '');
  const draftKey = `interview-follow-up-draft:${recordingKey ?? f.id}`;
  const editDraftKey = `${draftKey}:question`;
  const keepEdit = (q: string, source: string) => draftWrite(editDraftKey, JSON.stringify({ question: q, quote: source }));
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const activeWrites = useRef(0);
  const mounted = useRef(true);
  const snapshot = useRef<Partial<FollowUp>>({});
  snapshot.current = { ...(dirty.current ? { answer: latest.current } : {}), ...(editing ? { q: question, quote } : {}) };
  useEffect(() => registerDraft?.(f.id, () => snapshot.current), [f.id, registerDraft]);
  useEffect(() => { if (!dirty.current) { latest.current = f.answer ?? ''; setText(latest.current); } }, [f.answer]);
  useEffect(() => { if (!editing) { setQuestion(f.q); setQuote(f.quote ?? ''); } }, [f.q, f.quote, editing]);
  const commit = useCallback(async (patch: Patch = {}) => {
    const answer = latest.current;
    const version = editVersion.current;
    const payload: Patch = { followUpAction: 'update', followUpId: f.id, ...patch };
    if (dirty.current) payload.followUpAnswer = answer;
    if (Object.keys(payload).length === 2) return;
    activeWrites.current++; if (mounted.current) { setBusy(true); setError(''); }
    try {
      await saveRef.current(payload);
      if (typeof payload.followUpAnswer === 'string' && editVersion.current === version) { dirty.current = false; draftWrite(draftKey, null); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败，请重试'); throw e; }
    finally { activeWrites.current--; if (mounted.current) setBusy(activeWrites.current > 0); }
  }, [f.id, draftKey]);
  useEffect(() => {
    mounted.current = true;
    const draft = draftRead(draftKey);
    if (draft !== null) { dirty.current = true; editVersion.current++; latest.current = draft; setText(draft); }
    const editDraft = draftObject(editDraftKey);
    if (editDraft) { setQuestion(editDraft.question); setQuote(editDraft.quote); setEditing(true); setOpen(true); }
    return () => { mounted.current = false; if (dirty.current) void commit().catch(() => {}); };
  }, [draftKey, editDraftKey, commit]);
  useEffect(() => { if (!dirty.current) return; const timer = setTimeout(() => void commit().catch(() => {}), 1500); return () => clearTimeout(timer); }, [text, commit]);
  function close() { if (dirty.current) void commit().catch(() => {}); setOpen(value => !value); }
  return <div className="rounded border border-stone-200 border-l-2 border-l-indigo-200 bg-white">
    <button type="button" aria-expanded={open} onClick={close} className="w-full text-left p-2.5 flex items-start gap-2 text-xs">
      <span className="flex-1 min-w-0 break-words">{f.q}</span><span className={`shrink-0 text-[10px] ${followUpPending(f) ? 'text-amber-700' : 'text-stone-400'}`}>{f.deleted ? '已移除' : LABELS[followUpStatus(f)]}</span><span className="text-stone-400">{open ? '▾' : '▸'}</span>
    </button>
    {open && <div className="px-2.5 pb-2.5 space-y-2">
      {f.quote && <blockquote className="border-l-2 border-stone-200 pl-2 text-[11px] text-stone-500 whitespace-pre-wrap">来源原话：{f.quote}</blockquote>}
      {f.why && <p className="text-[11px] text-stone-400">为什么问：{f.why}</p>}
      {editing && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void commit({ followUpQuestion: question, followUpQuote: quote }).then(() => { draftWrite(editDraftKey, null); setEditing(false); }).catch(() => {}); }}>
        <input aria-label="编辑追问问题" className={field} value={question} required disabled={busy} maxLength={2000} onChange={e => { setQuestion(e.target.value); keepEdit(e.target.value, quote); }} />
        <textarea aria-label="编辑来源原话" className={field} value={quote} disabled={busy} maxLength={10000} rows={2} onChange={e => { setQuote(e.target.value); keepEdit(question, e.target.value); }} />
        <button type="submit" className={button} disabled={busy || !question.trim()}>保存问题</button> <button type="button" className={button} disabled={busy} onClick={() => { draftWrite(editDraftKey, null); setEditing(false); }}>取消编辑</button>
      </form>}
      <label className="block text-[11px] text-stone-400">准备笔记 / 我的回答 · 自动保存<textarea aria-label="追问答案" className={field + ' mt-1'} rows={3} value={text} disabled={!!f.deleted} onChange={e => { dirty.current = true; editVersion.current++; latest.current = e.target.value; draftWrite(draftKey, e.target.value); setText(e.target.value); }} onBlur={() => { if (dirty.current) void commit().catch(() => {}); }} placeholder="先记问题，等有时间再准备答案或录音。" /></label>
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-[11px] text-stone-500">状态 <select aria-label="追问准备状态" value={followUpStatus(f)} disabled={busy || !!f.deleted} className="border border-stone-200 rounded p-1 bg-white" onChange={e => { void commit({ followUpStatus: e.target.value }).catch(() => {}); }}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {!f.deleted && <button type="button" className={button} disabled={busy} onClick={() => setEditing(value => !value)}>编辑问题</button>}
        {f.deleted ? <button type="button" className={button} disabled={busy} onClick={() => void commit({ followUpAction: 'restore' }).catch(() => {})}>恢复追问</button> : <button type="button" className={button} disabled={busy} onClick={() => setConfirmRemove(true)}>移除</button>}
        <span className="text-[10px] text-stone-400">{busy ? '保存中…' : dirty.current ? '待保存' : '已保存'}</span>
      </div>
      {confirmRemove && <div className="p-2 rounded bg-amber-50 text-[11px] text-amber-800">从列表移除这条追问？文字和录音会保留，可在「已移除」中恢复。<div className="flex gap-2 mt-1"><button type="button" className={button} disabled={busy} onClick={() => void commit({ followUpAction: 'delete' }).then(() => setConfirmRemove(false)).catch(() => {})}>确认移除</button><button type="button" className={button} onClick={() => setConfirmRemove(false)}>取消</button></div></div>}
      {error && <p role="alert" className="text-xs text-rose-700">{error} · 草稿已保留。<button type="button" className={button} disabled={busy} onClick={() => void commit().catch(() => {})}>重试保存答案</button></p>}
      <AttemptHistory entries={(f.revisions ?? []).map(r => ({ date: r.date, text: r.text }))} label="以前的答案" />
      {recordingKey && <RecordingPanel questionKey={recordingKey} historyOnly={!!f.deleted} />}
    </div>}
  </div>;
}
