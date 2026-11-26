'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { SplitButton } from './primitives';

function useShift(progress: MotionValue<number>, from: number, reduce: boolean | null) {
  return useTransform(progress, [0, 1], reduce ? [0, 0] : [from, 0]);
}

/** "Clarity meets compliance" slide: mint blocks assemble as the section scrolls in. */
export function ClosingCta() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const a = useShift(scrollYProgress, 120, reduce);
  const b = useShift(scrollYProgress, -90, reduce);
  const c = useShift(scrollYProgress, 60, reduce);
  const d = useShift(scrollYProgress, -50, reduce);

  return (
    <section className="site-base px-3 py-10 sm:px-6 sm:py-14 lg:px-10" aria-labelledby="closing-title">
      <div ref={ref} data-nav-theme="dark" className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[30px] bg-night text-white sm:rounded-[38px]">
        <div className="flex items-center justify-between px-7 pt-6 text-[11px] text-white/70 sm:px-10">
          <span>SynTax</span>
          <span>/ 2026 - 2027 /</span>
        </div>

        {/* Right-hand arch of mint blocks */}
        <motion.div style={{ y: a }} className="absolute right-[24%] top-0 h-[16%] w-[11%] rounded-b-[6px] bg-mint" />
        <motion.div style={{ y: b }} className="absolute right-[24%] top-[13%] h-[59%] w-[11%] rounded-[6px] bg-mint" />
        <motion.div style={{ y: c }} className="absolute right-[8%] top-[13%] h-[40%] w-[12%] rounded-[6px] bg-mint" />
        <motion.div style={{ y: d }} className="absolute right-0 top-[52%] h-[20%] w-[9%] rounded-l-[6px] bg-mint" />
        {/* Lower-left checker */}
        <motion.div style={{ y: c }} className="absolute bottom-[26%] left-0 h-[16%] w-[7%] rounded-r-[6px] bg-mint" />
        <motion.div style={{ y: d }} className="absolute bottom-[12%] left-[7%] h-[16%] w-[7%] rounded-[6px] bg-mint" />
        <motion.div style={{ y: a }} className="absolute bottom-0 left-0 h-[13%] w-[7%] bg-mint" />
        <motion.div style={{ y: b }} className="absolute bottom-0 left-[14%] h-[13%] w-[8%] rounded-t-[6px] bg-mint" />

        <div className="relative z-10 px-7 pb-10 pt-8 sm:px-10">
          <h2 id="closing-title" className="max-w-[40rem] text-[clamp(40px,5vw,76px)] font-medium leading-[1.02] tracking-[-0.05em]">
            Your next GSTR-3B,
            <br />
            on SynTax
          </h2>
          <div className="mt-10 pl-[16%] sm:pl-[26%] lg:mt-12 lg:pr-[40%]">
            <p className="text-[15px] font-medium text-mint-pale">14 days, no card</p>
            <p className="mt-2 max-w-[30rem] text-[clamp(20px,1.9vw,27px)] leading-[1.3] tracking-[-0.02em]">
              Two sample clients are ready when you sign in. Run a 2B match before lunch.
            </p>
            <div className="mt-7">
              <SplitButton href="/signup" tone="light">
                Start 14-day free trial
              </SplitButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
