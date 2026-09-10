export interface CapturedAnswer { id: string; blob: Blob; duration: number }
export interface InterviewCapture {
  stream: MediaStream;
  finished: Promise<CapturedAnswer>;
  stop: () => Promise<CapturedAnswer>;
  cancel: () => void;
}
let microphoneBusy = false;

/** The browser device boundary is separate so lifecycle and late permission are testable. */
export async function startInterviewCapture(signal: AbortSignal): Promise<InterviewCapture> {
  if (microphoneBusy) throw new Error('另一道题正在录音，请先停止那条录音');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('请使用支持录音的浏览器，并通过 localhost 打开页面');
  }
  microphoneBusy = true;
  let stream: MediaStream | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    stream?.getTracks().forEach(track => track.stop());
    microphoneBusy = false;
  };
  try {
    const requested = navigator.mediaDevices.getUserMedia({ audio: true });
    stream = await new Promise<MediaStream>((resolve, reject) => {
      const abort = () => reject(new Error('录音已取消'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      requested.then(value => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) { value.getTracks().forEach(track => track.stop()); reject(new Error('录音已取消')); }
        else resolve(value);
      }, e => { signal.removeEventListener('abort', abort); reject(e); });
    });
    if (signal.aborted) throw new Error('录音已取消');
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('此浏览器不支持可保存的音频格式，请使用 Chrome 或 Edge');
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    const started = Date.now();
    let cancelled = false;
    let resolve!: (take: CapturedAnswer) => void;
    let reject!: (error: Error) => void;
    const finished = new Promise<CapturedAnswer>((yes, no) => { resolve = yes; reject = no; });
    // A cancellation may happen before the component has attached its listener.
    void finished.catch(() => {});
    const cancel = () => {
      cancelled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
      signal.removeEventListener('abort', cancel);
      reject(new Error('录音已取消'));
    };
    recorder.ondataavailable = event => { if (!cancelled && event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { cancel(); };
    recorder.onstop = () => {
      release();
      signal.removeEventListener('abort', cancel);
      if (cancelled) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (!blob.size) reject(new Error('没有录到声音，请检查麦克风后重试'));
      else resolve({ id: crypto.randomUUID(), blob, duration: (Date.now() - started) / 1000 });
    };
    recorder.start(1000);
    signal.addEventListener('abort', cancel, { once: true });
    return {
      stream,
      finished,
      stop: () => { if (recorder.state !== 'inactive') recorder.stop(); return finished; },
      cancel,
    };
  } catch (e) { release(); throw e; }
}
