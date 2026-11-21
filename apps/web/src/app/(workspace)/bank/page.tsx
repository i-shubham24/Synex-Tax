'use client';

import React, { useMemo, useState } from 'react';
import { Download, Landmark, ShieldCheck } from 'lucide-react';
import { DEFAULT_BANK_RULES, classifyBankLines, maskNarration, parseBankStatement, tallyVoucherXml, type LedgerRule } from '@synextax/tax-engine';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;

/** Bank statement to Tally vouchers. Everything happens in this browser tab; nothing is uploaded. */
export default function BankPage() {
  const [text, setText] = useState('');
  const [company, setCompany] = useState('');
  const [bankLedger, setBankLedger] = useState('Bank Account');
  const [extraRules, setExtraRules] = useState<LedgerRule[]>([]);
  const [rule, setRule] = useState({ pattern: '', ledger: '' });
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const parsed = useMemo(() => (text.trim() ? parseBankStatement(text) : null), [text]);
  const lines = useMemo(() => (parsed ? classifyBankLines(parsed.lines, [...extraRules, ...DEFAULT_BANK_RULES]) : []), [parsed, extraRules]);
  const final = lines.map((l) => (overrides[l.line] !== undefined ? { ...l, ledger: overrides[l.line] || null, voucherType: overrides[l.line] === 'Cash' ? ('Contra' as const) : l.voucherType } : l));
  const unmatched = final.filter((l) => !l.ledger).length;

  const download = () => {
    const xmlText = tallyVoucherXml(final, { company: company || 'Company', bankLedger: bankLedger || 'Bank Account' });
    const url = URL.createObjectURL(new Blob([xmlText], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-vouchers-${final[0]?.date ?? 'statement'}.xml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Bank to books</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">Paste a client&apos;s bank statement, check that the balance runs through, assign ledgers, and take Payment, Receipt and Contra vouchers into Tally.</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#15803d]"><ShieldCheck className="h-4 w-4" /> The statement stays in this browser tab. It is not uploaded or saved.</p>
      </div>

      <section className="pos-card space-y-3 p-4">
        <textarea aria-label="Bank statement" rows={7} value={text} onChange={(e) => { setText(e.target.value); setOverrides({}); }} placeholder="Copy the statement from Excel (or open the bank's CSV) and paste it here, heading row included."
          className="w-full rounded-[10px] border border-pos-line bg-pos-surface p-3 font-mono text-[12px] text-pos-ink outline-none focus:border-pos-accent" />
        <div className="flex flex-wrap items-end gap-3 text-[12px] text-pos-ink/60">
          <label className="flex flex-col gap-1">Company name in Tally<input value={company} onChange={(e) => setCompany(e.target.value)} className={input} /></label>
          <label className="flex flex-col gap-1">Bank ledger in Tally<input value={bankLedger} onChange={(e) => setBankLedger(e.target.value)} className={input} /></label>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (rule.pattern && rule.ledger) { setExtraRules([{ ...rule }, ...extraRules]); setRule({ pattern: '', ledger: '' }); } }}>
            <label className="flex flex-col gap-1">When the narration has<input value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder="e.g. SHARMA" className={input} /></label>
            <label className="flex flex-col gap-1">use ledger<input value={rule.ledger} onChange={(e) => setRule({ ...rule, ledger: e.target.value })} placeholder="e.g. Sharma Traders" className={input} /></label>
            <button type="submit" className="h-9 rounded-full border border-pos-line px-3 text-[12px] text-pos-ink">Add rule</button>
          </form>
        </div>
        {extraRules.length > 0 && <p className="text-[12px] text-pos-ink/55">Your rules: {extraRules.map((r) => `${r.pattern} to ${r.ledger}`).join('; ')}</p>}
      </section>

      {parsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {([['Opening balance', parsed.opening ?? 'Not shown'], ['Withdrawals', parsed.totals.debit], ['Deposits', parsed.totals.credit], ['Closing balance', parsed.closing ?? 'Not shown']] as const).map(([label, v]) => (
              <div key={label} className="pos-card p-4"><p className="text-[12px] text-pos-ink/55">{label}</p><p className="mt-1 text-[18px] font-semibold tabular-nums text-pos-ink">{/\d/.test(v) ? inr(v) : v}</p></div>
            ))}
          </div>
          {parsed.issues.length > 0 && (
            <ul className="rounded-[10px] border border-[#dc2626]/30 bg-[#dc2626]/5 px-4 py-2 text-[13px] text-[#dc2626]">{parsed.issues.map((i, k) => <li key={k}>{i.line ? `Line ${i.line}: ` : ''}{i.message}</li>)}</ul>
          )}
          <section className="pos-card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pos-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-pos-ink">{final.length} entries{unmatched ? `, ${unmatched} without a ledger (they go to Suspense)` : ''}</h2>
              <button type="button" disabled={!final.length} onClick={download} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"><Download className="h-4 w-4" /> Tally vouchers (XML)</button>
            </div>
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={th}>Date</th><th className={th}>Narration</th><th className={`${th} text-right`}>Out</th><th className={`${th} text-right`}>In</th><th className={th}>Voucher</th><th className={th}>Ledger</th></tr></thead>
              <tbody>{final.map((l) => (
                <tr key={l.line} className="border-t border-pos-line">
                  <td className={`${td} whitespace-nowrap`}>{nice(l.date)}</td>
                  <td className={`${td} max-w-[360px] truncate font-mono text-[12px]`} title={maskNarration(l.narration)}>{maskNarration(l.narration)}</td>
                  <td className={num}>{l.debit !== '0.00' ? inr(l.debit) : ''}</td>
                  <td className={num}>{l.credit !== '0.00' ? inr(l.credit) : ''}</td>
                  <td className={td}>{l.voucherType}</td>
                  <td className={td}><input aria-label={`Ledger for line ${l.line}`} value={overrides[l.line] ?? l.ledger ?? ''} placeholder="Suspense" onChange={(e) => setOverrides({ ...overrides, [l.line]: e.target.value })} className={`${input} h-8 w-48 ${l.ledger ? '' : 'border-[#b45309]/50'}`} /></td>
                </tr>
              ))}</tbody>
            </table>
          </section>
          <p className="flex items-center gap-1.5 text-[12px] text-pos-ink/55"><Landmark className="h-4 w-4" /> In Tally: Gateway, Import, Vouchers, and choose the downloaded file. Ledgers that do not exist yet in Tally must be created first, or the import lists them as errors.</p>
        </>
      )}
    </div>
  );
}
