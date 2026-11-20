import type { Metadata } from 'next';
import { FeatureGroups, MarketingPage } from '../../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: 'Dual-Act TDS and TCS | SynexTax',
  description: 'TDS under the Income-tax Act, 1961 and the Income-tax Act, 2025 side by side: multi-section ITNS 281N challans, CSI matching, interest and late fees.',
};

export default function TdsFeaturesPage() {
  return (
    <MarketingPage
      eyebrow="TDS and TCS"
      title="Both Income-tax Acts, Side By Side"
      summary={
        <p>
          Statements up to FY 2025-26 stay on the 1961 Act. From Tax Year 2026-27 work moves to the 2025 Act and its new forms.
          SynexTax routes each period by date, so your team works the same way for both.
        </p>
      }
    >
      <FeatureGroups
        groups={[
          {
            id: 'regime',
            title: 'Two Acts, one workflow',
            items: [
              { title: 'Routed by date', body: 'Periods up to 31 March 2026 use the 1961 Act; from 1 April 2026 the 2025 Act. Older years stay correctable in their own format.', status: 'live' },
              { title: 'New forms', body: 'Forms 138, 140, 143 and 144 alongside 24Q, 26Q, 27EQ and 27Q, with the 15th and 31st due dates kept apart.', status: 'pilot' },
              { title: 'Two-year correction window', body: 'Filed statements show when their correction window closes.', status: 'live' },
            ],
          },
          {
            id: 'challans',
            title: 'Challans',
            items: [
              { title: 'ITNS 281N across sections', body: 'One challan split across up to 20 sections under the 2025 Act; the 1961 one-section rule kept for older periods.', status: 'live' },
              { title: 'CSI file matching', body: 'Your challans matched against the bank’s CSI file by BSR code, challan number and amount.', status: 'live' },
              { title: 'Company and non-company heads', body: '0020 and 0021 checked against the deductee’s PAN.', status: 'live' },
            ],
          },
          {
            id: 'maths',
            title: 'Exact statutory maths',
            items: [
              { title: 'Rounding as the Act says', body: 'Paise dropped and tax rounded to the nearest ten rupees; interest base rounded down to the hundred.', status: 'live' },
              { title: 'Interest and late fee', body: '1% for late deduction, 1.5% for late deposit, part of a month counted as a month, and the late filing fee capped at the tax.', status: 'live' },
              { title: 'Payees without PAN', body: 'PANNOTAVBL and similar entries allowed and flagged for the higher rate.', status: 'pilot' },
            ],
          },
          {
            id: 'statements',
            title: 'Statements, corrections and certificates',
            items: [
              { title: 'FVU validation', body: 'Statements validated in isolated runners pinned to Protean FVU 1.2 and 9.5, with errors linked back to the row.', status: 'coming' },
              { title: 'Import past statements', body: 'Form 140 statement files checked against Protean’s file format and kept as closed history, with a payee master per TAN.', status: 'live' },
              { title: 'Import 1961 Act statements and TRACES files', body: '24Q, 26Q, 27Q and 27EQ text files and TRACES consolidated files.', status: 'coming' },
              { title: 'TDS health', body: 'Unused and over-used challans, interest for late payment, late filing fees building up, PAN problems and correction windows closing.', status: 'live' },
              { title: 'Correction statements', body: 'Built from the TRACES consolidated file, with drafts and versions.', status: 'coming' },
              { title: 'Form 16 and 16A (Forms 130 and 131)', body: 'Split, signed and sent to each payee by email or WhatsApp.', status: 'coming' },
              { title: 'Salary TDS calculator', body: 'Tax for the year under both regimes with HRA, 80C, NPS, rebate and surcharge relief, and the monthly deduction for the rest of the year.', status: 'live' },
              { title: 'Form 138 statements', body: 'Salary statements with Form 124 declarations and the Q4 annexure.', status: 'coming' },
            ],
          },
        ]}
      />
    </MarketingPage>
  );
}
