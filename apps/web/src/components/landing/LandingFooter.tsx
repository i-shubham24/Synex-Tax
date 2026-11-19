'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Check } from 'lucide-react';
import { LogoMark, PillButton, PixelField } from './primitives';

type IconProps = { className?: string };
const InstagramIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
const LinkedinIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C20.6 8.65 21 11.2 21 14.4V21h-4v-5.8c0-1.4-.03-3.2-1.95-3.2-1.95 0-2.25 1.5-2.25 3.1V21H9z" />
  </svg>
);
const XIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zM16.67 19.2h1.7L7.4 4.73H5.58z" />
  </svg>
);

// Social handles are not confirmed yet. Replace these placeholders with the real URLs before launch.
const SOCIAL = [
  { label: 'SynexTax on Instagram', href: '#contact', icon: InstagramIcon },
  { label: 'SynexTax on LinkedIn', href: '#contact', icon: LinkedinIcon },
  { label: 'SynexTax on X', href: '#contact', icon: XIcon },
];

const PRODUCT: Array<[string, string, boolean?]> = [
  ['How it works', '#product'],
  ['Modules', '#modules', true],
  ['Why switch', '#why', true],
  ['Pricing', '#pricing', true],
  ['Founding pilot', '#pilot'],
];
const COMPANY: Array<[string, string, boolean?]> = [
  ['Book a demo', '/signup'],
  ['Sign in', '/login', true],
  ['About SynexTax', '#about'],
  ['Privacy notice', '#contact'],
  ['Terms of service', '#contact'],
];

function LinkColumn({ title, links }: { title: string; links: Array<[string, string, boolean?]> }) {
  return (
    <div>
      <p className="font-display text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink/40">{title}</p>
      <ul className="mt-5 space-y-3 font-display text-[17px] tracking-[-0.015em]">
        {links.map(([label, href, accent]) => (
          <li key={label}>
            <Link
              href={href}
              className={`group inline-flex items-center gap-1.5 transition-colors ${accent ? 'text-sky-deep hover:text-ink' : 'text-ink/80 hover:text-sky-deep'}`}
            >
              <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-500 ease-out-expo group-hover:bg-[length:100%_1px]">
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const wordRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: wordRef, offset: ['start end', 'end end'] });
  const rise = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['38%', '0%']);

  return (
    <footer id="contact" className="site-grid relative overflow-hidden pt-6 sm:pt-10" aria-label="Site footer">
      <div className="mx-auto grid max-w-[1480px] gap-5 px-3 sm:px-6 lg:px-10 xl:grid-cols-[minmax(0,34fr)_minmax(0,66fr)]">
        {/* Gradient card: gold to indigo, the colours of the hero coin and pillars */}
        <div className="pixel-host relative flex min-h-[300px] flex-col justify-between gap-8 overflow-hidden rounded-[28px] p-8 text-white sm:p-10 xl:min-h-[460px]">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 70% at 15% 0%, #f2b53a 0%, rgba(242,181,58,0) 60%), radial-gradient(90% 60% at 100% 20%, #f39a4c 0%, rgba(243,154,76,0) 55%), linear-gradient(180deg, #e8a33e 0%, #b88aa8 38%, #6e66e6 70%, #4b41d8 100%)',
            }}
          />
          <div aria-hidden className="absolute inset-0 opacity-[0.18] mix-blend-soft-light" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '3px 3px' }} />
          <PixelField seed={141} count={26} cell={16} cols={18} rows={12} maxOpacity={0.18} />

          <p className="relative flex items-center gap-2.5 font-display text-[24px] font-semibold tracking-[-0.03em] [text-shadow:0_2px_12px_rgba(0,0,0,0.12)]">
            <LogoMark size={22} tone="paper" /> SynexTax
          </p>

          <p className="relative max-w-[22rem] font-display text-[clamp(22px,2vw,28px)] font-medium leading-[1.25] tracking-[-0.03em] [text-shadow:0_2px_16px_rgba(0,0,0,0.15)]">
            Your team prepares it. Your partner signs it. Every client files on time.
          </p>

          <div className="relative flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-display text-[16px] font-medium">Follow us</span>
            <div className="flex gap-2.5">
              {SOCIAL.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-0.5 hover:scale-105"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Links + newsletter panel */}
        <div className="grid rounded-[28px] bg-white shadow-[0_0_0_1px_rgba(20,20,22,0.05),0_30px_60px_-40px_rgba(20,20,22,0.25)] md:grid-cols-[minmax(0,1.15fr)_1px_minmax(0,1fr)]">
          <div className="flex flex-col justify-between p-8 sm:p-10">
            <div className="grid grid-cols-2 gap-10">
              <LinkColumn title="Product" links={PRODUCT} />
              <LinkColumn title="Company" links={COMPANY} />
            </div>
            <div className="mt-9">
              <div className="h-px bg-ink/15" />
              <p className="mt-5 font-display text-[15px] text-ink/50">&copy; 2026 SynexTax by Synex Labs. All rights reserved.</p>
              <p className="mt-2 max-w-[30rem] font-display text-[12.5px] leading-[1.55] text-ink/40">
                Not affiliated with GSTN, CBIC, the Income Tax Department, Protean or NIC. SynexTax prepares and transmits
                returns; it is not tax advice.
              </p>
            </div>
          </div>
          <div className="hidden bg-ink/80 md:block" />
          <div className="flex flex-col p-8 sm:p-10">
            <p className="flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-[-0.01em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-ink">
                <LogoMark size={12} tone="paper" />
              </span>
              SynexTax statutory notes
            </p>
            <h2 className="mt-5 font-display text-[clamp(28px,2.4vw,36px)] font-medium leading-[1.18] tracking-[-0.035em] text-ink">
              Rule Changes, Explained Before The Deadline
            </h2>
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (/\S+@\S+\.\S+/.test(email)) setSent(true);
              }}
            >
              <label htmlFor="footer-email" className="sr-only">
                Your email
              </label>
              <input
                id="footer-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSent(false);
                }}
                placeholder="your@firm.in"
                className="h-14 w-full rounded-full border border-ink/10 bg-white px-6 font-display text-[16px] text-ink outline-none transition-shadow placeholder:text-ink/35 focus:border-sky focus:shadow-[0_0_0_4px_rgba(82,176,248,0.18)]"
              />
              {sent ? (
                <p className="flex h-14 items-center justify-center gap-2 rounded-full bg-mint font-display text-[16px] font-medium text-ink" role="status">
                  <Check className="h-4 w-4" strokeWidth={2.6} /> You are on the list
                </p>
              ) : (
                <PillButton type="submit" full size="lg">
                  Stay in the loop
                </PillButton>
              )}
            </form>
            <p className="mt-5 font-display text-[14px] leading-[1.55] text-ink/50">
              No spam. Only notes on GST and TDS changes that affect your clients, in English, Punjabi or Hindi.
            </p>
          </div>
        </div>
      </div>

      {/* Giant wordmark, cut by the page edge */}
      <div ref={wordRef} aria-hidden className="pointer-events-none relative mt-6 h-[15vw] select-none overflow-hidden">
        <motion.p
          style={{ y: rise }}
          className="absolute inset-x-0 top-0 text-center font-display text-[24vw] font-light leading-[0.82] tracking-[-0.06em] text-transparent [background-clip:text] [-webkit-background-clip:text] [background-image:linear-gradient(180deg,#8e8e96_0%,#b9b9c0_45%,rgba(255,255,255,0)_92%)]"
        >
          SynexTax
        </motion.p>
      </div>
    </footer>
  );
}
