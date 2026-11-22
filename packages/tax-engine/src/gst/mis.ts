import Decimal from 'decimal.js';
import { validateGstin } from '../validators/gstin.js';

/**
 * GST MIS and party master for one GSTIN and financial year, from the sales and purchase
 * registers kept in SynexTax. Credit notes reduce, debit notes add.
 */

export interface MisDoc {
  side: 'SALE' | 'PURCHASE';
  period: string; // YYYY-MM
  partyGstin: string | null;
  partyName: string;
  docType: 'INV' | 'CRN' | 'DBN';
  taxable: string;
  tax: string;
  /** Purchases: credit that cannot be taken (blocked or reversed). */
  ineligibleTax?: string;
}

export interface MisMonth { period: string; sales: string; outputTax: string; purchases: string; inputTax: string; netTax: string; documents: number }
export interface Party { gstin: string | null; name: string; side: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'; documents: number; sales: string; purchases: string; state: string | null; gstinValid: boolean | null }

const D = (v: string | number | undefined) => new Decimal(v || 0);

export function gstMis(fyStart: number, docs: MisDoc[]) {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    months.push(`${m >= 4 ? fyStart : fyStart + 1}-${String(m).padStart(2, '0')}`);
  }
  const byMonth = new Map(months.map((p) => [p, { s: D(0), o: D(0), p: D(0), i: D(0), n: 0 }]));
  const parties = new Map<string, { gstin: string | null; name: string; c: boolean; s: boolean; n: number; sales: Decimal; purchases: Decimal }>();
  for (const d of docs) {
    const m = byMonth.get(d.period);
    if (!m) continue;
    const sign = d.docType === 'CRN' ? -1 : 1;
    const taxable = D(d.taxable).mul(sign);
    const tax = D(d.tax).mul(sign);
    m.n += 1;
    if (d.side === 'SALE') { m.s = m.s.add(taxable); m.o = m.o.add(tax); }
    else { m.p = m.p.add(taxable); m.i = m.i.add(tax.sub(D(d.ineligibleTax).mul(sign))); }
    const key = d.partyGstin ?? `name:${d.partyName.trim().toLowerCase()}`;
    const p = parties.get(key) ?? { gstin: d.partyGstin, name: d.partyName || d.partyGstin || 'Unregistered buyers', c: false, s: false, n: 0, sales: D(0), purchases: D(0) };
    if (d.side === 'SALE') { p.c = true; p.sales = p.sales.add(taxable); } else { p.s = true; p.purchases = p.purchases.add(taxable); }
    if (!p.name && d.partyName) p.name = d.partyName;
    p.n += 1;
    parties.set(key, p);
  }
  const rows: MisMonth[] = months.map((p) => {
    const m = byMonth.get(p)!;
    return { period: p, sales: m.s.toFixed(2), outputTax: m.o.toFixed(2), purchases: m.p.toFixed(2), inputTax: m.i.toFixed(2), netTax: m.o.sub(m.i).toFixed(2), documents: m.n };
  });
  const sum = (k: keyof MisMonth) => rows.reduce((a, r) => a.add(r[k] as string), D(0)).toFixed(2);
  const partyList: Party[] = [...parties.values()]
    .map((p) => {
      const v = p.gstin ? validateGstin(p.gstin) : null;
      return { gstin: p.gstin, name: p.name, side: (p.c && p.s ? 'BOTH' : p.c ? 'CUSTOMER' : 'SUPPLIER') as Party['side'], documents: p.n, sales: p.sales.toFixed(2), purchases: p.purchases.toFixed(2), state: v?.stateName ?? null, gstinValid: v ? v.isValid : null };
    })
    .sort((a, b) => Number(b.sales) + Number(b.purchases) - (Number(a.sales) + Number(a.purchases)));
  return {
    year: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`,
    months: rows,
    totals: { sales: sum('sales'), outputTax: sum('outputTax'), purchases: sum('purchases'), inputTax: sum('inputTax'), netTax: sum('netTax') },
    topCustomers: partyList.filter((p) => p.side !== 'SUPPLIER').sort((a, b) => Number(b.sales) - Number(a.sales)).slice(0, 10),
    topSuppliers: partyList.filter((p) => p.side !== 'CUSTOMER').sort((a, b) => Number(b.purchases) - Number(a.purchases)).slice(0, 10),
    parties: partyList,
  };
}
