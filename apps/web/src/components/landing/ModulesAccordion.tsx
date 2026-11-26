'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { Check, Clock3, ShieldCheck, Usb } from 'lucide-react';
import { Chips, Eyebrow, PixelField } from './primitives';

type Module = {
  id: string;
  title: string;
  teaser: string;
  body: string;
  chips: string[];
  more: number;
  screen: React.ReactNode;
};

/* ---------- Device screens: small, truthful product states ---------- */
function ImsScreen() {
  const rows: Array<[string, string, 'A' | 'R' | 'P']> = [
    ['Gurdas Textiles', '1,18,400', 'A'],
    ['Majha Rice Mills', '64,250', 'P'],
    ['Lawrence Rd Traders', '9,860', 'R'],
    ['Hall Bazar Fabrics', '2,41,000', 'A'],
  ];
  const tone = { A: 'bg-mint text-ink', R: 'bg-[#ff6b6b] text-white', P: 'bg-sky text-white' } as const;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-white/50">Inward documents, Oct 2026</p>
      {rows.map(([n, v, s]) => (
        <div key={n} className="flex items-center justify-between rounded-md bg-white/[0.06] px-2 py-1.5">
          <div>
            <p className="text-[9.5px] text-white">{n}</p>
            <p className="text-[8.5px] text-white/45 tabular-nums">&#8377;{v}</p>
          </div>
          <span className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-semibold ${tone[s]}`}>{s}</span>
        </div>
      ))}
      <div className="mt-2 rounded-md bg-mint px-2 py-1.5 text-center text-[9.5px] font-medium text-ink">Recompute GSTR-2B</div>
    </div>
  );
}

function ReconScreen() {
  const rows: Array<[string, string, number]> = [
    ['INV/2026/1182', 'INV-1182', 100],
    ['GT/556', 'GT-0556', 96],
    ['8841', 'SR/8841/26', 88],
    ['RM-77', 'not in 2B', 0],
  ];
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-white/50">Purchase register vs 2B</p>
      {rows.map(([a, b, s]) => (
        <div key={a} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md bg-white/[0.06] px-2 py-1.5">
          <p className="truncate text-[9px] text-white/90">
            {a} <span className="text-white/40">&#8596;</span> {b}
          </p>
          <span
            className={`rounded px-1 text-[8.5px] font-semibold tabular-nums ${
              s === 100 ? 'bg-mint text-ink' : s > 0 ? 'bg-sky text-white' : 'bg-white/15 text-white/70'
            }`}
          >
            {s ? `${s}%` : 'Missing'}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[8.5px] text-white/45">Pass 2 matched 3 of 4 by fuzzy invoice number</p>
    </div>
  );
}

function TdsScreen() {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-white/50">ITNS 281N, Tax Year 2026-27</p>
      {[
        ['392', 'Salary', '48,200'],
        ['393(1)', 'Rent', '12,000'],
        ['393(1)', 'Professional fees', '7,500'],
      ].map(([s, l, v], i) => (
        <div key={i} className="flex items-center justify-between rounded-md bg-white/[0.06] px-2 py-1.5">
          <p className="text-[9px] text-white">
            <span className="font-mono text-sky">{s}</span> {l}
          </p>
          <p className="text-[9px] text-white/70 tabular-nums">&#8377;{v}</p>
        </div>
      ))}
      <div className="flex items-center gap-1.5 rounded-md bg-mint/90 px-2 py-1.5 text-[9.5px] font-medium text-ink">
        <Check className="h-3 w-3" /> FVU 1.2 validation passed
      </div>
    </div>
  );
}

function DscScreen() {
  return (
    <div className="space-y-2">
      <p className="text-[9px] text-white/50">Local signer on this PC</p>
      <div className="rounded-md bg-white/[0.06] p-2">
        <p className="flex items-center gap-1.5 text-[9.5px] text-white">
          <Usb className="h-3 w-3 text-sky" /> Class 3 token connected
        </p>
        <p className="mt-1 text-[8.5px] text-white/45">FIPS 140-3, valid to Mar 2028</p>
      </div>
      <div className="rounded-md bg-white/[0.06] p-2 text-[8.5px] text-white/55">
        <p>PIN entered on token only</p>
        <p>Single-use signing nonce</p>
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-md bg-sky px-2 py-1.5 text-[9.5px] font-medium text-white">
        <ShieldCheck className="h-3 w-3" /> Sign GSTR-3B
      </div>
    </div>
  );
}

const MODULES: Module[] = [
  {
    id: 'ims',
    title: 'GST returns and IMS',
    teaser: 'GSTR-1, 1A and 3B with the IMS deadline in view, for every GSTIN you handle.',
    body: 'Accept, reject or keep pending each supplier document, then recompute 2B before 3B is filed.',
    chips: ['GSTR-1', 'GSTR-3B', 'IMS', 'GSTR-1A'],
    more: 3,
    screen: <ImsScreen />,
  },
  {
    id: 'recon',
    title: 'Purchase register and 2B',
    teaser: 'Your Tally or Busy register matched with GSTR-2B, invoice numbers written either way.',
    body: 'Exact matches first, then numbers written differently, then value and tax-head differences to take up with the supplier.',
    chips: ['2B matching', 'Supplier follow-up', 'Rule 88A set-off'],
    more: 2,
    screen: <ReconScreen />,
  },
  {
    id: 'tds',
    title: 'Dual-Act TDS and TCS',
    teaser: 'Old periods on the 1961 Act, Tax Year 2026-27 on the 2025 Act, routed by date.',
    body: 'Forms 138, 140, 143 and 144 alongside 24Q to 27EQ, checked with Protean’s own FVU 1.2 and 9.5.',
    chips: ['Form 138', 'Form 140', '281N', 'FVU 1.2'],
    more: 4,
    screen: <TdsScreen />,
  },
  {
    id: 'dsc',
    title: 'Local DSC signer',
    teaser: 'A small app signs on the partner’s PC. No Java, no emSigner ports.',
    body: 'Works with ePass2003, ProxKey, mToken and eToken on Windows. The PIN goes to the token’s own driver, and the key never leaves the token.',
    chips: ['RETFILE', 'Form 130', 'Form 131'],
    more: 1,
    screen: <DscScreen />,
  },
];

/** Dark device, tilted like the reference phone; tilts further toward the pointer. */
function Device({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(14);
  const rz = useMotionValue(-16);
  const sx = useSpring(rx, { stiffness: 120, damping: 14 });
  const sz = useSpring(rz, { stiffness: 120, damping: 14 });
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="relative flex h-full items-center justify-center [perspective:900px]"
      onPointerMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        rx.set(14 - ((e.clientY - r.top) / r.height - 0.5) * 14);
        rz.set(-16 + ((e.clientX - r.left) / r.width - 0.5) * 14);
      }}
      onPointerLeave={() => {
        rx.set(14);
        rz.set(-16);
      }}
    >
      <motion.div
        style={{ rotateX: sx, rotateZ: sz }}
        className="relative h-[290px] w-[170px] rounded-[30px] bg-[#0d0d0f] p-[7px] shadow-[0_40px_60px_-20px_rgba(0,0,0,0.7),inset_0_0_0_1.5px_rgba(255,255,255,0.12)]"
      >
        <div className="h-full overflow-hidden rounded-[24px] bg-[#18181b] px-3 pt-7">
          <div className="absolute left-1/2 top-[13px] h-[14px] w-[54px] -translate-x-1/2 rounded-full bg-black" />
          <p className="mb-2 flex items-center justify-between text-[9px] text-white/80">
            <span>11:52</span>
            <Clock3 className="h-2.5 w-2.5" />
          </p>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export function ModulesAccordion() {
  const [open, setOpen] = useState<string>('recon');

  return (
    <section id="modules" data-nav-theme="dark" className="bg-night pb-24 pt-20 text-white sm:pt-24" aria-labelledby="modules-title">
      <div className="mx-auto max-w-[1380px] px-6 sm:px-10">
        <Eyebrow dark tone="sky">
          Our modules
        </Eyebrow>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
          <h2 id="modules-title" className="max-w-[34rem] text-[clamp(28px,2.9vw,40px)] font-normal leading-[1.15] tracking-[-0.035em]">
            Four parts, one client list
          </h2>
          <p className="max-w-[16rem] text-[11px] leading-[1.6] text-white/55">
            GST, TDS, signing and the client master share the same records, so a client is added once.
          </p>
        </div>

        <ul className="mt-12">
          {MODULES.map((m, i) => {
            const isOpen = open === m.id;
            return (
              <li key={m.id} className="relative">
                <AnimatePresence initial={false} mode="wait">
                  {isOpen ? (
                    <motion.div
                      key="open"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="relative my-2 grid overflow-visible rounded-[14px] bg-night-2 md:grid-cols-[minmax(0,52fr)_minmax(0,48fr)]">
                        <div className="p-6 sm:p-7">
                          <div className="flex items-start gap-6">
                            <span className="pt-1 text-[11px] text-white/45 tabular-nums">[{String(i + 1).padStart(2, '0')}]</span>
                            <div>
                              <h3 className="text-[clamp(19px,1.7vw,24px)] tracking-[-0.025em]">{m.title}</h3>
                              <p className="mt-3 max-w-[25rem] text-[11.5px] leading-[1.6] text-white/70">{m.body}</p>
                              <div className="mt-5">
                                <Chips items={m.chips} dark more={m.more} />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="relative min-h-[300px] overflow-hidden rounded-[14px] md:-my-6 md:mr-14">
                          <div className="absolute inset-0 bg-sky">
                            <PixelField seed={40 + i} count={30} cell={16} cols={22} rows={22} maxOpacity={0.22} />
                          </div>
                          <div className="absolute bottom-0 left-0 h-[34%] w-[30%] bg-mint-pale" />
                          <div className="absolute right-0 top-0 h-[22%] w-[38%] bg-mint" />
                          <Device>{m.screen}</Device>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpen('')}
                          className="absolute right-5 top-5 text-[11px] text-white/70 hover:text-white"
                        >
                          [Close]
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="closed"
                      type="button"
                      onClick={() => setOpen(m.id)}
                      aria-expanded={false}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group grid w-full grid-cols-[auto_1fr] items-center gap-x-6 gap-y-1 py-6 text-left sm:grid-cols-[auto_1fr_minmax(0,22rem)_auto]"
                    >
                      <span className="text-[11px] text-white/45 tabular-nums">[{String(i + 1).padStart(2, '0')}]</span>
                      <span className="text-[clamp(18px,1.6vw,22px)] tracking-[-0.025em] transition-transform duration-300 group-hover:translate-x-1">
                        {m.title}
                      </span>
                      <span className="col-start-2 text-[11px] leading-[1.5] text-white/55 sm:col-start-auto">{m.teaser}</span>
                      <span className="hidden text-[11px] text-sky sm:block">[Details]</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
