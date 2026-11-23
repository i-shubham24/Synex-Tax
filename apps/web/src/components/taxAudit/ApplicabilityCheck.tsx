'use client';

import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FieldGrid, type Col } from './fields';

type Obj = Record<string, unknown>;

export interface ApplicabilityOutcome {
  required: boolean | null;
  clauses: string[];
  form: '3CA' | '3CB' | null;
  findings: { clause?: string; outcome: 'REQUIRED' | 'NOT_REQUIRED' | 'NEEDS_INPUT' | 'NOTE'; message: string; source: string }[];
  missing: string[];
}

const BUSINESS: Col[] = [
  { key: 'turnover', label: 'Turnover or gross receipts of business', kind: 'amount' },
  { key: 'totalReceipts', label: 'All amounts received in the year', kind: 'amount' },
  { key: 'cashReceipts', label: 'Of which in cash or non account payee cheque', kind: 'amount' },
  { key: 'totalPayments', label: 'All payments made in the year', kind: 'amount' },
  { key: 'cashPayments', label: 'Of which in cash or non account payee cheque', kind: 'amount' },
  { key: 'section44AD4Applies', label: 'Section 44AD(4) applies (left 44AD within five years)', kind: 'bool', span: 2 },
  { key: 'lowerThanDeemed44AE', label: 'Income below the 44AE figure', kind: 'bool' },
  { key: 'lowerThanDeemed44BB', label: 'Income below the 44BB figure', kind: 'bool' },
  { key: 'lowerThanDeemed44BBB', label: 'Income below the 44BBB figure', kind: 'bool' },
];
const AD: Col[] = [
  { key: 'declaredIncome', label: 'Profit declared under 44AD', kind: 'signed' },
  { key: 'digitalTurnover', label: 'Turnover received by banking channels', kind: 'amount' },
];
const PROFESSION: Col[] = [
  { key: 'grossReceipts', label: 'Gross receipts of profession', kind: 'amount' },
  { key: 'cashReceipts', label: 'Of which in cash', kind: 'amount' },
];

const TONE: Record<ApplicabilityOutcome['findings'][number]['outcome'], string> = {
  REQUIRED: 'text-[#b91c1c]',
  NOT_REQUIRED: 'text-[#15803d]',
  NEEDS_INPUT: 'text-[#b45309]',
  NOTE: 'text-pos-ink/70',
};

/** Section 44AB check for the previous year 2025-26. Figures are sent once and not stored. */
export function ApplicabilityCheck({ onUse }: { onUse: (r: ApplicabilityOutcome) => void }) {
  const { authFetch } = useAuth();
  const [hasBusiness, setHasBusiness] = useState(true);
  const [hasProfession, setHasProfession] = useState(false);
  const [business, setBusiness] = useState<Obj>({});
  const [ad, setAd] = useState<Obj | null>(null);
  const [profession, setProfession] = useState<Obj>({});
  const [ada, setAda] = useState<string>('');
  const [aboveExemption, setAboveExemption] = useState<'' | 'yes' | 'no'>('');
  const [otherLaw, setOtherLaw] = useState(false);
  const [result, setResult] = useState<ApplicabilityOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        business: hasBusiness ? { turnover: 0, ...business, presumptive44AD: ad ? { declaredIncome: 0, digitalTurnover: 0, ...ad } : undefined } : undefined,
        profession: hasProfession ? { grossReceipts: 0, ...profession, presumptive44ADA: ada !== '' ? { declaredIncome: Number(ada) } : undefined } : undefined,
        incomeAboveExemption: aboveExemption === '' ? undefined : aboveExemption === 'yes',
        auditedUnderOtherLaw: otherLaw,
      };
      const r = await authFetch('/api/v1/tax-audit/applicability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setError(b.message ?? 'Could not check.');
      else setResult(b as ApplicabilityOutcome);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><Scale className="h-4 w-4 text-pos-accent" /> Is a tax audit required?</h2>
      <p className="text-[13px] text-pos-ink/65">Section 44AB for the previous year 2025-26. Turnover above ₹1 crore needs an audit; the limit is ₹10 crore when cash receipts and cash payments are each within 5%. Profession above ₹50 lakh. Presumptive limits as the Department applies them for AY 2026-27.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/75">
        <label className="flex items-center gap-2"><input type="checkbox" checked={hasBusiness} onChange={(e) => setHasBusiness(e.target.checked)} /> Business</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hasProfession} onChange={(e) => setHasProfession(e.target.checked)} /> Profession</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={otherLaw} onChange={(e) => setOtherLaw(e.target.checked)} /> Accounts audited under another law</label>
      </div>
      {hasBusiness && (
        <div className="space-y-2">
          <FieldGrid cols={BUSINESS} value={business} onChange={setBusiness} />
          <label className="flex items-center gap-2 text-[13px] text-pos-ink/75"><input type="checkbox" checked={!!ad} onChange={(e) => setAd(e.target.checked ? {} : null)} /> Profit declared under section 44AD</label>
          {ad && <FieldGrid cols={AD} value={ad} onChange={setAd} />}
        </div>
      )}
      {hasProfession && (
        <div className="space-y-2">
          <FieldGrid cols={PROFESSION} value={profession} onChange={setProfession} />
          <label className="block max-w-xs text-[12px] font-medium text-pos-ink/75">Income declared under 44ADA (blank if not used)
            <input inputMode="decimal" value={ada} onChange={(e) => setAda(e.target.value.replace(/[^0-9]/g, ''))} className="h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-right font-mono text-[13px] text-pos-ink" />
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px] text-pos-ink/75">Total income above the amount not chargeable to tax
        <select value={aboveExemption} onChange={(e) => setAboveExemption(e.target.value as '' | 'yes' | 'no')} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-[13px] text-pos-ink">
          <option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option>
        </select>
      </label>
      <button type="button" onClick={check} disabled={busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">Check</button>
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {result && (
        <div className="space-y-2 rounded-[10px] bg-pos-muted p-3">
          <p className="text-[14px] font-semibold text-pos-ink">
            {result.required === true ? `Audit required: Form ${result.form} with Form 3CD` : result.required === false ? 'No audit required under section 44AB' : 'More figures are needed to decide'}
          </p>
          <ul className="space-y-1 text-[13px]">
            {result.findings.map((f, k) => (
              <li key={k} className={TONE[f.outcome]}>{f.message} <span className="text-pos-ink/60">({f.source})</span></li>
            ))}
          </ul>
          {result.required && (
            <button type="button" onClick={() => onUse(result)} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[13px] text-pos-ink">Use for the report: clause 8 {result.clauses.join(', ')}</button>
          )}
        </div>
      )}
    </section>
  );
}
