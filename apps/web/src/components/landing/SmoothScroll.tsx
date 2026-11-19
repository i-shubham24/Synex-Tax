'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/** Lenis inertial scrolling for the marketing page only (never the dashboard grids). */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Touch devices keep native scrolling (Lenis only smooths wheel input by default).
    // A lerp of 0.16 settles in ~150ms: smooth, but it no longer feels like input lag.
    const lenis = new Lenis({
      lerp: 0.16,
      smoothWheel: true,
      wheelMultiplier: 1,
      anchors: { offset: 0 },
    });
    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
