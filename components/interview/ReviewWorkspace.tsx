'use client';

import { useEffect, useRef, useState } from 'react';
import type { Question } from '@shared/interview/qbank';
import { REVIEW_BANKS, REVIEW_LABELS, type ReviewEntry, type ReviewRound, type ReviewStatus, type ReviewStore } from '@/types/interviewReview';

type ReviewData = { questions: Question[]; log: Record<string, { answers: { date: string; text: string }[] }>; store: ReviewStore };
const button = 'rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:border-indigo-400 disabled:opacity-50';
const timestamp = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
// Works on LAN HTTP as well as localhost, where crypto.randomUUID may be absent.
const makeId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');

export function ReviewWorkspace() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(new Set<string>());
  const writing = useRef(false);
  const allowLeave = () => !dirty.current.size || window.confirm('有尚未保存的复习回答，确定放弃这些修改？');
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function load() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/interview/review', { cache: 'no-store' });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error);
      setData(value);
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); }
    finally { setBusy(false); }
  }
  async function write(patch: Record<string, unknown>, revision?: number): Promise<ReviewStore | null> {
    if (!data || writing.current) return null;
    writing.current = true;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/interview/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision ?? data.store.revision, ...patch }) });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error);
      setData(current => current ? { ...current, store: value.store } : current);
      return value.store;
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); return null; }
    finally { writing.current = false; setBusy(false); }
  }
  return <section className="rounded-lg border border-indigo-200 bg-white p-4 space-y-3">
    <button className="w-full flex justify-between text-left text-sm font-medium text-indigo-700" disabled={busy} onClick={() => {
      if (open && !allowLeave()) return;
      dirty.current.clear(); setOpen(!open); if (!open) void load();
    }}><span>自主复习 · 全部题目，按自己的节奏</span><span>{open ? '收起 ▴' : '展开 ▾'}</span></button>
    {open && <>
      <p className="text-xs text-stone-500">跨天接着复习，不自动分配题量。未标注就是未复习；写回答不会自动完成，也不会加入重做排程。</p>
      {error && <p role="alert" className="text-sm text-red-700">{error} <button className={button} disabled={busy} onClick={() => void load()}>重新加载记录</button></p>}
      {busy && <p role="status" className="text-xs text-indigo-700">正在加载 / 保存…</p>}
      {data && Object.entries(REVIEW_BANKS).map(([bank, label]) => <ReviewBank key={bank} bank={bank} label={label} data={data} busy={busy} write={write}
        onDirty={(id, value) => { if (value) dirty.current.add(id); else dirty.current.delete(id); }} />)}
    </>}
  </section>;
}

function ReviewBank({ bank, label, data, busy, write, onDirty }: {
  bank: string; label: string; data: ReviewData; busy: boolean;
  write: (patch: Record<string, unknown>, revision?: number) => Promise<ReviewStore | null>;
  onDirty: (id: string, value: boolean) => void;
}) {
  const [visited, setVisited] = useState(false);
  const [confirmRound, setConfirmRound] = useState(false);
  const draftIds = useRef(new Set<string>());
  const startId = useRef<string | null>(null);
  const questions = data.questions.filter(q => (q.bank ?? 'agent') === bank).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const rounds = data.store.rounds.filter(r => r.bank === bank);
  const round = rounds.at(-1);
  const reviewed = questions.filter(q => round?.entries[q.id]?.status).length;
  const learned = questions.filter(q => data.log[q.id]?.answers.length).length;
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const category = q.category || '未分类';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(q);
  }
  async function start() {
    startId.current ??= makeId();
    const store = await write({ action: 'start', bank, roundId: startId.current });
    if (store) startId.current = null;
    return store;
  }
  async function save(questionId: string, attemptId: string, text: string, status: ReviewStatus) {
    // Browsing needs no saved session; first explicit save starts the first round.
    const store = round ? null : await start();
    const current = round ?? store?.rounds.filter(r => r.bank === bank).at(-1);
    if (!current) return false;
    return !!await write({ action: 'save', roundId: current.id, questionId, attemptId, text, status }, store?.revision);
  }
  async function newRound() {
    if (draftIds.current.size && !window.confirm('本门类有尚未保存的回答，确定放弃修改并开启新一轮？')) return;
    if (await start()) {
      draftIds.current.forEach(id => onDirty(id, false)); draftIds.current.clear(); setConfirmRound(false);
    }
  }
  return <details onToggle={e => { if (e.target === e.currentTarget && e.currentTarget.open) setVisited(true); }} className="rounded-lg border border-stone-200 bg-white">
    <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-stone-800">{label}<span className="ml-2 text-xs font-normal text-indigo-700">已复习 {reviewed}/{questions.length} 题</span></summary>
    {visited && <div className="border-t border-stone-200 p-3 space-y-3">
      <p className="text-xs text-emerald-700">首次学习：{learned === questions.length && questions.length ? '已全部完成' : '进行中'} · {learned}/{questions.length} 题</p>
      <div className="flex items-center flex-wrap gap-3 text-xs text-stone-600"><span>{round ? `第 ${rounds.length} 轮` : '尚未开始 · 保存回答或标注时开始第一轮'} · 按主题展示全部题目</span>{round && <button className={button} disabled={busy} onClick={() => setConfirmRound(true)}>开启新一轮</button>}</div>
      {confirmRound && <div className="rounded border border-indigo-200 p-3 text-sm text-stone-700">新一轮只重置本门类标记，保留全部历史回答。<div className="flex gap-2 mt-2"><button className={button} disabled={busy} onClick={() => void newRound()}>确认开启新一轮</button><button className={button} onClick={() => setConfirmRound(false)}>取消</button></div></div>}
      {!questions.length && <p className="text-xs text-stone-500">该门类暂无题目</p>}
      <div key={rounds.length <= 1 ? 'first' : round!.id} className="space-y-3">{[...groups].map(([category, qs]) => <details key={category} className="rounded border border-indigo-100 bg-indigo-50/30" open>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-indigo-800">{category}<span className="ml-2 text-xs font-normal">已复习 {qs.filter(q => round?.entries[q.id]?.status).length}/{qs.length} 题</span></summary>
        <div className="p-2 pt-0 space-y-2">{qs.map((q, i) => <ReviewQuestion key={q.id} question={q} index={i + 1} entry={round?.entries[q.id]} rounds={rounds} original={data.log[q.id]?.answers ?? []} busy={busy} breadcrumb={`${label} / ${category}`}
          onDirty={value => { if (value) draftIds.current.add(q.id); else draftIds.current.delete(q.id); onDirty(q.id, value); }}
          onSave={(attemptId, text, status) => save(q.id, attemptId, text, status)} />)}</div>
      </details>)}</div>
    </div>}
  </details>;
}

function ReviewQuestion({ question: q, index, entry, rounds, original, busy, onSave, onDirty, breadcrumb }: {
  question: Question; index: number; entry?: ReviewEntry; rounds: ReviewRound[]; breadcrumb: string;
  original: { date: string; text: string }[]; busy: boolean;
  onSave: (id: string, text: string, status: ReviewStatus) => Promise<boolean>;
  onDirty: (value: boolean) => void;
}) {
  const last = entry?.attempts.at(-1);
  const [attemptId, setAttemptId] = useState(() => last?.id ?? makeId());
  const [text, setText] = useState(last?.text ?? '');
  const [status, setStatus] = useState<ReviewStatus>(entry?.status ?? '');
  const [unsaved, setUnsaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!unsaved) {
      const current = entry?.attempts.find(a => a.id === attemptId);
      if (current) setText(current.text);
      setStatus(entry?.status ?? '');
    }
  }, [entry, attemptId, unsaved]);
  const changed = () => { setUnsaved(true); setSaved(false); onDirty(true); };
  async function save() {
    if (await onSave(attemptId, text, status)) { setUnsaved(false); setSaved(true); onDirty(false); }
  }
  return <details onToggle={e => { if (e.target === e.currentTarget) setExpanded(e.currentTarget.open); }} className="rounded-lg border border-stone-200 bg-stone-50/50 p-3">
    <summary className="cursor-pointer text-sm text-stone-800"><span className="font-mono text-indigo-600 mr-2">{index}</span>{q.question}<span className="ml-2 text-xs text-indigo-700">{REVIEW_LABELS[entry?.status ?? '']}{unsaved ? ' · 有未保存修改' : ''}</span></summary>
    {expanded && <div className="mt-3 space-y-3">
      <p className="text-xs text-stone-500">{breadcrumb}</p>
      <label className="block text-xs text-stone-700">本次回答 · 保存草稿不会标记为已复习
        <textarea disabled={busy} value={text} onChange={e => { setText(e.target.value); changed(); }} rows={5} placeholder="先试着回忆，写要点或完整回答。点击保存后跨天保留。" className="mt-1 w-full rounded border border-stone-300 bg-white p-2 text-sm !text-stone-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </label>
      <div className="flex items-center flex-wrap gap-2">
        <label className="text-xs text-stone-700">手动标注 <select disabled={busy} value={status} onChange={e => { setStatus(e.target.value as ReviewStatus); changed(); }} className="border rounded p-1 bg-white text-stone-800">{Object.entries(REVIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button disabled={busy} onClick={() => void save()} className={`${button} !text-indigo-700`}>保存回答与标注</button>
        <button disabled={busy || unsaved || !entry?.attempts.some(a => a.id === attemptId && a.text.trim())} className={button} onClick={() => { setAttemptId(makeId()); setText(''); setSaved(false); }}>再答一次</button>
        <span className="text-xs text-stone-500">{unsaved ? '尚未保存' : saved ? '已保存' : ''}</span>
      </div>
      <details className="rounded border border-emerald-200 bg-emerald-50 p-2"><summary className="cursor-pointer text-xs text-emerald-800">查看{q.bank === 'depth' ? '准备提示' : '参考答案'}</summary><div className="mt-2 whitespace-pre-wrap text-sm text-emerald-950">{q.answer || '暂无参考答案'}</div></details>
      <details className="rounded border border-stone-200 bg-white p-2"><summary className="cursor-pointer text-xs text-stone-700">历史回答与复习记录（{original.length + rounds.reduce((n, r) => n + (r.entries[q.id]?.attempts.length ?? 0), 0)} 次）</summary>
        <div className="space-y-3 mt-2 text-sm text-stone-900">{[...rounds].reverse().map(r => {
          const e = r.entries[q.id]; if (!e) return null;
          return <div key={r.id}><p className="text-xs text-indigo-700">第 {rounds.indexOf(r) + 1} 轮 · {REVIEW_LABELS[e.status]}</p>{[...e.attempts].reverse().map(a => <div key={a.id} className="border-l-2 border-indigo-100 pl-2 my-2"><p className="text-xs text-stone-500">初次保存 {timestamp(a.createdAt)} · 最后修改 {timestamp(a.updatedAt)}</p><p className="whitespace-pre-wrap">{a.text || '（空回答）'}</p></div>)}</div>;
        })}{[...original].reverse().map((a, i) => <div key={`${a.date}:${i}`} className="border-l-2 border-stone-200 pl-2"><p className="text-xs text-stone-500">首次学习记录 · {a.date}</p><p className="whitespace-pre-wrap">{a.text}</p></div>)}</div>
      </details>
    </div>}
  </details>;
}
