import type { Metadata } from 'next';
import { SiteNav } from '../../components/landing/SiteNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { PriceClose, RulesPanel, StairSteps, SuiteHero, TrySection } from '../../components/products/ProductSections';
import { SheetCheck } from '../../components/switch/SheetCheck';
import { YearsToHistory } from '../../components/switch/YearsToHistory';

export const metadata: Metadata = {
  title: 'Switch from desktop tax software | SynTax',
  description: 'Move your client list, TDS history and team from installed tax software to SynTax, and see what changes for your practice and what stays the same.',
};

/** The afternoon, in the order it is done. */
const MOVE = [
  {
    when: 'First hour',
    title: 'Bring your client list',
    body: 'Paste the client sheet from your current software or Excel, or upload a CSV. The header row is found, columns are matched, and every GSTIN, PAN, TAN, mobile and email is checked.',
  },
  {
    when: 'Same hour',
    title: 'Fix rows in place',
    body: 'Each row is marked ready, cleaned or needs fixing, with the reason. Correct it on the row. Nothing is saved until the whole batch is clean, so a bad sheet never half-imports.',
  },
  {
    when: 'Second hour',
    title: 'Carry TDS history over',
    body: 'Statement files in the 2025 forms (138, 140, 143, 144) and the 1961 forms (24Q, 26Q, 27Q, 27EQ) come in as closed history, with a payee list for each TAN. A deductor that isn’t there yet is created from the file.',
  },
  {
    when: 'Before you leave',
    title: 'Bring the team in',
    body: 'Invite partners, managers and staff. Each gets their own login with two-step sign-in, and staff see only the clients you give them.',
  },
];

const CHANGES: Array<[string, string, string]> = [
  ['Installing', 'Databases, runtimes and Java on every PC, and updaters to keep them going', 'Nothing to install except the small signing app on PCs that hold tokens'],
  ['Working from home', 'Remote desktop into the office PC', 'Sign in from anywhere, with two-step sign-in'],
  ['Purchase credit', 'Purchase register compared with GSTR-2A', 'Matched with GSTR-2B and acted on in IMS before the 14th'],
  ['Who files', 'Whoever has the software open', 'Staff prepare, and a partner or manager approves every filing'],
  ['Past years', 'A separate database for each year', 'One history per client, from the day you add them'],
  ['Change history', 'Whatever the last backup kept', 'Every edit logged, in a trail that cannot be altered'],
  ['Updates', 'Downloaded and installed before deadlines', 'Already there when you sign in'],
];

/** Honest about what doesn't change yet. */
const SAME = [
  { rule: 'Portal uploads', what: 'Until filing through our GST Suvidha Provider is switched on, you upload returns on the GST portal and TDS statements on the e-filing portal, as you do now.' },
  { rule: 'TRACES', what: 'You still sign in to TRACES yourself. SynTax gets the challan and PAN details ready for its questions, and reads the .conso file you download.' },
  { rule: 'Your DSC tokens', what: 'The same tokens and the same drivers. Nothing to re-issue and nothing to re-register.' },
  { rule: 'This year’s ITRs', what: 'Keep your old software for the rest of this year’s ITRs if you prefer, and switch GST and TDS first.' },
];

export default function SwitchPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-white">
        <SuiteHero
          layout="stacked"
          suite="Switching to SynTax"
          titleId="switch-title"
          title={<>Bring your clients across in an&nbsp;afternoon.</>}
          body={<p>Paste the client list from your desktop software, bring your TDS files as they are, and invite the team.</p>}
          price="Plans from ₹4,999 a year"
          visual={<YearsToHistory />}
          footer={<p>Your old software keeps working while you move. Nothing in it is changed or deleted.</p>}
        />

        <TrySection
          titleId="try-title"
          title="Try the import check on your own rows."
          body={
            <p>
              Paste a few lines from your client sheet as name, GSTIN, PAN. Each GSTIN is cleaned and its check character
              verified, and the PAN inside it must match. It runs in your browser; nothing is sent anywhere.
            </p>
          }
          demo={<SheetCheck />}
        />

        <StairSteps
          titleId="move-title"
          title="The afternoon, in the order you do it."
          aside="Do it in this order. Any step can wait for the next quiet afternoon."
          steps={MOVE}
        />

        <section className="mx-auto max-w-[1380px] px-6 py-20 sm:px-10 sm:py-28" aria-labelledby="changes-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="changes-title" className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
                What changes for your team.
              </h2>
              <p className="mt-5 max-w-[22rem] text-[14px] leading-[1.6] text-ink-soft">
                Desktop setups differ from firm to firm, so check what yours needs installed and updated.
              </p>
            </div>
            <div className="overflow-x-auto lg:col-span-8">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="text-[12.5px] text-ink-soft">
                    <th className="pb-3 pr-6 font-normal">
                      <span className="sr-only">Topic</span>
                    </th>
                    <th className="w-[38%] pb-3 pr-6 font-normal">Typical desktop software</th>
                    <th className="w-[38%] pb-3 font-normal">SynTax</th>
                  </tr>
                </thead>
                <tbody>
                  {CHANGES.map(([topic, before, after]) => (
                    <tr key={topic} className="border-t border-hairline align-top last:border-b">
                      <th scope="row" className="py-4 pr-6 text-[15px] font-medium tracking-[-0.01em] text-ink">
                        {topic}
                      </th>
                      <td className="py-4 pr-6 text-[14px] leading-[1.55] text-ink-soft">{before}</td>
                      <td className="py-4 text-[14px] leading-[1.55] text-ink">{after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <RulesPanel titleId="same-title" title="What stays the same, for now." rules={SAME} />

        <PriceClose
          titleId="switch-close"
          title="Move one client first, if you like."
          body="Start the 14-day trial, bring a single client across and run a month on it. Move the rest when you are sure."
        />
      </main>
      <LandingFooter />
    </>
  );
}
