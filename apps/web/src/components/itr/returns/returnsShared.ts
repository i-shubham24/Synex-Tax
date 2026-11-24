import { ITR_ASSESSMENT_YEARS, type SavedReturnSummary } from '@synextax/tax-engine';

export const ASSESSMENT_YEARS = [...ITR_ASSESSMENT_YEARS].reverse();
export type Ay = (typeof ITR_ASSESSMENT_YEARS)[number];
export type ReturnStatus = 'DRAFT' | 'READY' | 'FILED';

export interface ClientOption { id: string; name: string; pan: string; isCompany: boolean; constitution: string }

export interface YearRow {
  id: string; assessmentYear: Ay; form: string; regime: 'NEW' | 'OLD'; status: ReturnStatus; ackNumber: string | null; filedOn: string | null;
  basis: 'ENGINE' | 'ENTERED' | null; totalIncome: number; totalTax: number; taxesPaid: number; payable: number; version: string;
}

export interface SavedPayment { bsr?: string; date: string; serial?: number; amount: number; kind: 'ADVANCE' | 'SELF' }
export interface FiledFiguresIn { totalIncome: number; totalTax: number; surcharge?: number; cess?: number; tdsTcs?: number; advanceTax?: number; selfAssessment?: number }

export interface SavedReturn {
  id: string; entityId: string; entityName: string; pan: string; isCompany: boolean; firmName: string;
  assessmentYear: Ay; form: string; regime: 'NEW' | 'OLD';
  input: { values: Record<string, string>; ageBand: 'BELOW_60' | 'SENIOR' | 'SUPER_SENIOR'; metroCity: boolean; payments: SavedPayment[]; filed?: FiledFiguresIn };
  summary: SavedReturnSummary; status: ReturnStatus; ackNumber: string | null; filedOn: string | null; notes: string; version: string; createdAt: string;
}

export const STATUS_LABEL: Record<ReturnStatus | 'NONE', string> = { DRAFT: 'Draft', READY: 'Ready to file', FILED: 'Filed', NONE: 'Not started' };

export const inr = (v: number | null | undefined) => (v === null || v === undefined ? '' : `₹${Math.round(v).toLocaleString('en-IN')}`);
export const niceDate = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

/** The taxpayer kind of a client, for the form picker (Rule 12). */
export const taxpayerOf = (c: ClientOption | undefined): 'INDIVIDUAL' | 'FIRM' | 'COMPANY' =>
  !c ? 'INDIVIDUAL' : c.isCompany ? 'COMPANY' : ['PARTNERSHIP', 'LLP'].includes(c.constitution) ? 'FIRM' : 'INDIVIDUAL';

export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] text-white disabled:opacity-50';
export const btnQuiet = 'inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[13px] text-pos-ink hover:bg-pos-tint disabled:opacity-50';
export const fieldCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
