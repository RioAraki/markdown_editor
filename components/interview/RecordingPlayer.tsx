'use client';

import { useEffect, useRef, useState } from 'react';
import type { InterviewRecording } from '@/types/recording';
import { prepareRecording } from '@/lib/prepareRecording';

const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

export function RecordingPlayer({ record, src }: { record: InterviewRecording; src: string }) {
  const [original, setOriginal] = useState(!record.enhancement);
  const [position, setPosition] = useState(0);
  const [legacyPeaks, setLegacyPeaks] = useState<number[]>();
  const [legacyDuration, setLegacyDuration] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const enhancement = record.enhancement;
  const peaks = enhancement ? original ? enhancement.originalWaveform : enhancement.waveform : legacyPeaks;
  const duration = enhancement ? original ? enhancement.originalDuration : enhancement.duration : legacyDuration ?? record.duration;
  const media = original ? src : `${src}&variant=cleaned`;
  async function buildLegacyWaveform() {
    setLoading(true); setError('');
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error('读取原始录音失败');
      const result = await prepareRecording(await response.blob());
      if (alive.current) { setLegacyPeaks(result.analysis.originalWaveform); setLegacyDuration(result.analysis.originalDuration); }
    } catch { if (alive.current) setError('无法生成这条旧录音的波形，仍可使用播放器回放。'); }
    finally { if (alive.current) setLoading(false); }
  }
  return <div className="space-y-1.5">
    {enhancement && <div className="flex items-center gap-2 flex-wrap text-[10px]">
      <div className="inline-flex rounded border border-stone-200 overflow-hidden">
        {[false, true].map(value => <button key={String(value)} type="button" aria-pressed={original === value} onClick={() => { audio.current?.pause(); setPosition(0); setOriginal(value); setError(''); }} className={`px-2 py-1 ${original === value ? 'bg-indigo-50 text-indigo-700' : 'text-stone-500'}`}>{value ? '原始版' : '整理版'}</button>)}
      </div>
      <span className="text-stone-400">{enhancement.status === 'trimmed' ? `缩短 ${enhancement.removedSeconds.toFixed(1)} 秒空白 · ${clock(enhancement.originalDuration)} → ${clock(enhancement.duration)}` : enhancement.status === 'quiet' ? '音量较轻，保留完整回答' : '未发现明显长空白，保留自然停顿'}</span>
    </div>}
    {peaks ? <div className="relative rounded bg-stone-50 overflow-hidden h-14">
      <svg viewBox="0 0 720 56" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label={original ? '原始录音波形' : '整理后录音波形'}>
        {peaks.map((peak, i) => { const h = Math.max(2, Math.pow(peak, .6) * 48); return <rect key={i} x={i * 3} y={(56 - h) / 2} width="2" height={h} rx="1" fill={i / peaks.length <= position / Math.max(duration, .001) ? '#4f46e5' : '#a5b4fc'} />; })}
        <line x1={Math.min(720, position / Math.max(duration, .001) * 720)} x2={Math.min(720, position / Math.max(duration, .001) * 720)} y1="2" y2="54" stroke="#4338ca" strokeWidth="2" />
      </svg>
      <input type="range" min="0" max={Math.max(.001, duration)} step="0.01" value={Math.min(position, duration)} aria-label="波形播放位置" aria-valuetext={`${clock(position)} / ${clock(duration)}`} title="点击波形跳到对应位置，也可用方向键调整" onChange={e => {
        const time = Number(e.target.value);
        if (audio.current && audio.current.readyState >= 1) { audio.current.currentTime = time; setPosition(time); }
      }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus:opacity-20" />
    </div> : <button type="button" disabled={loading} onClick={() => void buildLegacyWaveform()} className="text-[10px] text-indigo-600">{loading ? '生成波形…' : '为这条旧录音生成波形'}</button>}
    {peaks && <div className="flex justify-between text-[10px] text-stone-400"><span>点击波形定位 · 波形高度反映音量</span><span>{clock(position)} / {clock(duration)}</span></div>}
    <audio ref={audio} key={media} controls preload="metadata" src={media} className="w-full h-9" aria-label={`播放 ${record.name}`} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onError={() => setError('音频读取失败，请刷新列表后重试。')} />
    {error && <p className="text-[10px] text-rose-600">{error}</p>}
  </div>;
}
