'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, CheckCircle2, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { Chips, Eyebrow, LogoMark, PixelField, SplitButton } from './primitives';
import { RoleStack } from './ProductGlance';

/** Concave joint between two same-colour blocks (the reference's smooth stair corners). */
function Fillet({ x, y, corner, r = 12, color }: { x: string; y: string; corner: 'tr' | 'bl'; r?: number; color: string }) {
  const at = corner === 'tr' ? '100% 0' : '0 100%';
  return (
    <span
      aria-hidden
      className="absolute"
      style={{
        left: corner === 'tr' ? x : `calc(${x} - ${r}px)`,
        top: corner === 'tr' ? `calc(${y} - ${r}px)` : y,
        width: r,
        height: r,
        background: `radial-gradient(circle at ${at}, transparent ${r - 0.5}px, ${color} ${r}px)`,
      }}
    />
  );
}

function PostCard() {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="rounded-[16px] bg-ink p-2.5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <div className="rounded-[10px] bg-[#232326] p-3">
        <div className="flex items-center justify-between text-[11px] text-white">
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mint">
              <LogoMark size={16} />
            </span>
            syntax
          </span>
          <MoreHorizontal className="h-4 w-4 text-white/50" />
        </div>
        <div className="relative mt-3 aspect-[1/1.12] overflow-hidden rounded-[4px] bg-sky">
          <PixelField seed={81} count={30} cell={22} cols={14} rows={16} maxOpacity={0.2} anchor="full" />
          <div className="absolute left-0 top-[18%] h-[22%] w-[26%] bg-[#4a3a2a]/0" />
          <div className="absolute left-0 top-0 h-[30%] w-[30%] bg-ink/90" />
          <div className="absolute right-0 top-[30%] h-[26%] w-[22%] bg-ink/90" />
          <div className="absolute bottom-0 left-[12%] h-[34%] w-[34%] bg-mint" />
          <div className="absolute bottom-0 right-0 h-[16%] w-[40%] bg-mint-pale" />
          {/* Filing receipt */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white p-3.5 shadow-2xl"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#14b85a]" /> GSTR-3B filed
            </p>
            <p className="mt-1 text-[9.5px] text-ink-soft">Oct 2026, signed with partner DSC</p>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[8.5px]">
              {[
                ['IGST', '41,380'],
                ['CGST', '22,104'],
                ['SGST', '22,104'],
              ].map(([k, v]) => (
                <div key={k} className="rounded bg-mist px-1.5 py-1">
                  <p className="text-ink-soft">{k}</p>
                  <p className="font-medium tabular-nums text-ink">&#8377;{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[8.5px] text-ink-faint">Audit entry #4 of 4: maker, checker, client, signer</p>
          </motion.div>
        </div>
        <div className="mt-3 flex items-center justify-between text-white/80">
          <div className="flex items-center gap-3.5">
            <button type="button" aria-label="Approve" aria-pressed={liked} onClick={() => setLiked((v) => !v)}>
              <CheckCircle2 className={`h-4 w-4 transition-colors ${liked ? 'fill-mint text-ink' : ''}`} />
            </button>
            <MessageCircle className="h-4 w-4" aria-hidden />
            <Send className="h-4 w-4" aria-hidden />
          </div>
          <button type="button" aria-label="Save" aria-pressed={saved} onClick={() => setSaved((v) => !v)}>
            <Bookmark className={`h-4 w-4 ${saved ? 'fill-white' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PilotProof() {
  return (
    <section id="pilot" className="border-y border-hairline bg-white" aria-labelledby="pilot-title">
      <div className="mx-auto max-w-[1480px] overflow-hidden min-[1481px]:border-x min-[1481px]:border-hairline">
        <div className="grid lg:grid-cols-[minmax(0,22fr)_minmax(0,33fr)_minmax(0,45fr)]">
          <div className="hidden items-center border-b border-r border-hairline p-9 lg:flex">
            <RoleStack />
          </div>
          <div className="hidden items-center border-b border-r border-hairline p-9 lg:flex">
            <p className="text-[18px] font-medium tracking-[-0.03em]">&copy;2026 SynTax</p>
          </div>
          <div className="flex items-center justify-end border-b border-hairline p-6 sm:p-9">
            <Eyebrow tone="sky">Founding pilot</Eyebrow>
          </div>
        </div>

        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-0 lg:p-0">
          <div className="relative min-h-[460px] lg:border-r lg:border-hairline lg:p-9">
            {/* Interlocking blocks */}
            <div className="relative h-[430px]">
              <div className="pixel-host absolute left-0 top-0 h-[56%] w-[46%] overflow-hidden rounded-[12px] rounded-br-none bg-sky p-6 text-white">
                <PixelField seed={91} count={30} cell={14} cols={16} rows={14} maxOpacity={0.3} />
                <h2 id="pilot-title" className="relative text-[clamp(56px,6vw,86px)] font-normal leading-none tracking-[-0.06em]">
                  15
                </h2>
                <p className="relative mt-2 text-[clamp(16px,1.4vw,20px)] font-light">Founding firms</p>
              </div>
              <div className="pixel-host absolute bottom-0 right-0 h-[46%] w-[58%] overflow-hidden rounded-[12px] rounded-tl-none bg-sky p-6 text-white">
                <PixelField seed={92} count={26} cell={14} cols={20} rows={10} maxOpacity={0.25} />
                <p className="relative max-w-[17rem] text-[clamp(16px,1.45vw,21px)] font-light leading-[1.25]">
                  Six months free, then 40% off for life for the first fifteen firms.
                </p>
              </div>
              {/* Joint: block A's bottom-right meets block B's top-left */}
              <span aria-hidden className="absolute bg-sky" style={{ left: '42%', top: '52%', width: '4%', height: '4%' }} />
              <Fillet x="46%" y="54%" corner="tr" color="#52b0f8" />
              <Fillet x="42%" y="56%" corner="bl" color="#52b0f8" />

              <div className="absolute left-[50%] top-0 w-[48%] space-y-3">
                <div className="relative h-16 w-20 overflow-hidden rounded-[4px] bg-mint">
                  <span className="absolute bottom-0 left-0 h-8 w-10 bg-ink" />
                  <span className="absolute right-0 top-0 h-6 w-6 bg-sky" />
                </div>
                <p className="max-w-[18rem] text-[11px] leading-[1.55] text-ink-soft">
                  From solo practitioners to twenty-seat firms. We come on-site, import your client master in about ten
                  minutes, and train your team in Punjabi or English.
                </p>
              </div>

              <div className="absolute bottom-0 left-0 w-[38%] space-y-5 pb-1">
                <Chips items={['Ranjit Avenue', 'Lawrence Road', 'Hall Bazar']} more={2} />
                <SplitButton href="/signup" accent="sky">
                  Join the pilot
                </SplitButton>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center lg:p-9">
            <div className="w-full max-w-[330px]">
              <PostCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
