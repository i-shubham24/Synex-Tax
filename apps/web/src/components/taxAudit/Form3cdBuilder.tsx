'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileJson } from 'lucide-react';
import {
  CLAUSE_8_44AB, INDIRECT_TAX_TYPES, TAX_AUDIT_ACTS, TAX_AUDIT_BUSINESS_CODES, TAX_AUDIT_OBSERVATIONS, TAX_AUDIT_STATUS, UNBUILT_CLAUSES,
} from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';
import { Field, FieldGrid, RowsEditor, addressCols, type Col } from './fields';
import * as C from './clauseConfig';

type Obj = Record<string, unknown>;
type Rows = Obj[];

const AUDIT_FIRM_STATUSES = new Set([3, 4, 7, 12]);

const ASSESSEE: Col[] = [
  { key: 'firstName', label: 'First name (individual)' }, { key: 'middleName', label: 'Middle name' }, { key: 'name', label: 'Surname or entity name', span: 2 },
  { key: 'pan', label: 'PAN', mono: true }, { key: 'aadhaar', label: 'Aadhaar (if available)', mono: true },
  { key: 'status', label: 'Status', kind: 'select', options: Object.entries(TAX_AUDIT_STATUS).map(([k, v]) => [k, v] as const) },
  ...addressCols('address', C.STATES),
];
const INDIRECT: Col[] = [
  { key: 'type', label: 'Tax', kind: 'select', options: Object.entries(INDIRECT_TAX_TYPES) }, { key: 'regNo', label: 'Registration number or GSTIN', mono: true },
  { key: 'stateCode', label: 'State', kind: 'select', options: [['', 'Not state-wise'], ...C.STATES] }, { key: 'other', label: 'If other, name it' },
];
const AUDITOR: Col[] = [
  { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Surname' }, { key: 'membershipNo', label: 'Membership number', mono: true },
  { key: 'firmName', label: 'Firm name' }, { key: 'firmRegNo', label: 'Firm registration number', mono: true }, { key: 'signsForFirm', label: 'Signing for a firm (we, our, us)', kind: 'bool' },
  ...addressCols('address', C.STATES), { key: 'place', label: 'Place of signing' }, { key: 'signedOn', label: 'Date of signing', kind: 'date' },
];
const FORM3CA: Col[] = [
  { key: 'act', label: 'Accounts audited under', kind: 'select', options: Object.entries(TAX_AUDIT_ACTS), span: 2 }, { key: 'otherAct', label: 'If others, name the law' },
  { key: 'auditReportDate', label: 'Date of that audit report', kind: 'date' },
  { key: 'statutoryAuditor', label: 'Statutory audit by', kind: 'select', options: [['SELF', 'The same auditor'], ['OTHER', 'Another auditor']] }, { key: 'statutoryAuditorName', label: 'Name of the statutory auditor', span: 2 },
];
const FORM3CB: Col[] = [
  { key: 'headOffice', label: 'Head office location', span: 2 }, { key: 'branches', label: 'Number of branches', kind: 'amount' },
  { key: 'result', label: 'Result for the year', kind: 'select', options: [['Profit', 'Profit'], ['Loss', 'Loss'], ['Surplus', 'Surplus'], ['Deficit', 'Deficit']] },
];
const OBSERVATIONS: Col[] = [{ key: 'code', label: 'Type', kind: 'select', options: Object.entries(TAX_AUDIT_OBSERVATIONS).map(([k, v]) => [k, v.length > 70 ? `${v.slice(0, 70)}...` : v] as const), span: 2 }, { key: 'text', label: 'Observation or qualification', span: 2 }];

const S40A: Array<[key: string, title: string, opts: { tax?: boolean; deposited?: boolean }]> = [
  ['nonResidentNotDeducted', '(b)(i)(A) Payment to a non-resident, tax not deducted', {}],
  ['nonResidentNotPaid', '(b)(i)(B) Payment to a non-resident, tax deducted but not paid by the due date under section 139(1)', { tax: true }],
  ['residentNotDeducted', '(b)(ii)(A) Payment under section 40(a)(ia), tax not deducted', {}],
  ['residentNotPaid', '(b)(ii)(B) Payment under section 40(a)(ia), tax deducted but not paid by the due date', { tax: true, deposited: true }],
  ['levyNotDeducted', '(b)(iii)(A) Payment under section 40(a)(ib), levy not deducted', {}],
  ['levyNotPaid', '(b)(iii)(B) Payment under section 40(a)(ib), levy deducted but not paid by the due date', { tax: true, deposited: true }],
  ['salaryOutsideIndia', '(b)(vii) Salary payable outside India or to a non-resident without TDS', {}],
];
const S40A_AMOUNTS: Col[] = [
  { key: 'fringeBenefitTax', label: '(iv) Fringe benefit tax', kind: 'amount' }, { key: 'wealthTax', label: '(v) Wealth tax', kind: 'amount' },
  { key: 'royaltyIib', label: '(vi) Royalty or fee under 40(a)(iib)', kind: 'amount' }, { key: 'providentFundIv', label: '(viii) PF or other fund under 40(a)(iv)', kind: 'amount' },
  { key: 'perquisiteTaxV', label: '(ix) Tax on perquisites under 40(a)(v)', kind: 'amount' },
];
const C21_AMOUNTS: Col[] = [
  { key: 'gratuity40A7', label: '(e) Gratuity provision not allowable, 40A(7)', kind: 'amount', span: 2 }, { key: 'employer40A9', label: '(f) Sum not allowable, 40A(9)', kind: 'amount' },
  { key: 'interest36_1_iii', label: '(i) Interest inadmissible, proviso to 36(1)(iii)', kind: 'amount' },
];

const initialPartB = (): Record<string, Obj> => ({
  '9': { partners: [], changes: [], sharesIndeterminate: 'N' },
  '10': { codes: [], changes: [] },
  '11': { prescribed: [], maintained: [], examined: [] },
  '12': { rows: [] },
  '13': { method: '02', changes: [], icdsAdjustments: [], disclosures: [] },
  '14': { method: '3', deviations145A: [] },
  '16': { section28: [], credits: [], escalation: [], otherIncome: [], capitalReceipts: [] },
  '17': { properties: [] },
  '18': { blocks: [] },
  '19': { rows: [] },
  '20': { bonus: [], employeeContributions: [] },
  '21': { debited: [], s40a: Object.fromEntries([...S40A.map(([k]) => [k, []])]), s40b: [], s40A3: [], s40A3A: [], contingent: [], section14A: [] },
  '22': { interestInadmissible: 0, payableToMicroSmall: 0, paidInTime: 0, notPaidInTime: 0 },
  '26': { preExistingPaid: [], preExistingUnpaid: [], currentPaid: [], currentUnpaid: [], indirectTaxThroughPl: false, note: '' },
  '31': Object.fromEntries(Object.keys(C.C31).map((k) => [k, []])),
  '34': { required: true, rows: [], statementsRequired: true, statements: [], interest: 'N', interestRows: [] },
  '37': { status: 'X', details: '' },
  '38': { status: 'X', details: '' },
  '39': { status: 'X', details: '' },
  '40': { previous: { turnover: 0 }, preceding: { turnover: 0 } },
  '44': { total: 0, exempt: 0, composition: 0, otherRegistered: 0, unregistered: 0 },
});

const blank = (v: unknown) => v === '' || v === undefined || v === null;
/** Drops empty strings (optional fields left blank) so the server sees them as not given. */
function compact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(compact) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => !blank(x)).map(([k, x]) => [k, compact(x)])) as T;
  return v;
}

function toPartB(p: Record<string, Obj>, reviewed: Set<string>, status: number) {
  const out: Obj = {};
  for (const c of reviewed) {
    if (c === '9' && !AUDIT_FIRM_STATUSES.has(status)) continue;
    const v = p[c];
    if (c === '10') out.clause10 = { codes: (v.codes as Rows).map((r) => r.code), changes: v.changes };
    else if (c === '11') out.clause11 = { prescribed: (v.prescribed as Rows).map((r) => r.text), maintained: v.maintained, examined: (v.examined as Rows).map((r) => r.text) };
    else if (c === '40') out.clause40 = { previous: v.previous, preceding: v.preceding };
    else out[`clause${c}`] = v;
  }
  return compact(out);
}

function Clause({ id, title, reviewed, onReviewed, children }: { id: string; title: string; reviewed: boolean; onReviewed: (b: boolean) => void; children: React.ReactNode }) {
  return (
    <details className="rounded-[12px] border border-pos-line bg-pos-surface" id={`clause-${id}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-[14px] font-semibold text-pos-ink">{title}</span>
        <label className="flex items-center gap-2 text-[12px] text-pos-ink/65" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={reviewed} onChange={(e) => onReviewed(e.target.checked)} /> Reviewed, include
        </label>
      </summary>
      <div className="space-y-3 border-t border-pos-line px-4 py-3">{children}</div>
    </details>
  );
}

export interface ReportSeed { clause8?: string[]; form?: '3CA' | '3CB' }

/** Clause-by-clause entry for Form 3CA or 3CB with Form 3CD. Nothing is stored; the JSON downloads to this device. */
export function Form3cdBuilder({ seed }: { seed: ReportSeed | null }) {
  const { authFetch } = useAuth();
  const [form, setForm] = useState<'3CA' | '3CB'>('3CB');
  const [assessee, setAssessee] = useState<Obj>({ status: '1', address: { stateCode: '01' } });
  const [indirect, setIndirect] = useState<Rows>([]);
  const [clause8, setClause8] = useState<string[]>([]);
  const [opted8A, setOpted8A] = useState<string>('');
  const [auditor, setAuditor] = useState<Obj>({ signsForFirm: true, address: { stateCode: '01' } });
  const [accountType, setAccountType] = useState<'Profit and loss account' | 'Income and expenditure account'>('Profit and loss account');
  const [f3ca, setF3ca] = useState<Obj>({ act: '14', statutoryAuditor: 'SELF' });
  const [f3cb, setF3cb] = useState<Obj>({ branches: 0, result: 'Profit' });
  const [observations, setObservations] = useState<Rows>([]);
  const [partB, setPartB] = useState<Record<string, Obj>>(initialPartB);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [na, setNa] = useState<Set<string>>(new Set());
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [needed, setNeeded] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!seed) return;
    if (seed.form) setForm(seed.form);
    if (seed.clause8) setClause8(seed.clause8);
  }, [seed]);
  useEffect(() => {
    authFetch('/api/v1/tax-audit/status').then(async (r) => setConfigured(r.ok ? (await r.json()).softwareIdConfigured : false)).catch(() => setConfigured(false));
  }, [authFetch]);

  const status = Number(assessee.status ?? 1);
  const set = (c: string, key: string) => (v: unknown) => setPartB((p) => ({ ...p, [c]: { ...p[c], [key]: v } }));
  const rv = (c: string) => ({ reviewed: reviewed.has(c), onReviewed: (b: boolean) => setReviewed((s) => { const n = new Set(s); if (b) n.add(c); else n.delete(c); return n; }) });
  const businessCodes = useMemo(() => Object.entries(TAX_AUDIT_BUSINESS_CODES), []);
  const builtShown = Object.keys(C.BUILT_LABELS).filter((c) => c !== '9' || AUDIT_FIRM_STATUSES.has(status));

  const submit = async () => {
    setBusy(true);
    setIssues([]); setNeeded([]); setMessage(null);
    const body = compact({
      form,
      assessee: { ...assessee, status, pan: String(assessee.pan ?? '').toUpperCase(), indirectTax: indirect },
      clause8,
      clause8A: opted8A ? { opted: true, section: opted8A } : { opted: false },
      auditor,
      accountType,
      form3CA: form === '3CA' ? f3ca : undefined,
      form3CB: form === '3CB' ? f3cb : undefined,
      observations,
      partB: toPartB(partB, reviewed, status),
      notApplicable: [...na],
    });
    try {
      const r = await authFetch('/api/v1/tax-audit/form3cd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 422) { setIssues(b.issues ?? []); setNeeded(b.clausesNeeded ?? []); return; }
      if (!r.ok) { setMessage(b.message ?? 'Not prepared.'); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(b.json)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = b.fileName; a.click();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded ${b.fileName}. Depreciation allowable ₹${Number(b.summary?.depreciationAllowable ?? 0).toLocaleString('en-IN')}.`);
    } catch {
      setMessage('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const p = partB;
  return (
    <section className="pos-card space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> Tax audit report file, AY 2026-27</h2>
      <p className="text-[13px] text-pos-ink/65">Form 3CA or 3CB with Form 3CD, written to the Department&apos;s schema version 2.5. Open each clause, enter it, and tick it as reviewed; clauses not built here can be marked not applicable. Upload the file on the e-filing portal for the assessee to accept.</p>

      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/75">
        <label className="flex items-center gap-2">Report
          <select value={form} onChange={(e) => setForm(e.target.value as '3CA' | '3CB')} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
            <option value="3CB">Form 3CB (no audit under another law)</option><option value="3CA">Form 3CA (audited under another law)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Accounts
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
            <option>Profit and loss account</option><option>Income and expenditure account</option>
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Part A: assessee (clauses 1 to 7)</h3>
        <FieldGrid cols={ASSESSEE} value={assessee} onChange={setAssessee} />
        <RowsEditor title="Clause 4: indirect tax registrations" cols={INDIRECT} rows={indirect} onChange={setIndirect} addLabel="Add a registration" />
      </div>
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Clause 8: section 44AB clause</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {Object.entries(CLAUSE_8_44AB).map(([k, l]) => (
            <label key={k} className="flex items-start gap-2 text-[13px] text-pos-ink/75"><input type="checkbox" className="mt-1" checked={clause8.includes(k)} onChange={(e) => setClause8(e.target.checked ? [...clause8, k] : clause8.filter((x) => x !== k))} /> {l}</label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/75">Clause 8A: option for a concessional rate
          <select value={opted8A} onChange={(e) => setOpted8A(e.target.value)} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
            <option value="">Not opted</option>{['115BA', '115BAA', '115BAB', '115BAC', '115BAD', '115BAE'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Auditor</h3>
        <FieldGrid cols={AUDITOR} value={auditor} onChange={setAuditor} />
        {form === '3CA' ? <FieldGrid cols={FORM3CA} value={f3ca} onChange={setF3ca} /> : <FieldGrid cols={FORM3CB} value={f3cb} onChange={setF3cb} />}
        <RowsEditor title="Observations or qualifications" cols={OBSERVATIONS} rows={observations} onChange={setObservations} addLabel="Add an observation" />
      </div>

      <datalist id="ta-business-codes">{businessCodes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</datalist>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Part B</h3>
        {AUDIT_FIRM_STATUSES.has(status) && (
          <Clause id="9" title={C.BUILT_LABELS['9']} {...rv('9')}>
            <RowsEditor title="(a) Partners or members" cols={C.C9_PARTNERS} rows={p['9'].partners as Rows} onChange={set('9', 'partners')} addLabel="Add a partner" />
            {(status === 7 || status === 12) && <Field col={{ key: 's', label: 'Shares of members indeterminate or unknown', kind: 'select', options: [['N', 'No'], ['Y', 'Yes']] }} value={p['9'].sharesIndeterminate} onChange={set('9', 'sharesIndeterminate')} />}
            <RowsEditor title="(b) Changes since the end of the preceding year" cols={C.C9_CHANGES} rows={p['9'].changes as Rows} onChange={set('9', 'changes')} addLabel="Add a change" />
          </Clause>
        )}
        <Clause id="10" title={C.BUILT_LABELS['10']} {...rv('10')}>
          <RowsEditor title="(a) Every business or profession" cols={C.C10_CODES} rows={p['10'].codes as Rows} onChange={set('10', 'codes')} addLabel="Add a code" note="Type to search the Department's code list." />
          <RowsEditor title="(b) Changes in the year" cols={C.C10_CHANGES} rows={p['10'].changes as Rows} onChange={set('10', 'changes')} addLabel="Add a change" />
        </Clause>
        <Clause id="11" title={C.BUILT_LABELS['11']} {...rv('11')}>
          <RowsEditor title="(a) Books prescribed under section 44AA (none: answered No)" cols={C.TEXT_ROW} rows={p['11'].prescribed as Rows} onChange={set('11', 'prescribed')} />
          <RowsEditor title="(b) Books maintained and where they are kept" cols={C.C11_MAINTAINED} rows={p['11'].maintained as Rows} onChange={set('11', 'maintained')} />
          <RowsEditor title="(c) Books and documents examined" cols={C.TEXT_ROW} rows={p['11'].examined as Rows} onChange={set('11', 'examined')} />
        </Clause>
        <Clause id="12" title={C.BUILT_LABELS['12']} {...rv('12')}>
          <RowsEditor cols={C.C12} rows={p['12'].rows as Rows} onChange={set('12', 'rows')} note="No rows answers No." />
        </Clause>
        <Clause id="13" title={C.BUILT_LABELS['13']} {...rv('13')}>
          <Field col={{ key: 'm', label: '(a) Method of accounting', kind: 'select', options: [['02', 'Mercantile'], ['01', 'Cash']] }} value={p['13'].method} onChange={set('13', 'method')} />
          <RowsEditor title="(b) and (c) Change in method and its effect (none: answered No)" cols={C.EFFECT} rows={p['13'].changes as Rows} onChange={set('13', 'changes')} />
          <RowsEditor title="(d) and (e) Adjustments for ICDS (none: answered No)" cols={C.C13_ICDS} rows={p['13'].icdsAdjustments as Rows} onChange={set('13', 'icdsAdjustments')} />
          <RowsEditor title="(f) Disclosures as per ICDS" cols={C.C13_DISCLOSURE} rows={p['13'].disclosures as Rows} onChange={set('13', 'disclosures')} />
        </Clause>
        <Clause id="14" title={C.BUILT_LABELS['14']} {...rv('14')}>
          <Field col={{ key: 'm', label: '(a) Method of valuation', kind: 'select', options: [['3', 'Lower of cost or market rate'], ['1', 'At cost'], ['2', 'At market rate']] }} value={p['14'].method} onChange={set('14', 'method')} />
          <RowsEditor title="(b) Deviation from section 145A and its effect (none: answered No)" cols={C.EFFECT} rows={p['14'].deviations145A as Rows} onChange={set('14', 'deviations145A')} />
        </Clause>
        <Clause id="16" title={C.BUILT_LABELS['16']} {...rv('16')}>
          <RowsEditor title="(a) Items within section 28" cols={C.DESCRIBED} rows={p['16'].section28 as Rows} onChange={set('16', 'section28')} />
          <RowsEditor title="(b) Pro forma credits, drawbacks and refunds" cols={C.C16_CREDITS} rows={p['16'].credits as Rows} onChange={set('16', 'credits')} />
          <RowsEditor title="(c) Escalation claims accepted" cols={C.DESCRIBED} rows={p['16'].escalation as Rows} onChange={set('16', 'escalation')} />
          <RowsEditor title="(d) Any other item of income" cols={C.DESCRIBED} rows={p['16'].otherIncome as Rows} onChange={set('16', 'otherIncome')} />
          <RowsEditor title="(e) Capital receipts" cols={C.DESCRIBED} rows={p['16'].capitalReceipts as Rows} onChange={set('16', 'capitalReceipts')} />
        </Clause>
        <Clause id="17" title={C.BUILT_LABELS['17']} {...rv('17')}>
          <RowsEditor cols={C.C17} rows={p['17'].properties as Rows} onChange={set('17', 'properties')} addLabel="Add a property" />
        </Clause>
        <Clause id="18" title={C.BUILT_LABELS['18']} {...rv('18')}>
          <p className="text-[12px] text-pos-ink/55">Depreciation is worked at the block rate, half the rate on additions used for less than 180 days (section 32(1)(ii), second proviso). Enter the figure yourself for additional depreciation or the straight line method.</p>
          {(p['18'].blocks as Rows).map((blk, k) => {
            const blocks = p['18'].blocks as Rows;
            const put = (v: Obj) => set('18', 'blocks')(blocks.map((x, n) => (n === k ? v : x)));
            return (
              <div key={k} className="space-y-2 rounded-[10px] bg-pos-muted p-3">
                <FieldGrid cols={C.C18_BLOCK} value={blk} onChange={put} />
                <RowsEditor title="Additions" cols={C.C18_ADD} rows={blk.additions as Rows} onChange={(r) => put({ ...blk, additions: r })} addLabel="Add an addition" />
                <RowsEditor title="Deductions" cols={C.C18_DED} rows={blk.deductions as Rows} onChange={(r) => put({ ...blk, deductions: r })} addLabel="Add a sale" />
                <button type="button" onClick={() => set('18', 'blocks')(blocks.filter((_, n) => n !== k))} className="text-[13px] text-[#dc2626]">Remove this block</button>
              </div>
            );
          })}
          <button type="button" onClick={() => set('18', 'blocks')([...(p['18'].blocks as Rows), { block: '1', rate: 15, method: 'WDV', openingWdv: 0, additions: [], deductions: [] }])} className="text-[13px] text-pos-accent">Add a block of assets</button>
        </Clause>
        <Clause id="19" title={C.BUILT_LABELS['19']} {...rv('19')}>
          <RowsEditor cols={C.C19} rows={p['19'].rows as Rows} onChange={set('19', 'rows')} />
        </Clause>
        <Clause id="20" title={C.BUILT_LABELS['20']} {...rv('20')}>
          <RowsEditor title="(a) Bonus or commission, section 36(1)(ii)" cols={C.DESCRIBED} rows={p['20'].bonus as Rows} onChange={set('20', 'bonus')} />
          <RowsEditor title="(b) Employees' contributions, section 36(1)(va)" cols={C.C20_PF} rows={p['20'].employeeContributions as Rows} onChange={set('20', 'employeeContributions')} />
        </Clause>
        <Clause id="21" title={C.BUILT_LABELS['21']} {...rv('21')}>
          <RowsEditor title="(a) Capital, personal, advertisement and similar expenditure" cols={C.C21_DEBITED} rows={p['21'].debited as Rows} onChange={set('21', 'debited')} />
          {S40A.map(([k, title, opts]) => (
            <RowsEditor key={k} title={title} cols={C.payeeCols(opts)} rows={(p['21'].s40a as Obj)[k] as Rows} onChange={(r) => set('21', 's40a')({ ...(p['21'].s40a as Obj), [k]: r })} />
          ))}
          <FieldGrid cols={S40A_AMOUNTS} value={p['21'].s40a} onChange={(v) => set('21', 's40a')(v)} />
          <RowsEditor title="(c) Interest, salary, bonus, commission or remuneration, section 40(b) or 40(ba)" cols={C.C21_40B} rows={p['21'].s40b as Rows} onChange={set('21', 's40b')} />
          <RowsEditor title="(d)(A) Payments under section 40A(3) not by account payee cheque, draft or electronic means (none: answered Yes)" cols={C.C21_40A3} rows={p['21'].s40A3 as Rows} onChange={set('21', 's40A3')} />
          <RowsEditor title="(d)(B) Payments under section 40A(3A) (none: answered Yes)" cols={C.C21_40A3} rows={p['21'].s40A3A as Rows} onChange={set('21', 's40A3A')} />
          <FieldGrid cols={C21_AMOUNTS} value={p['21']} onChange={(v) => setPartB((x) => ({ ...x, '21': v }))} />
          <RowsEditor title="(g) Contingent liabilities" cols={C.DESCRIBED} rows={p['21'].contingent as Rows} onChange={set('21', 'contingent')} />
          <RowsEditor title="(h) Inadmissible under section 14A" cols={C.DESCRIBED} rows={p['21'].section14A as Rows} onChange={set('21', 'section14A')} />
        </Clause>
        <Clause id="22" title={C.BUILT_LABELS['22']} {...rv('22')}>
          <FieldGrid cols={C.C22} value={p['22']} onChange={(v) => setPartB((x) => ({ ...x, '22': v }))} />
        </Clause>
        <Clause id="26" title={C.BUILT_LABELS['26']} {...rv('26')}>
          <RowsEditor title="(i)(A)(a) Pre-existing on 1 Apr 2025, paid in the year" cols={C.C26} rows={p['26'].preExistingPaid as Rows} onChange={set('26', 'preExistingPaid')} />
          <RowsEditor title="(i)(A)(b) Pre-existing, not paid in the year" cols={C.C26} rows={p['26'].preExistingUnpaid as Rows} onChange={set('26', 'preExistingUnpaid')} />
          <RowsEditor title="(i)(B)(a) Incurred in the year, paid by the due date under section 139(1)" cols={C.C26} rows={p['26'].currentPaid as Rows} onChange={set('26', 'currentPaid')} />
          <RowsEditor title="(i)(B)(b) Incurred in the year, not paid by that date" cols={C.C26} rows={p['26'].currentUnpaid as Rows} onChange={set('26', 'currentUnpaid')} />
          <FieldGrid cols={[{ key: 'indirectTaxThroughPl', label: 'Indirect taxes passed through the profit and loss account', kind: 'bool', span: 2 }, { key: 'note', label: 'Note', span: 2 }]} value={p['26']} onChange={(v) => setPartB((x) => ({ ...x, '26': v }))} />
        </Clause>
        <Clause id="31" title={C.BUILT_LABELS['31']} {...rv('31')}>
          {(Object.keys(C.C31) as (keyof typeof C.C31)[]).map((k) => (
            <RowsEditor key={k} title={C.C31_TITLES[k]} cols={C.C31[k]} rows={p['31'][k] as Rows} onChange={set('31', k)} />
          ))}
        </Clause>
        <Clause id="34" title={C.BUILT_LABELS['34']} {...rv('34')}>
          <FieldGrid cols={[{ key: 'required', label: '(a) Required to deduct or collect tax', kind: 'bool', span: 2 }, { key: 'statementsRequired', label: '(b) Required to furnish TDS or TCS statements', kind: 'bool', span: 2 }]} value={p['34']} onChange={(v) => setPartB((x) => ({ ...x, '34': v }))} />
          <RowsEditor title="(a) Section-wise details" cols={C.C34A} rows={p['34'].rows as Rows} onChange={set('34', 'rows')} note="Columns 6 to 10 match the TDS register's clause 34(a) totals; columns 4 and 5 come from the books." />
          <RowsEditor title="(b) Statements" cols={C.C34B} rows={p['34'].statements as Rows} onChange={set('34', 'statements')} />
          <Field col={{ key: 'i', label: '(c) Liable to interest under 201(1A) or 206C(7)', kind: 'select', options: C.AUDIT_STATUS }} value={p['34'].interest} onChange={set('34', 'interest')} />
          <RowsEditor title="(c) Interest" cols={C.C34C} rows={p['34'].interestRows as Rows} onChange={set('34', 'interestRows')} />
        </Clause>
        {(['37', '38', '39'] as const).map((c) => (
          <Clause key={c} id={c} title={C.BUILT_LABELS[c]} {...rv(c)}>
            <FieldGrid cols={[{ key: 'status', label: 'Answer', kind: 'select', options: C.AUDIT_STATUS }, { key: 'details', label: 'Disqualification or disagreement reported, if any', span: 3 }]} value={p[c]} onChange={(v) => setPartB((x) => ({ ...x, [c]: v }))} />
          </Clause>
        ))}
        <Clause id="40" title={C.BUILT_LABELS['40']} {...rv('40')}>
          <h4 className="text-[13px] font-semibold text-pos-ink">Previous year 2025-26</h4>
          <FieldGrid cols={C.RATIO} value={p['40'].previous} onChange={set('40', 'previous')} />
          <h4 className="text-[13px] font-semibold text-pos-ink">Preceding year 2024-25</h4>
          <FieldGrid cols={C.RATIO} value={p['40'].preceding} onChange={set('40', 'preceding')} />
        </Clause>
        <Clause id="44" title={C.BUILT_LABELS['44']} {...rv('44')}>
          <FieldGrid cols={C.C44} value={p['44']} onChange={(v) => setPartB((x) => ({ ...x, '44': v }))} />
        </Clause>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-pos-ink">Clauses not built here</h3>
            <p className="text-[12px] text-pos-ink/65">Tick a clause only if it does not apply to this assessee; the file then answers it as shown. Otherwise prepare the report in the Department&apos;s utility.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNa(new Set(UNBUILT_CLAUSES))}
              className="rounded-full border border-pos-line bg-pos-surface px-3 py-1 text-[12px] font-medium text-pos-ink/80 transition-colors hover:bg-pos-muted"
            >
              Mark all not applicable
            </button>
            <button
              type="button"
              onClick={() => setNa(new Set())}
              className="rounded-full border border-pos-line bg-pos-surface px-3 py-1 text-[12px] font-medium text-pos-ink/80 transition-colors hover:bg-pos-muted"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {UNBUILT_CLAUSES.map((c) => (
            <label key={c} className="flex items-start gap-2 text-[13px] text-pos-ink/75">
              <input type="checkbox" className="mt-1" checked={na.has(c)} onChange={(e) => setNa((s) => { const n = new Set(s); if (e.target.checked) n.add(c); else n.delete(c); return n; })} />
              <span><span className="font-mono">{c}</span> {C.UNBUILT_LABELS[c]}</span>
            </label>
          ))}
        </div>
      </div>

      {configured === false && <p className="rounded-[10px] bg-[#b45309]/10 px-3 py-2 text-[13px] text-[#b45309]">The schema needs the software ID the Department issues to a registered e-return intermediary. Set ITR_SOFTWARE_ID on the server; until then the report is checked but the file is not written.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download tax audit JSON' : 'Check the report'}</button>
        <span className="text-[12px] text-pos-ink/55">{reviewed.size} of {builtShown.length} clauses reviewed, {na.size} of {UNBUILT_CLAUSES.length} marked not applicable</span>
      </div>
      {message && <p className="text-[13px] text-pos-ink/75">{message}</p>}
      {needed.length > 0 && <p className="text-[13px] text-[#b45309]">Clauses still needed: <span className="font-mono">{needed.join(', ')}</span></p>}
      {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#dc2626]">{issues.filter((i) => i.field !== 'clauses').map((i, k) => <li key={k}><span className="font-mono text-[12px] text-pos-ink/60">{i.field}</span> {i.message}</li>)}</ul>}
    </section>
  );
}
