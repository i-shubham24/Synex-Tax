'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { cgGain, type CgSale, type ItrTaxPayment } from '@synextax/tax-engine';
import type { ItrStatementsApply } from '../itrStatements/ItrStatementsImportPanel';

/**
 * What the imports on the ITR page found, for every return form to read: last year's return, Form 16,
 * Form 26AS and the capital gains report. The panels write here; the forms fill only fields that are
 * empty (or still hold what an import put there), so nothing the user typed is overwritten. Each value
 * keeps the file it came from, so a form can show what was filled from where. Nothing here is saved.
 */

export type Filled = { value: string; source: string };
export const SOURCE = {
  earlier: "Last year's return",
  form16: 'Form 16',
  f26: 'Form 26AS',
  cg: 'Capital gains report',
} as const;

export interface ItrDraft {
  /** Details typed into the return forms (PERSON_FIELDS, ENTITY_FIELDS and the employer fields). */
  details: Record<string, Filled>;
  /** Figures on the ITR page, keyed like 'salary.gross'. */
  page: Record<string, Filled>;
  regime: { value: 'NEW' | 'OLD'; source: string } | null;
  sales: { items: CgSale[]; source: string } | null;
  payments: { items: ItrTaxPayment[]; source: string } | null;
  /** Each import, newest last, for the summary on the page. */
  log: Array<{ source: string; what: string }>;
}

const EMPTY: ItrDraft = { details: {}, page: {}, regime: null, sales: null, payments: null, log: [] };

interface Ctx {
  draft: ItrDraft;
  applyEarlierReturn: (prefill: Record<string, unknown>) => void;
  applyStatements: (d: ItrStatementsApply) => void;
  clear: () => void;
}

const DraftContext = createContext<Ctx | null>(null);

/** The window event EarlierReturnCard sends with this year's prefill (the PAN is never in it). */
const EARLIER_RETURN_EVENT = 'synextax:itr-earlier-return';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const whole = (n: number) => String(Math.max(0, Math.round(n)));

/** Last year's return as details for this year's forms. */
export function fromEarlierReturn(prefill: Record<string, unknown>): Pick<ItrDraft, 'details' | 'regime'> {
  const p = obj(prefill.person);
  const a = obj(p.address);
  const bank = obj(prefill.bank);
  const employers = Array.isArray(prefill.employers) ? prefill.employers.map(obj) : [];
  const e = employers[0] ?? {};
  const pairs: Array<[string, unknown]> = [
    ['firstName', p.firstName], ['surname', p.surname], ['dob', p.dob], ['fatherName', p.fatherName], ['mobile', p.mobile], ['email', p.email], ['place', p.place],
    ['residenceNo', a.residenceNo], ['locality', a.locality], ['city', a.city], ['stateCode', a.stateCode], ['pin', a.pin],
    ['bankIfsc', bank.ifsc], ['bankName', bank.name], ['bankAccount', bank.account],
    ['employerName', e.name], ['employerTan', e.tan], ['employerAddress', obj(e.address).line],
  ];
  const details: Record<string, Filled> = {};
  for (const [k, v] of pairs) if (str(v)) details[k] = { value: str(v), source: SOURCE.earlier };
  const regime = str(obj(prefill.filing).regime);
  return { details, regime: regime === 'NEW' || regime === 'OLD' ? { value: regime, source: SOURCE.earlier } : null };
}

/** Form 16, Form 26AS and the capital gains report as page figures and form details. */
export function fromStatements(d: ItrStatementsApply): Omit<ItrDraft, 'log'> {
  const details: Record<string, Filled> = {};
  const page: Record<string, Filled> = {};
  const sum = (xs: number[]) => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  const fromForm16 = d.employers.length > 0;
  const salarySource = fromForm16 ? SOURCE.form16 : SOURCE.f26;

  if (fromForm16) {
    const e = d.employers[0];
    if (e.tan) details.employerTan = { value: e.tan, source: SOURCE.form16 };
    if (e.name) details.employerName = { value: e.name, source: SOURCE.form16 };
    page['salary.gross'] = { value: whole(sum(d.employers.map((x) => x.gross))), source: SOURCE.form16 };
    const pt = sum(d.employers.map((x) => x.professionalTax));
    if (pt > 0) page['salary.professionalTax'] = { value: whole(pt), source: SOURCE.form16 };
  }
  const salaryTds = sum(d.salaryTds.map((x) => x.tds));
  if (d.salaryTds.length) details.salaryTds = { value: whole(salaryTds), source: salarySource };
  const otherTds = sum(d.otherTds.map((x) => x.tds));
  if (d.salaryTds.length || d.otherTds.length) {
    page['taxesPaid.tds'] = { value: whole(salaryTds + otherTds), source: d.otherTds.length && fromForm16 ? `${SOURCE.form16} and ${SOURCE.f26}` : d.otherTds.length ? SOURCE.f26 : salarySource };
  }
  if (d.tcs.length) page['taxesPaid.tcs'] = { value: whole(sum(d.tcs.map((x) => x.tcs))), source: SOURCE.f26 };
  const adv = d.taxPayments.filter((p) => p.kind === 'ADVANCE');
  const self = d.taxPayments.filter((p) => p.kind === 'SELF');
  if (adv.length) page['taxesPaid.advanceTax'] = { value: whole(sum(adv.map((p) => p.amount))), source: SOURCE.f26 };
  if (self.length) page['taxesPaid.selfAssessment'] = { value: whole(sum(self.map((p) => p.amount))), source: SOURCE.f26 };

  if (d.capitalGains.length) {
    const byKind = (k: CgSale['kind']) => sum(d.capitalGains.filter((s) => s.kind === k).map((s) => cgGain(s).gain));
    const put = (key: string, v: number) => { if (v > 0) page[key] = { value: whole(v), source: SOURCE.cg }; };
    put('capitalGains.equityShortTerm', byKind('111A'));
    put('capitalGains.equityLongTerm', byKind('112A'));
    put('capitalGains.otherShortTerm', byKind('STCG'));
    put('capitalGains.otherLongTerm', byKind('LTCG'));
  }
  return {
    details, page,
    regime: d.regime ? { value: d.regime, source: SOURCE.form16 } : null,
    sales: d.capitalGains.length ? { items: d.capitalGains, source: SOURCE.cg } : null,
    payments: d.taxPayments.length ? { items: d.taxPayments, source: SOURCE.f26 } : null,
  };
}

export function ItrDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<ItrDraft>(EMPTY);

  const applyEarlierReturn = useCallback((prefill: Record<string, unknown>) => {
    const r = fromEarlierReturn(prefill);
    setDraft((d) => ({
      ...d,
      details: { ...d.details, ...r.details },
      regime: r.regime ?? d.regime,
      log: [...d.log, { source: SOURCE.earlier, what: `${Object.keys(r.details).length} details${r.regime ? ' and the regime' : ''}` }],
    }));
  }, []);

  const applyStatements = useCallback((s: ItrStatementsApply) => {
    const r = fromStatements(s);
    const what = [
      s.employers.length ? `${s.employers.length} Form 16` : '',
      s.otherTds.length || s.tcs.length || s.taxPayments.length ? `${s.otherTds.length + s.tcs.length} TDS and TCS rows, ${s.taxPayments.length} challans` : '',
      s.capitalGains.length ? `${s.capitalGains.length} sales` : '',
    ].filter(Boolean).join(', ');
    setDraft((d) => ({
      details: { ...d.details, ...r.details },
      page: { ...d.page, ...r.page },
      regime: r.regime ?? d.regime,
      sales: r.sales ?? d.sales,
      payments: r.payments ?? d.payments,
      log: [...d.log, { source: 'Statements', what: what || 'nothing to fill' }],
    }));
  }, []);

  const clear = useCallback(() => setDraft(EMPTY), []);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') applyEarlierReturn(detail as Record<string, unknown>);
    };
    window.addEventListener(EARLIER_RETURN_EVENT, on);
    return () => window.removeEventListener(EARLIER_RETURN_EVENT, on);
  }, [applyEarlierReturn]);

  const value = useMemo(() => ({ draft, applyEarlierReturn, applyStatements, clear }), [draft, applyEarlierReturn, applyStatements, clear]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/** The draft, or an empty one when a form is used outside the ITR page. */
export function useItrDraft(): Ctx {
  return useContext(DraftContext) ?? { draft: EMPTY, applyEarlierReturn: () => {}, applyStatements: () => {}, clear: () => {} };
}

type Fill = { key: string; label: string; source: string };

/**
 * Fills a record (form details or page figures) from the draft: a field is filled when it is empty or
 * still holds what the draft put there last time. Returns the fields that now show an imported value.
 */
function useFillRecord(entries: Record<string, Filled>, current: Record<string, string>, set: (next: Record<string, string>) => void, labels: Record<string, string>): Fill[] {
  const applied = useRef<Record<string, string>>({});
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => {
    const cur = latest.current;
    const patch: Record<string, string> = {};
    for (const [k, f] of Object.entries(entries)) {
      if (!(k in labels)) continue;
      const now = cur[k] ?? '';
      if (now === '' || now === applied.current[k]) {
        if (now !== f.value) patch[k] = f.value;
        applied.current[k] = f.value;
      }
    }
    if (Object.keys(patch).length) set({ ...cur, ...patch });
    // Runs when the draft changes (an import), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);
  return Object.entries(entries)
    .filter(([k, f]) => k in labels && current[k] === f.value && f.value !== '')
    .map(([k, f]) => ({ key: k, label: labels[k], source: f.source }));
}

const labelsOf = (fields: ReadonlyArray<readonly [string, string, string?]>) => Object.fromEntries(fields.map(([k, l]) => [k, l]));

/** Form details from the imports, for the fields the form shows. */
export function useDraftDetails(d: Record<string, string>, setD: (d: Record<string, string>) => void, fields: ReadonlyArray<readonly [string, string, string?]>): Fill[] {
  const { draft } = useItrDraft();
  const labels = useMemo(() => labelsOf(fields), [fields]);
  return useFillRecord(draft.details, d, setD, labels);
}

/** Page figures from the imports. */
export function useDraftPageValues(values: Record<string, string>, setValues: (v: Record<string, string>) => void, fields: ReadonlyArray<readonly [string, string]>): Fill[] {
  const { draft } = useItrDraft();
  const labels = useMemo(() => labelsOf(fields), [fields]);
  return useFillRecord(draft.page, values, setValues, labels);
}

/** The regime from an import, unless the user has picked one since the form opened. */
export function useDraftRegime(regime: 'NEW' | 'OLD', setRegime: (r: 'NEW' | 'OLD') => void): Fill | null {
  const { draft } = useItrDraft();
  const initial = useRef(regime);
  const applied = useRef<string | null>(null);
  const latest = useRef(regime);
  latest.current = regime;
  useEffect(() => {
    if (!draft.regime) return;
    const now = latest.current;
    if (applied.current === null ? now === initial.current : now === applied.current) {
      applied.current = draft.regime.value;
      if (now !== draft.regime.value) setRegime(draft.regime.value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.regime]);
  return draft.regime && regime === draft.regime.value && applied.current === regime ? { key: 'regime', label: 'Regime', source: draft.regime.source } : null;
}

/**
 * Rows of a list (capital gains sales, challans) from an import. Rows the user typed or changed stay; blank
 * rows and rows from an earlier import are replaced by this import's rows.
 */
export function useDraftRows<T, S>(imported: { items: S[]; source: string } | null, rows: T[], setRows: (r: T[]) => void, map: (s: S) => T, isBlank: (r: T) => boolean): Fill | null {
  const mine = useRef<Set<T>>(new Set());
  const latest = useRef(rows);
  latest.current = rows;
  useEffect(() => {
    if (!imported) return;
    const keep = latest.current.filter((r) => !mine.current.has(r) && !isBlank(r));
    const added = imported.items.map(map);
    mine.current = new Set(added);
    setRows([...keep, ...added]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imported]);
  const count = rows.filter((r) => mine.current.has(r)).length;
  return imported && count ? { key: 'rows', label: `${count} row${count === 1 ? '' : 's'}`, source: imported.source } : null;
}

/** Capital gains sales from the import, for the ITR-2 and ITR-3 sale tables. */
export function useDraftSales<T>(rows: T[], setRows: (r: T[]) => void, map: (s: CgSale) => T, isBlank: (r: T) => boolean): Fill | null {
  const { draft } = useItrDraft();
  const f = useDraftRows(draft.sales, rows, setRows, map, isBlank);
  return f ? { ...f, label: `Capital gains, ${f.label}` } : null;
}

/** Advance and self-assessment tax challans from Form 26AS. */
export function useDraftChallans<T>(rows: T[], setRows: (r: T[]) => void, map: (p: ItrTaxPayment) => T, isBlank: (r: T) => boolean): Fill | null {
  const { draft } = useItrDraft();
  const f = useDraftRows(draft.payments, rows, setRows, map, isBlank);
  return f ? { ...f, label: `Tax paid, ${f.label}` } : null;
}

/** "Filled from" line under a form: which fields came from which file. Typed fields are never listed. */
export function FilledFrom({ fills }: { fills: Array<Fill | null> }) {
  const by = new Map<string, string[]>();
  for (const f of fills) if (f) by.set(f.source, [...(by.get(f.source) ?? []), f.label]);
  if (!by.size) return null;
  return (
    <div className="rounded-[10px] border border-pos-line bg-pos-tint px-3 py-2 text-[12px] text-pos-ink/75">
      <p className="flex items-center gap-1.5 font-medium text-pos-ink"><FileCheck2 className="h-3.5 w-3.5 text-pos-accent" /> Filled from imports; check each before filing. Fields you typed are left as they are.</p>
      <ul className="mt-1 space-y-0.5">
        {[...by.entries()].map(([source, labels]) => <li key={source}><span className="font-medium text-pos-ink">{source}:</span> {labels.join(', ')}</li>)}
      </ul>
    </div>
  );
}

/** Flattens lists of fills from several hooks. */
export const fillsOf = (...xs: Array<Fill | Fill[] | null>) => xs.flatMap((x) => (Array.isArray(x) ? x : [x]));
