'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Splits accordion open into an immediate visual state (Sr. No. badge)
 * and a deferred body mount so the green active state paints before
 * expensive children render.
 */
export function useDeferredSectionOpen(open: boolean, onToggle: () => void) {
  const [visualOpen, setVisualOpen] = useState(open);
  const [bodyReady, setBodyReady] = useState(open);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setVisualOpen(open);
    if (!open) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setBodyReady(false);
      return;
    }
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!cancelled) setBodyReady(true);
      });
    });
    rafRef.current = outer;
    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cancelAnimationFrame(outer);
    };
  }, [open]);

  const handleToggle = useCallback(() => {
    if (visualOpen) {
      setBodyReady(false);
      setVisualOpen(false);
      onToggle();
      return;
    }
    // Paint the active badge immediately; body mounts after `open` sync + rAF.
    setVisualOpen(true);
    onToggle();
  }, [visualOpen, onToggle]);

  return {
    visualOpen,
    /** Mount expensive section body only after the badge has had a chance to paint. */
    showBody: visualOpen && bodyReady,
    handleToggle,
  };
}
