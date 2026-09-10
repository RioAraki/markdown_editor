export interface InterviewRecording {
  id: string;
  name: string;
  createdAt: string;
  duration: number;
  mimeType: string;
  size: number;
  enhancement?: RecordingEnhancement;
}

export interface RecordingEnhancement {
  version: 1;
  status: 'trimmed' | 'unchanged' | 'quiet';
  duration: number;
  originalDuration: number;
  removedSeconds: number;
  waveform: number[];
  originalWaveform: number[];
}
