let releasePlayback: (() => void) | undefined;

/** One media source across daily answers, overview and unsaved previews. */
export function claimPlayback(release: () => void): () => void {
  releasePlayback?.();
  let released = false;
  const dispose = () => {
    if (released) return;
    released = true;
    if (releasePlayback === dispose) releasePlayback = undefined;
    release();
  };
  releasePlayback = dispose;
  return dispose;
}

let processingTail: Promise<unknown> = Promise.resolve();
/** Queue before fetching/decoding, so queued jobs do not retain audio buffers. */
export function queueAudioProcessing<T>(work: () => Promise<T>): Promise<T> {
  const result = processingTail.then(work);
  processingTail = result.then(() => undefined, () => undefined);
  return result;
}
