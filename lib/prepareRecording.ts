import { encodeWave, tidyAudio, waveformPeaks } from './audioProcessing';
import type { RecordingEnhancement } from '@/types/recording';

export async function prepareRecording(blob: Blob): Promise<{ audio: Blob; analysis: RecordingEnhancement }> {
  // Offline decoding performs no playback and sends nothing off this computer.
  const context = new OfflineAudioContext(1, 1, 24000);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const samples = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / decoded.numberOfChannels;
  }
  // Yield before CPU work so the processing state can paint.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const result = tidyAudio(samples, decoded.sampleRate);
  const audio = new Blob([encodeWave(result.samples, decoded.sampleRate)], { type: 'audio/wav' });
  return { audio, analysis: {
    version: 1, status: result.status, duration: result.samples.length / decoded.sampleRate,
    originalDuration: decoded.duration, removedSeconds: result.removedSeconds,
    waveform: result.waveform, originalWaveform: waveformPeaks(samples),
  } };
}
