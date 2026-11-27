'use client';

import { useEffect, useRef, useState } from 'react';
import type { PillarScene } from './PillarScene';

interface Props {
  /** Element whose pointer movement drives the parallax (the hero frame). */
  trackRef: React.RefObject<HTMLElement | null>;
  onReveal: () => void;
  className?: string;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function HeroPillars({ trackRef, onReveal, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PillarScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [pointer, setPointer] = useState(false);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (!webglAvailable()) {
      setFailed(true);
      revealRef.current();
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: PillarScene | null = null;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    // Copy must never stay greyed out, even if the GPU is slow to start.
    const revealFallback = window.setTimeout(() => revealRef.current(), 350);
    cleanups.push(() => window.clearTimeout(revealFallback));

    import('./PillarScene').then(({ PillarScene }) => {
      if (cancelled) return;
      try {
        scene = new PillarScene(canvas, { reducedMotion: reduced, onIntroReveal: () => revealRef.current() });
      } catch {
        setFailed(true);
        revealRef.current();
        return;
      }
      sceneRef.current = scene;

      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        scene?.resize(width, height);
      });
      ro.observe(wrap);
      cleanups.push(() => ro.disconnect());

      let onScreen = true;
      const io = new IntersectionObserver(
        ([e]) => {
          onScreen = e.isIntersecting;
          scene?.setActive(onScreen && !document.hidden);
        },
        { threshold: 0 },
      );
      io.observe(wrap);
      cleanups.push(() => io.disconnect());

      const onVis = () => scene?.setActive(onScreen && !document.hidden);
      document.addEventListener('visibilitychange', onVis);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

      const track = trackRef.current ?? wrap;
      const onMove = (e: PointerEvent) => {
        const r = track.getBoundingClientRect();
        scene?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
        scene?.pointerOverCanvas(e.clientX, e.clientY);
        const hovering = scene?.isHoveringPillar() ?? false;
        setPointer((prev) => (prev === hovering ? prev : hovering));
      };
      const onLeave = () => {
        scene?.setPointer(0, 0);
        scene?.pointerLeaveCanvas();
        setPointer(false);
      };
      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerleave', onLeave);
      cleanups.push(() => {
        track.removeEventListener('pointermove', onMove);
        track.removeEventListener('pointerleave', onLeave);
      });

      // The hero's page position is measured once (and on resize), so scrolling reads no layout:
      // each scroll event is just arithmetic on window.scrollY.
      let trackTop = 0;
      let trackHeight = 1;
      const measure = () => {
        const r = (trackRef.current ?? wrap).getBoundingClientRect();
        trackTop = r.top + window.scrollY;
        trackHeight = Math.max(1, r.height);
      };
      measure();
      const onScroll = () => {
        if (!onScreen) return;
        scene?.setScroll((window.scrollY - trackTop) / trackHeight);
      };
      const onResize = () => {
        measure();
        onScroll();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      onScroll();
      cleanups.push(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [trackRef]);

  return (
    <div ref={wrapRef} className={className} style={{ cursor: pointer ? 'pointer' : undefined }}>
      {failed ? (
        <div aria-hidden className="absolute inset-0 flex items-end justify-center gap-3 pb-[18%]">
          {[62, 78, 70, 54].map((h, i) => (
            <span
              key={i}
              className="w-16 rounded-t-[22px] bg-gradient-to-b from-[#8a80ff] via-[#5a50f2] to-transparent"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onClick={() => sceneRef.current?.click()}
          aria-label="Interactive 3D pillars with a rupee coin. Click a pillar to send the coin there."
          role="img"
        />
      )}
    </div>
  );
}
