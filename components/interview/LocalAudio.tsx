'use client';

import { useLayoutEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import { claimPlayback } from '@/lib/audioResources';

/** Inactive takes have no media element or src, even when their history is open. */
export function LocalAudio({ src, label, audioRef, onTimeUpdate, onError }: {
  src: string;
  label: string;
  audioRef?: RefObject<HTMLAudioElement | null>;
  onTimeUpdate?: (event: SyntheticEvent<HTMLAudioElement>) => void;
  onError?: () => void;
}) {
  const ownRef = useRef<HTMLAudioElement>(null);
  const ref = audioRef ?? ownRef;
  const [active, setActive] = useState(false);
  const release = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    // Capture the element before React clears the ref during unmount.
    const element = ref.current;
    const dispose = release.current;
    return () => {
      dispose?.();
      if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
    };
  }, [src, active, ref]);
  const activate = () => {
    release.current = claimPlayback(() => {
      const element = ref.current;
      if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
      setActive(false);
    });
    setActive(true);
  };
  return active ? <audio ref={ref} controls autoPlay preload="none" src={src} className="w-full h-9" aria-label={label} onTimeUpdate={onTimeUpdate} onError={onError} onEnded={() => release.current?.()} />
    : <button type="button" onClick={activate} aria-label={label} className="w-full text-left rounded border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-indigo-700">▶ 点击回听 <span className="text-stone-400 ml-2">仅加载这一段</span></button>;
}
