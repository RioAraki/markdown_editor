'use client';

import { useEffect, useState } from 'react';

export function LiveRecordingWaveform({ stream }: { stream: MediaStream }) {
  const [levels, setLevels] = useState<number[]>(Array(80).fill(0));
  const [peak, setPeak] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    try {
      context = new AudioContext();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser); // never connect the microphone to speakers
      const samples = new Float32Array(analyser.fftSize);
      void context.resume().catch(() => { if (!disposed) setUnavailable(true); });
      timer = setInterval(() => {
        analyser!.getFloatTimeDomainData(samples);
        let max = 0;
        for (const sample of samples) max = Math.max(max, Math.abs(sample));
        setPeak(max);
        setLevels(cur => [...cur.slice(1), max]);
      }, 60);
    } catch { setUnavailable(true); }
    return () => { disposed = true; clearInterval(timer); source?.disconnect(); analyser?.disconnect(); void context?.close().catch(() => {}); };
  }, [stream]);
  const tone = peak > .97 ? 'text-amber-600' : peak < .005 ? 'text-stone-400' : 'text-indigo-600';
  return <div className="mt-3 rounded-md bg-indigo-50/60 px-2 py-2" aria-label="实时收音波形">
    <div className="flex justify-between text-[10px] mb-1"><span className="text-stone-500">实时收音 · 最近约 5 秒</span><span className={tone}>{unavailable ? '波形不可用，录音仍在继续' : peak > .97 ? '音量偏大，请稍微远离麦克风' : peak < .005 ? '声音很轻 / 当前安静' : '正在收音'}</span></div>
    <svg viewBox="0 0 480 48" preserveAspectRatio="none" className="w-full h-12" role="img" aria-label="声音越强，波形越高">
      {levels.map((value, i) => { const height = Math.max(2, Math.pow(Math.min(1, value), .6) * 44); return <rect key={i} x={i * 6 + 1} y={(48 - height) / 2} width="3" height={height} rx="1.5" fill={value > .97 ? '#d97706' : '#6366f1'} opacity={.25 + i / 110} />; })}
    </svg>
  </div>;
}
