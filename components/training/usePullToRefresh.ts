import { RefObject, useEffect, useRef, useState } from 'react';

/**
 * Custom pull-to-refresh for a vertically-scrollable container.
 *
 * Uses Pointer Events (unified touch + mouse + pen) so it works on both phone
 * touch and any other dragging device. Native browser pull-to-refresh doesn't
 * fire here because the body isn't the scrollable element.
 *
 * - Activates only when the container is scrolled to top (scrollTop === 0).
 * - Applies resistance (drag distance × 0.5) so it feels weighty.
 * - Past `threshold` (default 60px), releasing triggers `onRefresh`.
 * - During the refresh, the indicator stays pinned at the threshold.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>,
  { threshold = 60, resistance = 0.5, maxPull = 120 } = {},
): { pullDistance: number; isRefreshing: boolean } {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Internal refs (state values are stale inside long-lived event handlers)
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const refreshHandlerRef = useRef(onRefresh);
  refreshHandlerRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const reset = () => {
      startYRef.current = null;
      pointerIdRef.current = null;
      pullDistanceRef.current = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only react to primary input
      if (!e.isPrimary) return;
      // Don't start if we're not at the top
      if (el.scrollTop > 0) {
        reset();
        return;
      }
      startYRef.current = e.clientY;
      pointerIdRef.current = e.pointerId;
      pullDistanceRef.current = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (startYRef.current === null) return;
      if (e.pointerId !== pointerIdRef.current) return;
      // Mid-gesture scroll-away aborts
      if (el.scrollTop > 0) {
        reset();
        setPullDistance(0);
        return;
      }
      const dy = e.clientY - startYRef.current;
      if (dy <= 0) {
        if (pullDistanceRef.current !== 0) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
        return;
      }
      const distance = Math.min(maxPull, dy * resistance);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
      if (e.cancelable) e.preventDefault();
    };

    const onPointerEnd = async (e: PointerEvent) => {
      if (startYRef.current === null) return;
      if (e.pointerId !== pointerIdRef.current) return;
      const dist = pullDistanceRef.current;
      reset();

      if (dist >= threshold) {
        setIsRefreshing(true);
        setPullDistance(threshold); // hold while in-flight
        try {
          await refreshHandlerRef.current();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('pointerleave', onPointerEnd);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('pointerleave', onPointerEnd);
    };
  }, [scrollRef, threshold, resistance, maxPull]);

  return { pullDistance, isRefreshing };
}
