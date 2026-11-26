'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { LogoMark } from '../landing/primitives';

/** Plan limits as published on the pricing page. Prices are per year, before 18% GST. */
const PLANS = [
  { id: 'gst', name: 'GST + Sign', price: 5999, gstins: 50, tans: 0, people: 3 },
  { id: 'tds', name: 'TDS + Sign', price: 4999, gstins: 0, tans: 25, people: 3 },
  { id: 'solo', name: 'Solo', price: 8999, gstins: 50, tans: 25, people: 3 },
  { id: 'growth', name: 'Growth', price: 15999, gstins: 200, tans: 100, people: Infinity },
  { id: 'scale', name: 'Scale', price: 29999, gstins: 600, tans: 300, people: Infinity },
] as const;

const inr = (n: number) => n.toLocaleString('en-IN');

/** The cheapest plan that covers the practice, or null when it needs a conversation. */
function pick(gstins: number, tans: number, people: number) {
  const fits = PLANS.filter((p) => gstins <= p.gstins && tans <= p.tans && people <= p.people);
  return fits.sort((a, b) => a.price - b.price)[0] ?? null;
}

function Counter({ label, hint, value, set, step, max }: { label: string; hint: string; value: number; set: (n: number) => void; step: number; max: number }) {
  const id = useId();
  const clamp = (n: number) => Math.max(0, Math.min(max, n));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-hairline py-3.5 first:border-t-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        <p className="text-[12px] text-ink-soft">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => set(clamp(value - step))}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-ink hover:border-ink/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => set(clamp(Number(e.target.value.replace(/\D/g, '')) || 0))}
          className="h-8 w-14 rounded-[8px] border border-ink/15 text-center text-[14px] tabular-nums text-ink focus:border-ink focus:outline-none"
        />
        <button
          type="button"
          onClick={() => set(clamp(value + step))}
          aria-label={`More ${label.toLowerCase()}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-ink hover:border-ink/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function PlanPicker() {
  const [gstins, setGstins] = useState(40);
  const [tans, setTans] = useState(12);
  const [people, setPeople] = useState(3);
  const plan = pick(gstins, tans, people);
  const gst = plan ? Math.round(plan.price * 0.18) : 0;

  return (
    <div className="w-full max-w-[460px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex items-center gap-2 border-b border-hairline px-5 py-3 text-[12.5px] font-medium text-ink">
        <LogoMark size={16} /> Which plan fits your practice
      </div>
      <div className="px-5 py-1.5">
        <Counter label="GSTINs" hint="Every GST registration you file for" value={gstins} set={setGstins} step={5} max={2000} />
        <Counter label="TANs" hint="Every deductor you file TDS for" value={tans} set={setTans} step={5} max={1000} />
        <Counter label="People" hint="Partners and staff who sign in" value={people} set={setPeople} step={1} max={200} />
      </div>
      <div aria-live="polite" className={plan ? 'bg-mint px-5 py-4 text-ink' : 'bg-ink px-5 py-4 text-white'}>
        {plan ? (
          <>
            <p className="text-[13px] text-ink/70">{plan.name}</p>
            <p className="mt-0.5 text-[30px] font-medium leading-none tracking-[-0.04em] tabular-nums">
              &#8377;{inr(plan.price)}
              <span className="ml-1.5 text-[14px] font-normal tracking-normal text-ink/70">a year</span>
            </p>
            <p className="mt-2 text-[12px] text-ink/75">
              &#8377;{inr(plan.price + gst)} with 18% GST of &#8377;{inr(gst)}.
              {gstins === 0 && tans === 0 ? ' Add a GSTIN or TAN to see the right plan.' : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium">More than our largest plan covers.</p>
            <p className="mt-1 text-[12.5px] text-white/70">
              Scale covers 600 GSTINs and 300 TANs.{' '}
              <Link href="/contact" className="underline underline-offset-2">
                Tell us your numbers
              </Link>{' '}
              and we will price it for you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
