import type { Metadata } from 'next';
import { MarketingPage } from '../../components/marketing/MarketingPage';
import { TaxTools } from '../../components/tools/TaxTools';

export const metadata: Metadata = {
  title: 'Free GST and TDS calculators | SynTax',
  description: 'GST due dates by state, TDS statement due dates and correction deadlines, late filing fee, interest on late TDS, and a GSTIN checker.',
};

export default function ToolsPage() {
  return (
    <MarketingPage
      eyebrow="Free tools"
      title="Quick Answers For Deadline Week"
      summary={
        <p>
          The same rules SynTax uses inside the product, free to use. Everything runs in your browser and nothing you type is
          sent to us. These are a guide: check notified extensions and the portal before you file.
        </p>
      }
    >
      <TaxTools />
    </MarketingPage>
  );
}
