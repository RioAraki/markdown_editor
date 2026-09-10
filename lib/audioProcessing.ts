/** Local noise-aware pause editing. Never tries to identify words. */
export function waveformPeaks(samples: Float32Array, bars = 240): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const start = Math.floor(i * samples.length / bars);
    const end = Math.floor((i + 1) * samples.length / bars);
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
    return Math.round(Math.min(1, peak) * 10000) / 10000;
  });
}

export type CleanupStrength = 'standard' | 'compact';

// Protect quiet voiced syllables using periodicity, rather than interpreting
// every low-amplitude frame as background noise. Downsample only this analysis.
function voicedFrame(samples: Float32Array, start: number, end: number, sampleRate: number) {
  const stride = Math.max(1, Math.floor(sampleRate / 8000));
  const frame = [];
  for (let i = start; i < end; i += stride) frame.push(samples[i]);
  const mean = frame.reduce((s, v) => s + v, 0) / frame.length;
  for (let i = 0; i < frame.length; i++) frame[i] -= mean;
  const rate = sampleRate / stride;
  for (let lag = Math.max(2, Math.floor(rate / 420)); lag <= Math.min(frame.length / 2, Math.ceil(rate / 80)); lag++) {
    let dot = 0, a = 0, b = 0;
    for (let i = lag; i < frame.length; i++) { dot += frame[i] * frame[i - lag]; a += frame[i] ** 2; b += frame[i - lag] ** 2; }
    if (a > 0 && b > 0 && dot / Math.sqrt(a * b) > .65) return true;
  }
  return false;
}

export function tidyAudio(samples: Float32Array, sampleRate: number, strength: CleanupStrength = 'standard') {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('无效的采样率');
  const frameSize = Math.max(1, Math.round(sampleRate * .02));
  const rms: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let energy = 0;
    for (let j = start; j < end; j++) energy += samples[j] * samples[j];
    rms.push(Math.sqrt(energy / (end - start)));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * .2)] ?? 0;
  const threshold = strength === 'compact' ? Math.min(.025, Math.max(.009, floor * 3)) : Math.min(.016, Math.max(.005, floor * 2));
  if (rms.every(value => value < .003)) return {
    samples, status: 'quiet' as const, removedSeconds: 0, waveform: waveformPeaks(samples),
  };
  const ranges: [number, number][] = [];
  const padding = strength === 'compact' ? 3 : 5;
  const mergeGap = strength === 'compact' ? 6 : 12;
  for (let i = 0; i < rms.length; i++) {
    // Use ~40 ms of context for pitch protection: 20 ms alone cannot establish
    // periodicity for low (80 Hz) voices with enough overlapping samples.
    if (rms[i] < threshold && !(rms[i] >= .00015 && voicedFrame(samples, Math.max(0, i * frameSize - Math.floor(frameSize / 2)), Math.min(samples.length, (i + 1) * frameSize + Math.floor(frameSize / 2)), sampleRate))) continue;
    const start = Math.max(0, i - padding);
    const end = Math.min(rms.length, i + padding + 1);
    const last = ranges[ranges.length - 1];
    if (last && start - last[1] <= mergeGap) last[1] = end;
    else ranges.push([start, end]);
  }
  if (!ranges.length) return {
    samples, status: 'quiet' as const, removedSeconds: 0, waveform: waveformPeaks(samples),
  };
  // Include a small quiet join between phrases, in addition to speech padding.
  const join = strength === 'compact' ? 1 : 2;
  for (let i = 1; i < ranges.length; i++) { ranges[i - 1][1] += join; ranges[i][0] -= join; }
  const spans = ranges.map(([a, b]) => [a * frameSize, Math.min(samples.length, b * frameSize)] as const);
  const length = spans.reduce((sum, [a, b]) => sum + b - a, 0);
  if (length === samples.length) return { samples, status: 'unchanged' as const, removedSeconds: 0, waveform: waveformPeaks(samples) };
  const output = new Float32Array(length);
  let offset = 0;
  for (const [start, end] of spans) {
    output.set(samples.subarray(start, end), offset);
    // Tiny fades at cut boundaries avoid clicks; these are in the padded quiet regions.
    const fade = Math.min(Math.round(sampleRate * .003), Math.floor((end - start) / 2));
    for (let j = 0; j < fade; j++) {
      if (start > 0) output[offset + j] *= j / fade;
      if (end < samples.length) output[offset + end - start - 1 - j] *= j / fade;
    }
    offset += end - start;
  }
  return { samples: output, status: 'trimmed' as const, removedSeconds: (samples.length - output.length) / sampleRate, waveform: waveformPeaks(output) };
}

/** Mono PCM WAV is seekable without any browser encoder or external service. */
export function encodeWave(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const v = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true); }
  return buffer;
}
