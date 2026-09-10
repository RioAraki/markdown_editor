import { encodeWave, tidyAudio, waveformPeaks, type CleanupStrength } from './audioProcessing';
import type { RecordingEnhancement } from '@/types/recording';
import { queueAudioProcessing } from './audioResources';
import { MAX_RECORDING_SECONDS } from './recordingLimits';

export function prepareRecording(source: Blob | (() => Promise<Blob>), strength: CleanupStrength = 'standard'): Promise<{ audio: Blob; analysis: RecordingEnhancement }> {
  return queueAudioProcessing(async () => prepare(await (typeof source === 'function' ? source() : source), strength));
}

async function prepare(blob: Blob, strength: CleanupStrength): Promise<{ audio: Blob; analysis: RecordingEnhancement }> {
  // Offline decoding performs no playback and sends nothing off this computer.
  const context = new OfflineAudioContext(1, 1, 24000);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration > MAX_RECORDING_SECONDS + 1) throw new Error('超过 7 分钟的旧录音请回听原音，暂不自动整理');
  const samples = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / decoded.numberOfChannels;
  }
  // Yield before CPU work so the processing state can paint.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const result = tidyAudio(samples, decoded.sampleRate, strength);
  const audio = new Blob([encodeWave(result.samples, decoded.sampleRate)], { type: 'audio/wav' });
  return { audio, analysis: {
    version: 2, strength, status: result.status, duration: result.samples.length / decoded.sampleRate,
    originalDuration: decoded.duration, removedSeconds: result.removedSeconds,
    waveform: result.waveform, originalWaveform: waveformPeaks(samples),
  } };
}
