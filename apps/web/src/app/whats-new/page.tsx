import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingPage } from '../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: "What's new | SynTax",
  description: 'Changes to SynTax, newest first.',
};

const RELEASES: Array<{ date: string; title: string; items: Array<[string, string, string?]> }> = [
  {
    date: '26 November 2026',
    title: 'Purchase registers as exported, and the GSTR-2B download',
    items: [
      ['Purchase register upload', 'Upload the register exactly as Tally or Busy exports it. Title rows, page breaks, totals and round-off lines are skipped, repeated rows are counted once, and every row that can’t be used is listed with the reason.', '/products/gst'],
      ['GSTR-2B from the portal', 'Upload the 2B JSON you download from the GST portal. A file for a different GSTIN is refused, and uploading again keeps the IMS actions you have taken.', '/products/gst'],
      ['Clearer 2B matching', 'IGST booked against CGST + SGST is now a mismatch, not a match. 2B lines marked credit not available stay out of the claim, a document dated in another month is a probable match to check, and invoices dated after the month wait for next month.', '/products/gst'],
      ['Protean FVU 1.2 and 9.5', 'The statement check on the server is now called a pre-check, and never reports a file as validated. Run Protean’s own FVU through the desktop app for the real check.', '/products/tds'],
      ['TRACES PANs masked', 'The TRACES login helper shows PANs masked. A partner or manager can reveal them with a reason, and the reveal is logged.', '/security'],
    ],
  },
  {
    date: '21 November 2026',
    title: 'Statement files for salaries, residents, non-residents and TCS',
    items: [
      ['TDS correction statements', 'From the consolidated file downloaded from TRACES: PAN corrections (C5), challan and row changes (C3) and missed challans (C9), for Forms 138, 140, 143 and 144.', '/products/tds'],
      ['ITR-1 for 2025-26', 'The return file for Assessment Year 2026-27, written to the Income Tax Department’s schema, with interest and late fee worked out.'],
      ['Client upload link', 'Send a client a link; they photograph or pick each document on their phone and it lands on their checklist.', '/products/tds'],
      ['TDS rates, certificates and government deductors', 'Rows checked against each section’s rate and threshold, lower deduction certificates tracked, and statements for government deductors with Form 24G details.', '/products/tds'],
      ['Salary register', 'Employees with their tax for the year, TDS so far and monthly TDS, and a Form 124 report.', '/products/tds'],
      ['GST MIS', 'Month-by-month sales, purchases and tax, with a party master.', '/products/gst'],
      ['Function keys', 'F2 GST returns, F3 TDS, F4 Practice, F6 Bank, F7 Income tax, F8 Documents, F9 Clients, F10 Control Tower.'],
      ['Salary TDS, fuller', 'Perquisites, salary from an earlier employer, LTA and home-loan interest in the salary register, and Form 124 checks on each claim.'],
      ['ITC-04 and the 3B year', 'Job work positions with deemed supplies flagged, and every month’s GSTR-3B set against GSTR-1 and GSTR-2B.', '/products/gst'],
      ['Backups of Tally, Busy and Marg data', 'The SynTax desktop agent zips a client’s accounting data on your machine, with a checksum for every file. Nothing is uploaded.'],
      ['This quarter’s TDS from your Excel sheet', 'Paste the quarter’s payments with their challans; the rows are checked and the draft return is ready for its statement file.', '/products/tds'],
      ['TDS registers and default analysis', 'Interest for late deduction and deposit, short deposits, no-PAN rows below the higher rate, a deposit register, section-wise totals for the tax audit report and a Form 121 register.', '/products/tds'],
      ['GST returns', 'Sales register import with GSTR-1 classification, a rate-wise GSTR-1 summary, and CMP-08 and GSTR-4 workings for composition clients.', '/products/gst'],
      ['Practice', 'Tasks created from each client’s due dates, fee invoices with GST, receipts and each client’s ledger with ageing.'],
      ['Team and access', 'Choose the screens each team member can open and the clients they work on.'],
      ['Bank to books', 'A bank statement pasted in, its balance checked, ledgers suggested, and Tally vouchers to import. The statement never leaves your browser.'],
      ['Income tax computation', 'An individual’s tax under both regimes, with salary, house property, presumptive business, capital gains and other income.'],
      ['Portal status is now real', 'The status of the GST, e-invoice, TRACES and income tax portals is checked from our server every five minutes instead of being shown as always normal.'],
      ['Form 138, 140, 144 and 143 statement files', 'Write the upload-ready text file for a quarter from the challans and deductee rows you keep here. Anything the file format needs is listed for you to fill in first.', '/products/tds'],
      ['Bring in 24Q, 26Q, 27Q and 27EQ statements', 'Statement files from earlier years, in Protean’s 1961 Act formats, become closed history with their payees. Quarter 4 salary details are not brought in yet.', '/switch'],
      ['Form 143 files fixed', 'Form 143 statement files now carry file type TC1, as Protean’s format requires. Files written before this fix should be written again.'],
      ['Form 138 for quarters 1 to 3', 'Salary statements in Protean’s Form 138 format, version 1.2. The quarter 4 format with the annual salary details is not out yet; Q4 files follow once Protean releases it.'],
      ['Non-resident and TCS fields', 'Form 144 rows keep the nature of remittance, country, Act or treaty rate and Form 15CA reference; Form 143 rows keep the collectee code. Imported statements keep them too.'],
    ],
  },
  {
    date: '20 November 2026',
    title: 'Switching, TDS history and client documents',
    items: [
      ['Import your client list', 'Paste from Excel or upload a CSV. Every GSTIN, PAN, TAN, mobile and email is checked, and you fix problems on the row before anything is saved.', '/switch'],
      ['Form 140 statements as history', 'Bring in statement files from your current software. They are checked against Protean’s Form 140 file format and kept as closed history, with a payee master for each TAN.', '/products/tds'],
      ['TDS health', 'Unused and over-used challans, interest for late payment, late filing fees building up, PAN problems and correction windows closing, for one TAN or the whole firm.', '/products/tds'],
      ['Official Form 140 section codes', 'Deductee sections use the codes from Protean’s Form 140 file format, version 1.2.'],
      ['Client documents', 'Checklists for each client and period, a view of what is overdue or due this week, and a reminder ready to send on WhatsApp or email.'],
      ['Security fixes', 'Sessions now survive a page reload and end on sign-out; the demo workspace is off in production; every PAN reveal and signing attempt must be logged before it happens.', '/security'],
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <MarketingPage
      eyebrow="What's new"
      title="What changed, newest first."
      summary={<p>What changed in SynTax and when. Updates reach every firm automatically; there is nothing to download or install.</p>}
    >
      <ol className="space-y-20">
        {RELEASES.map((r) => (
          <li key={r.date} className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <time className="flex items-center gap-2 text-[13px] text-ink-soft">
                <span className="h-2 w-2 rounded-[2px] bg-mint" aria-hidden />
                {r.date}
              </time>
              <h2 className="mt-3 max-w-[22rem] text-[clamp(24px,2.2vw,32px)] font-normal leading-[1.15] tracking-[-0.03em] text-ink">{r.title}</h2>
            </div>
            <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:col-span-8">
              {r.items.map(([title, body, href]) => (
                <li key={title} className="border-t border-ink/15 pt-4">
                  <h3 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                    {href ? (
                      <Link href={href} className="underline decoration-transparent underline-offset-4 transition-colors hover:decoration-ink">
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{body}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </MarketingPage>
  );
}
