import type { Metadata } from 'next';
import { FeatureGroups, MarketingPage } from '../../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: 'Dual-Act TDS and TCS | SynTax',
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
          SynTax routes each period by date, so your team works the same way for both.
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
              { title: 'Form 138, 140, 144 and 143 statement files', body: 'The upload-ready text file for salaries (quarters 1 to 3), residents, non-residents and TCS, written to Protean’s file formats, with every rule checked that can be checked before the FVU, and a clear list of anything to fill in first.', status: 'live' },
              { title: 'FVU validation', body: 'Statements validated in isolated runners pinned to Protean FVU 1.2 and 9.5, with errors linked back to the row.', status: 'coming' },
              { title: 'Import past statements', body: 'Form 138, 140, 144 and 143 statement files checked against Protean’s file formats and kept as closed history, with a payee master per TAN.', status: 'live' },
              { title: 'This quarter from your sheet', body: 'Paste the quarter’s payments from Excel, one row per payment with its challan. Every row is checked, then challans, rows and the draft return are created for the statement.', status: 'live' },
              { title: 'Import 1961 Act statements', body: '24Q, 26Q, 27Q and 27EQ text files from earlier years come in as closed history with their payees. Quarter 4 salary details stay in the source file.', status: 'live' },
              { title: 'Import TRACES files', body: 'TRACES consolidated files and justification reports.', status: 'coming' },
              { title: 'TDS health', body: 'Unused and over-used challans, interest for late payment, late filing fees building up, PAN problems and correction windows closing.', status: 'live' },
              { title: 'Registers and default analysis', body: 'Late deduction and late deposit interest, tax deducted but not deposited, no-PAN rows below the higher rate, a month-by-month deposit register, section-wise totals for clause 34 of the tax audit report, and statement due and filing dates.', status: 'live' },
              { title: 'Form 121 register', body: 'Declarations received for no deduction, checked against every row marked with reason B.', status: 'live' },
              { title: 'Section rates and thresholds', body: 'Every Form 140 row checked against its section’s rate and threshold for Tax Year 2026-27, from the Income Tax Department’s chart: short deduction, tax missed once the year’s payments cross the threshold, and wrong below-threshold claims.', status: 'live' },
              { title: 'Lower deduction certificates', body: 'Section 395 certificates with their rate, limit and dates; each reason A row checked, and the limit used up in date order.', status: 'live' },
              { title: 'Government deductors and Form 24G', body: 'State, ministry and AIN in the statement for government deductors, book adjustments with their 24G receipt and DDO serial.', status: 'live' },
              { title: 'Salary register and Form 124', body: 'Each employee’s tax for the year, TDS so far and monthly TDS, with a Form 124 report of every claim and what it still needs.', status: 'live' },
              { title: 'Challans kept separately', body: 'Paste payments and challans as two lists; each month’s rows are linked to the challan paid for it.', status: 'live' },
              { title: 'FVU on your computer', body: 'The statement handed to Protean’s FVU through the SynTax agent, and the result read back.', status: 'pilot' },
              { title: 'Correction statements', body: 'Open the consolidated file from TRACES, correct PANs, challans and rows or add a missed challan, and download the C5, C3 or C9 correction file, per Protean’s correction formats of August 2026.', status: 'live' },
              { title: 'Certificate check', body: 'Form 130 and 131 PDFs from the TRACES converter checked for one PAN each and a digital signature before they go out.', status: 'pilot' },
              { title: 'Correction statements', body: 'Built from the TRACES consolidated file, with drafts and versions.', status: 'coming' },
              { title: 'Form 16 and 16A (Forms 130 and 131)', body: 'Split, signed and sent to each payee by email or WhatsApp.', status: 'coming' },
              { title: 'Salary TDS calculator', body: 'Tax for the year under both regimes with HRA, LTA, home-loan interest, 80C, NPS, perquisites, salary from an earlier employer, rebate and surcharge relief, and the monthly deduction for the rest of the year.', status: 'live' },
              { title: 'Form 124 checks', body: 'Each claim checked for what Form 124 requires (the landlord’s PAN above Rs 1 lakh rent, the lender’s details for home-loan interest, evidence of travel) before it reduces TDS.', status: 'pilot' },
              { title: 'Form 138 Q4', body: 'The quarter 4 annual salary annexure, once Protean publishes its format.', status: 'coming' },
            ],
          },
        ]}
      />
    </MarketingPage>
  );
}
