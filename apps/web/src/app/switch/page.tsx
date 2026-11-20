import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { MarketingPage, StatusTag, type Availability } from '../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: 'Switch from desktop tax software | SynexTax',
  description: 'Move your client list, GSTINs and team from installed tax software to SynexTax, and see what changes for your practice.',
};

const STEPS: Array<{ title: string; body: string; status: Availability }> = [
  {
    title: 'Bring your client list',
    body: 'Copy the client sheet from your current software or Excel and paste it in, or upload a CSV. We find the header row, match the columns, and check every GSTIN, PAN, TAN, mobile and email before saving.',
    status: 'live',
  },
  {
    title: 'Fix what needs fixing, in place',
    body: 'Rows are marked ready, cleaned or needs fixing. A mistyped GSTIN or a PAN that does not match its GSTIN is shown on the row, and you correct it there. Nothing is saved until the whole batch is clean.',
    status: 'live',
  },
  {
    title: 'Paste GSTINs in bulk',
    body: 'Paste up to 500 GSTINs. Each is checked, and the PAN, state and holder type are read from it. Names are typed in for now; lookup from the GST network arrives with the GSP connection.',
    status: 'live',
  },
  {
    title: 'Carry your TDS history over',
    body: 'Form 140 statement files come in as closed history with a payee master for each TAN. Files in the 1961 Act formats and TRACES consolidated files are next.',
    status: 'live',
  },
  {
    title: 'Invite your team',
    body: 'Partners, managers and staff each get their own login with two-factor sign-in. Staff see only the clients assigned to them.',
    status: 'coming',
  },
];

const COMPARE: Array<[string, string, string]> = [
  ['Installation', 'Databases, runtimes and Java on every PC, plus updaters', 'Nothing to install. Open it in a browser'],
  ['Working from home', 'Remote desktop into the office PC', 'Sign in from anywhere with two-factor login'],
  ['Inward credit', 'Purchase register compared with GSTR-2A', 'Four-pass match against GSTR-2B, with IMS actions'],
  ['Who files', 'Anyone with the software open', 'Staff prepare, a partner approves every filing'],
  ['Change history', 'Whatever the last backup kept', 'Every edit logged, and the log cannot be altered'],
  ['Updates', 'Downloaded and installed before deadlines', 'Already there when you sign in'],
];

export default function SwitchPage() {
  return (
    <MarketingPage
      eyebrow="Switch to SynexTax"
      title="Move Your Practice Over In An Afternoon"
      summary={
        <p>
          Most firms we talk to run GST and TDS on installed desktop software. Here is what moves across, how long it takes,
          and what changes for your team. Each step is marked with what works today.
        </p>
      }
    >
      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="font-display text-[clamp(26px,2.4vw,36px)] font-medium tracking-[-0.035em] text-ink">What Moves, And How</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-[24px] border border-ink/[0.07] bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-[14px] tabular-nums text-ink/35">{String(i + 1).padStart(2, '0')}</span>
                <StatusTag status={s.status} />
              </div>
              <h3 className="mt-4 font-display text-[19px] font-medium tracking-[-0.025em] text-ink">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink/65">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="compare-title" className="mt-16">
        <h2 id="compare-title" className="font-display text-[clamp(26px,2.4vw,36px)] font-medium tracking-[-0.035em] text-ink">What Changes For Your Team</h2>
        <div className="mt-8 overflow-x-auto rounded-[24px] border border-ink/[0.07]">
          <table className="w-full min-w-[640px] text-left text-[14.5px]">
            <thead className="bg-[#141416] text-white">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-medium"><span className="sr-only">Topic</span></th>
                <th scope="col" className="px-5 py-3.5 font-medium">Typical desktop software</th>
                <th scope="col" className="px-5 py-3.5 font-medium">SynexTax</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([topic, desktop, ours]) => (
                <tr key={topic} className="border-t border-ink/[0.07] align-top">
                  <th scope="row" className="px-5 py-4 font-medium text-ink">{topic}</th>
                  <td className="px-5 py-4 text-ink/60"><Minus aria-hidden className="mr-2 inline h-4 w-4 text-ink/30" />{desktop}</td>
                  <td className="px-5 py-4 text-ink"><Check aria-hidden className="mr-2 inline h-4 w-4 text-[#22a356]" />{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[13px] text-ink/45">Desktop setups differ from firm to firm. Check what yours needs installed and updated.</p>
      </section>
    </MarketingPage>
  );
}
