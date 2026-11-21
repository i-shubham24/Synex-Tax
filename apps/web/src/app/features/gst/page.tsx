import type { Metadata } from 'next';
import { FeatureGroups, MarketingPage } from '../../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: 'GST, IMS and GSTR-2B reconciliation | SynexTax',
  description: 'GSTR-1 and 3B, a four-pass match against GSTR-2B, IMS actions before the 14th, and a 3B set-off that keeps cash outflow low.',
};

export default function GstFeaturesPage() {
  return (
    <MarketingPage
      eyebrow="GST"
      title="GSTR-2B, IMS And 3B, Built For The Way Credit Works Now"
      summary={
        <p>
          Input credit now depends on GSTR-2B and the Invoice Management System, not GSTR-2A. SynexTax matches every purchase to
          2B, keeps IMS actions ahead of the 14th, and computes 3B with the set-off order the law requires.
        </p>
      }
    >
      <FeatureGroups
        groups={[
          {
            id: 'recon',
            title: 'Purchase register against GSTR-2B',
            items: [
              { title: 'Four-pass match', body: 'Exact, then invoice numbers normalised (slashes, leading zeros, year tokens), then value and date tolerance, then probable matches left for a person to confirm.', status: 'live' },
              { title: 'Clear buckets', body: 'Matched, mismatched value, missing in 2B and missing in your books, with the rupee difference on each.', status: 'live' },
              { title: 'Dirty Excel cleaned first', body: 'Title rows, merged headers, Indian number grouping and mixed date formats are handled before matching.', status: 'pilot' },
              { title: 'Vendor follow-up packs', body: 'One message per supplier listing what is missing or different, ready for email or WhatsApp.', status: 'coming' },
            ],
          },
          {
            id: 'ims',
            title: 'Invoice Management System',
            items: [
              { title: 'Accept, reject or keep pending', body: 'Act on supplier documents for every GSTIN you handle, from one screen.', status: 'live' },
              { title: 'Before the 14th', body: 'High-value documents with no action yet are listed before the cut-off, so credit is not decided by default.', status: 'live' },
              { title: '3B held until 2B is recomputed', body: 'If IMS actions change after the 14th, GSTR-3B stays locked until GSTR-2B is recomputed.', status: 'live' },
              { title: 'Offline IMS file', body: 'Export actions in the portal’s offline format when the API is unavailable.', status: 'coming' },
            ],
          },
          {
            id: 'returns',
            title: 'Returns',
            items: [
              { title: 'Sales register for GSTR-1', body: 'Paste the month’s sales from Excel or your billing software. Each invoice is placed in B2B, B2C large, B2C others, exports or credit and debit notes, with the tax split checked against the place of supply and duplicates caught.', status: 'live' },
              { title: 'Rate-wise GSTR-1 summary', body: 'Taxable value and tax by table and rate, B2C others by place of supply, for checking before you upload.', status: 'live' },
              { title: 'CMP-08 and GSTR-4', body: 'Composition tax for each quarter by kind of supplier, with interest for late payment, and the year’s total for GSTR-4.', status: 'live' },
              { title: 'ITC-04', body: 'Goods sent to and back from job workers, what is still out, and what has turned into a supply after one year (three for capital goods), with the period and due date.', status: 'live' },
              { title: 'GSTR-3B for the year', body: 'Each month’s 3B against GSTR-1 and GSTR-2B, cash paid and filing dates, with differences settled across the year.', status: 'live' },
              { title: 'GSTR-3B set-off', body: 'IGST credit used first, CGST and SGST never crossed, and the split chosen to keep cash outflow lowest. Rule 86B and the credit reclaim ledger are checked.', status: 'live' },
              { title: 'GSTR-1A and IFF', body: 'Single amendment window after GSTR-1, and invoice furnishing for QRMP clients.', status: 'coming' },
              { title: 'Filing through a GSP', body: 'Save and file on the portal through a GST Suvidha Provider, with the client’s API consent.', status: 'coming' },
            ],
          },
          {
            id: 'control',
            title: 'Control',
            items: [
              { title: 'Partner approval', body: 'Staff prepare. A partner, or an authorised manager, files, and never a return they prepared.', status: 'live' },
              { title: 'Periods lock once filed', body: 'After a return is saved or filed, its invoices cannot be added, edited or deleted.', status: 'live' },
              { title: 'Three-year cliff', body: 'Unfiled returns approaching the three-year time bar are flagged on the dashboard.', status: 'live' },
              { title: 'e-Invoice, e-way bill, GSTR-9 and 9C', body: 'Planned after the core monthly cycle.', status: 'coming' },
            ],
          },
        ]}
      />
    </MarketingPage>
  );
}
