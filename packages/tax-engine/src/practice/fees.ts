import Decimal from 'decimal.js';
import { daysBetween, type IsoDate } from '../compliance/calendar.js';

/**
 * The firm's own billing: fee invoices to clients (tax invoices when the firm is registered,
 * bills of supply when it is not), receipts against them, and each client's ledger.
 */

/** Services a CA practice commonly bills, with SAC codes. Professional services are taxed at 18%. */
export const PRACTICE_SERVICES: Array<{ sac: string; label: string }> = [
  { sac: '998221', label: 'Financial auditing services' },
  { sac: '998222', label: 'Accounting and bookkeeping services' },
  { sac: '998231', label: 'Corporate tax consulting and preparation services' },
  { sac: '998232', label: 'Individual tax preparation and planning services' },
  { sac: '998223', label: 'Payroll services' },
  { sac: '998311', label: 'Management consulting services' },
];

export const PRACTICE_GST_RATE = 18;

export interface FeeLine {
  sac: string;
  description: string;
  amount: string | number;
}

export interface FeeInvoiceTax {
  kind: 'TAX_INVOICE' | 'BILL_OF_SUPPLY';
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  lines: Array<{ sac: string; description: string; amount: string }>;
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Tax on a fee invoice. Intra-state when the client's state (from its GSTIN, else its address)
 * is the firm's; inter-state otherwise. An unregistered firm issues a bill of supply.
 */
export function feeInvoiceTax(input: { firmGstin?: string | null; firmState: string; clientState: string; lines: FeeLine[] }): FeeInvoiceTax {
  const lines = input.lines.map((l) => ({ sac: l.sac, description: l.description.trim(), amount: r2(new Decimal(l.amount || 0)).toFixed(2) }));
  const taxable = lines.reduce((s, l) => s.add(l.amount), new Decimal(0));
  if (!input.firmGstin) return { kind: 'BILL_OF_SUPPLY', taxable: taxable.toFixed(2), cgst: '0.00', sgst: '0.00', igst: '0.00', total: taxable.toFixed(2), lines };
  const intra = input.firmState === input.clientState;
  const half = r2(taxable.mul(PRACTICE_GST_RATE).div(200));
  const igst = intra ? new Decimal(0) : r2(taxable.mul(PRACTICE_GST_RATE).div(100));
  const cgst = intra ? half : new Decimal(0);
  const total = taxable.add(cgst).add(cgst).add(igst);
  return { kind: 'TAX_INVOICE', taxable: taxable.toFixed(2), cgst: cgst.toFixed(2), sgst: cgst.toFixed(2), igst: igst.toFixed(2), total: total.toFixed(2), lines };
}

/**
 * Next invoice number in a financial-year series, kept within the 16 characters rule 46 allows:
 * PREFIX/YY-YY/NNNN, e.g. SXT/26-27/0007.
 */
export function feeInvoiceNumber(prefix: string, fyStart: number, seq: number): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'INV';
  const fy = `${String(fyStart % 100).padStart(2, '0')}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
  const n = String(seq).padStart(4, '0');
  const no = `${p}/${fy}/${n}`;
  if (no.length > 16) throw new Error('Invoice number would exceed 16 characters.');
  return no;
}

export interface LedgerEntry {
  date: IsoDate;
  kind: 'INVOICE' | 'RECEIPT';
  reference: string;
  amount: string; // invoice total or receipt amount
}

export interface ClientLedger {
  entries: Array<LedgerEntry & { debit: string; credit: string; balance: string }>;
  outstanding: string;
  ageing: { upTo30: string; days31to90: string; over90: string };
  oldestUnpaidDays: number;
}

/** Running ledger for one client and ageing of what is unpaid (receipts settle the oldest invoices first). */
export function clientLedger(entries: LedgerEntry[], today: IsoDate): ClientLedger {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'INVOICE' ? -1 : 1));
  let bal = new Decimal(0);
  const rows = sorted.map((e) => {
    const debit = e.kind === 'INVOICE' ? new Decimal(e.amount) : new Decimal(0);
    const credit = e.kind === 'RECEIPT' ? new Decimal(e.amount) : new Decimal(0);
    bal = bal.add(debit).sub(credit);
    return { ...e, debit: debit.toFixed(2), credit: credit.toFixed(2), balance: bal.toFixed(2) };
  });
  let paid = sorted.filter((e) => e.kind === 'RECEIPT').reduce((s, e) => s.add(e.amount), new Decimal(0));
  const buckets = [new Decimal(0), new Decimal(0), new Decimal(0)];
  let oldest = 0;
  for (const inv of sorted.filter((e) => e.kind === 'INVOICE')) {
    const amount = new Decimal(inv.amount);
    const settled = Decimal.min(paid, amount);
    paid = paid.sub(settled);
    const open = amount.sub(settled);
    if (open.gt(0)) {
      const age = daysBetween(inv.date, today);
      oldest = Math.max(oldest, age);
      buckets[age <= 30 ? 0 : age <= 90 ? 1 : 2] = buckets[age <= 30 ? 0 : age <= 90 ? 1 : 2].add(open);
    }
  }
  return {
    entries: rows,
    outstanding: bal.toFixed(2),
    ageing: { upTo30: buckets[0].toFixed(2), days31to90: buckets[1].toFixed(2), over90: buckets[2].toFixed(2) },
    oldestUnpaidDays: oldest,
  };
}
