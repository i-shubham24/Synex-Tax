import type { AisAddAction, AisReturnInput } from '@synextax/tax-engine';

/** Files are read in the browser and sent once; the server parses them in memory and keeps nothing. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function readJsonFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 5 MB.');
  if (file.size === 0) throw new Error('The file is empty.');
  return file.text();
}

export const inr = (v: number | undefined) => `₹${Math.round(v ?? 0).toLocaleString('en-IN')}`;
export const maskAccount = (a: string) => (a.length > 4 ? `${'X'.repeat(Math.min(8, a.length - 4))}${a.slice(-4)}` : a);

/** Figures on the computation page, keyed like 'otherSources.savingsInterest'. */
export type PageValues = Record<string, string>;
const n = (v: PageValues, k: string) => Number(v[k] || 0);

/**
 * The return being prepared, in the shape the AIS comparison reads. The page holds totals, so salary
 * is compared in total and TDS, TCS and challans are compared as totals on the page itself.
 */
export function pageReturn(v: PageValues): AisReturnInput {
  return {
    ...(n(v, 'salary.gross') ? { salary: { gross: n(v, 'salary.gross') } } : {}),
    ...(n(v, 'house.rent') ? { houses: [{ letOut: true, rent: n(v, 'house.rent') }] } : {}),
    otherSources: {
      savingsInterest: n(v, 'otherSources.savingsInterest'),
      depositInterest: n(v, 'otherSources.depositInterest'),
      dividends: n(v, 'otherSources.dividends'),
      other: n(v, 'otherSources.other'),
    },
    business: {
      ad: { digital: n(v, 'business.digitalTurnover'), cash: n(v, 'business.otherTurnover') },
      ada: { digital: n(v, 'business.professionalReceipts') },
    },
  };
}

export const pageHasGains = (v: PageValues) => ['capitalGains.equityShortTerm', 'capitalGains.equityLongTerm', 'capitalGains.otherLongTerm', 'capitalGains.otherShortTerm'].some((k) => n(v, k) > 0);

/** The change to the page's figures for an AIS line, where it maps onto a field on the page. */
export function pagePatch(v: PageValues, add: AisAddAction): { patch: PageValues; label: string } | null {
  const r = (x: number) => String(Math.round(x));
  if (add.type === 'otherSources') {
    if (add.field === 'refundInterest') return { patch: { 'otherSources.other': r(n(v, 'otherSources.other') + add.amount) }, label: 'Add to other income' };
    const key = `otherSources.${add.field}`;
    return { patch: { [key]: r(add.amount) }, label: 'Use AIS figure' };
  }
  if (add.type === 'employer') {
    return { patch: { 'salary.gross': r(n(v, 'salary.gross') + add.gross), 'taxesPaid.tds': r(n(v, 'taxesPaid.tds') + add.tds) }, label: 'Add to return' };
  }
  return null;
}
