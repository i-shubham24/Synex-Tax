'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import {
  DEFAULT_BANK_RULES,
  applySavedMapping,
  bankName,
  classifyBankLines,
  detectLayout,
  maskNarration,
  parseDelimited,
  rowsToStatement,
  tallyVoucherXml,
  type BankId,
  type ColumnRole,
  type LedgerRule,
  type SavedMapping,
} from '@synextax/tax-engine';
import { ColumnMapping } from '@/components/bank/ColumnMapping';
import { OcrNotice, RowReview } from '@/components/bank/RowReview';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;

/** What the user's file or paste turned into: rows of cells, and for PDFs where each row came from. */
interface Source {
  name: string;
  kind: 'paste' | 'csv' | 'excel' | 'pdf';
  rows: string[][];
  preamble: string;
  meta?: Array<{ page: number; conf: Array<number | null> }>;
  ocrPages: number[];
  ocrConfidence: number | null;
}

// Kept in this browser only: the firm's own ledger rules and its column choices per bank.
const RULES_KEY = 'synextax.bank.rules';
const MAPPING_KEY = (bank: BankId) => `synextax.bank.columns.${bank}`;
const load = <T,>(key: string): T | null => {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const save = (key: string, value: unknown) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the choice still applies to this session */
  }
};

/** Bank statement to Tally vouchers. Everything happens in this browser tab; nothing is uploaded. */
export default function BankPage() {
  const [text, setText] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [bankChoice, setBankChoice] = useState<BankId | null>(null);
  const [rolesChoice, setRolesChoice] = useState<ColumnRole[] | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const [showMapping, setShowMapping] = useState(false);
  const [showRows, setShowRows] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState<{ wrong: boolean } | null>(null);
  const [password, setPassword] = useState('');
  const pending = useRef<{ name: string; buf: ArrayBuffer } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [company, setCompany] = useState('');
  const [bankLedger, setBankLedger] = useState('Bank Account');
  const [extraRules, setExtraRules] = useState<LedgerRule[]>([]);
  const [rule, setRule] = useState({ pattern: '', ledger: '' });
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  useEffect(() => {
    const saved = load<LedgerRule[]>(RULES_KEY);
    if (Array.isArray(saved)) setExtraRules(saved.filter((r) => r && typeof r.pattern === 'string' && typeof r.ledger === 'string'));
  }, []);
  const setRules = (next: LedgerRule[]) => {
    setExtraRules(next);
    save(RULES_KEY, next);
  };

  const begin = (next: Source | null) => {
    setSource(next);
    setEdits({});
    setBankChoice(null);
    setRolesChoice(null);
    setOverrides({});
    setShowMapping(false);
    setShowRows(!!next?.ocrPages.length);
  };

  // ------------------------------------------------------------------ reading files

  const openPdf = async (name: string, buf: ArrayBuffer, pw?: string) => {
    const { readPdfStatement, PdfPasswordError } = await import('@/components/bank/readPdf');
    try {
      const r = await readPdfStatement(buf, { password: pw, onProgress: (m) => setBusy(m) });
      pending.current = null;
      setNeedPassword(null);
      setPassword('');
      if (r.table.rows.length < 2) throw new Error('No statement rows were found in this PDF.');
      begin({ name, kind: 'pdf', rows: r.table.rows, preamble: r.table.preamble, meta: r.table.meta, ocrPages: r.ocrPages, ocrConfidence: r.ocrConfidence });
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        pending.current = { name, buf };
        setNeedPassword({ wrong: e.wrong });
        return;
      }
      throw e;
    }
  };

  const onFile = async (file: File) => {
    setError(null);
    setNeedPassword(null);
    setText('');
    setBusy(`Reading ${file.name}`);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') await openPdf(file.name, await file.arrayBuffer());
      else if (lower.endsWith('.xlsx')) {
        const { readXlsx } = await import('@/components/bank/readXlsx');
        begin({ name: file.name, kind: 'excel', rows: await readXlsx(await file.arrayBuffer()), preamble: '', ocrPages: [], ocrConfidence: null });
      } else if (lower.endsWith('.xls')) {
        throw new Error('Older Excel files (.xls) cannot be read here. Open the file in Excel and save it as .xlsx or CSV, or copy the rows and paste them below.');
      } else {
        begin({ name: file.name, kind: 'csv', rows: parseDelimited(await file.text()), preamble: '', ocrPages: [], ocrConfidence: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = pending.current;
    if (!p || !password) return;
    setError(null);
    setBusy('Opening the PDF');
    try {
      await openPdf(p.name, p.buf, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const onPaste = (value: string) => {
    setText(value);
    setError(null);
    setNeedPassword(null);
    begin(value.trim() ? { name: 'Pasted statement', kind: 'paste', rows: parseDelimited(value), preamble: '', ocrPages: [], ocrConfidence: null } : null);
  };

  // ------------------------------------------------------------------ layout and lines

  const rows = useMemo(() => {
    if (!source) return [];
    if (!Object.keys(edits).length) return source.rows;
    return source.rows.map((row, r) => row.map((c, k) => edits[`${r}:${k}`] ?? c));
  }, [source, edits]);

  const detection = useMemo(() => (source ? detectLayout(source.rows, source.preamble) : null), [source]);
  const bank: BankId = bankChoice ?? detection?.bank ?? 'GENERIC';
  const headerIndex = detection?.header ?? -1;
  const headerCells = useMemo(() => (headerIndex >= 0 ? rows[headerIndex] ?? [] : []), [rows, headerIndex]);

  const savedRoles = useMemo(() => {
    if (!detection || typeof window === 'undefined') return null;
    void savedVersion;
    const saved = load<SavedMapping>(MAPPING_KEY(bank));
    return saved && Array.isArray(saved.roles) ? applySavedMapping(headerCells, saved) : null;
  }, [detection, bank, headerCells, savedVersion]);
  const roles = rolesChoice ?? savedRoles ?? detection?.roles ?? [];

  const statement = useMemo(() => (source && roles.length ? rowsToStatement(rows, headerIndex, roles) : null), [source, rows, headerIndex, roles]);
  const breaks = statement ? statement.issues.filter((i) => /does not follow/.test(i.message)).length : 0;
  const unsure = !!detection && !detection.sure && !rolesChoice && !savedRoles;
  const mappingOpen = showMapping || unsure || (!!statement && !statement.lines.length);

  const chooseRoles = (next: ColumnRole[]) => {
    setRolesChoice(next);
    setOverrides({});
    save(MAPPING_KEY(bank), { headers: headerCells.length ? headerCells : next.map((_, i) => `Column ${i + 1}`), roles: next } satisfies SavedMapping);
    setSavedVersion((v) => v + 1);
  };
  const resetRoles = () => {
    save(MAPPING_KEY(bank), null);
    setRolesChoice(null);
    setSavedVersion((v) => v + 1);
  };

  const lines = useMemo(() => (statement ? classifyBankLines(statement.lines, [...extraRules, ...DEFAULT_BANK_RULES]) : []), [statement, extraRules]);
  const final = lines.map((l) => (overrides[l.line] !== undefined ? { ...l, ledger: overrides[l.line] || null, voucherType: overrides[l.line] === 'Cash' ? ('Contra' as const) : l.voucherType } : l));
  const unmatched = final.filter((l) => !l.ledger).length;
  const pageOf = (line: number) => source?.meta?.[line - 1]?.page;
  const where = (line: number) => (pageOf(line) ? `Row ${line}, page ${pageOf(line)}` : `Row ${line}`);

  const download = () => {
    const xmlText = tallyVoucherXml(final, { company: company || 'Company', bankLedger: bankLedger || 'Bank Account' });
    const url = URL.createObjectURL(new Blob([xmlText], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-vouchers-${final[0]?.date ?? 'statement'}.xml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isOcr = !!source?.ocrPages.length;
  const bodyStart = headerIndex + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Bank to books</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">Open a client&apos;s bank statement (PDF, scanned PDF, Excel or CSV) or paste it, check that the balance runs through, assign ledgers, and take Payment, Receipt and Contra vouchers into Tally.</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-pos-green"><ShieldCheck className="h-4 w-4" /> The statement is read in this browser tab. It is not uploaded or saved, and account numbers are shown masked.</p>
      </div>

      <section className="pos-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInput} type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,application/pdf,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          <button type="button" disabled={!!busy} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">
            <FileUp className="h-4 w-4" /> Open statement file
          </button>
          <span className="text-[12px] text-pos-ink/55">PDF from net banking, scanned PDF, Excel (.xlsx) or CSV. Layouts known for SBI, HDFC, ICICI, Kotak, PNB, Canara, Yes Bank, IDBI, J&amp;K Bank and Bank of Maharashtra; others can be mapped by hand.</span>
        </div>
        {busy && <p className="flex items-center gap-2 text-[13px] text-pos-ink/70" role="status"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}
        {needPassword && (
          <form onSubmit={submitPassword} className="flex flex-wrap items-end gap-2 text-[12px] text-pos-ink/60">
            <label className="flex flex-col gap-1">{needPassword.wrong ? 'That password did not open the file. Try again' : 'This PDF has a password (banks often use the customer ID or date of birth)'}
              <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} w-64`} />
            </label>
            <button type="submit" disabled={!password || !!busy} className="h-9 rounded-full border border-pos-line px-4 text-[12px] text-pos-ink disabled:opacity-40">Open</button>
            <span className="pb-2 text-pos-ink/45">The password is used only to open the file here, and is not kept.</span>
          </form>
        )}
        {error && <p className="flex items-center gap-1.5 text-[13px] text-pos-red"><AlertTriangle className="h-4 w-4" /> {error}</p>}
        {source && source.kind !== 'paste' && <p className="text-[12px] text-pos-ink/60">Read <span className="font-mono">{source.name}</span>: {Math.max(0, source.rows.length - bodyStart)} rows.</p>}
        <textarea aria-label="Bank statement" rows={5} value={text} onChange={(e) => onPaste(e.target.value)} placeholder="Or copy the statement from Excel and paste it here, heading row included."
          className="w-full rounded-[10px] border border-pos-line bg-pos-surface p-3 font-mono text-[12px] text-pos-ink outline-none focus:border-pos-accent" />
        <div className="flex flex-wrap items-end gap-3 text-[12px] text-pos-ink/60">
          <label className="flex flex-col gap-1">Company name in Tally<input value={company} onChange={(e) => setCompany(e.target.value)} className={input} /></label>
          <label className="flex flex-col gap-1">Bank ledger in Tally<input value={bankLedger} onChange={(e) => setBankLedger(e.target.value)} className={input} /></label>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (rule.pattern && rule.ledger) { setRules([{ ...rule }, ...extraRules]); setRule({ pattern: '', ledger: '' }); } }}>
            <label className="flex flex-col gap-1">When the narration has<input value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder="e.g. SHARMA" className={input} /></label>
            <label className="flex flex-col gap-1">use ledger<input value={rule.ledger} onChange={(e) => setRule({ ...rule, ledger: e.target.value })} placeholder="e.g. Sharma Traders" className={input} /></label>
            <button type="submit" className="h-9 rounded-full border border-pos-line px-3 text-[12px] text-pos-ink">Add rule</button>
          </form>
        </div>
        {extraRules.length > 0 && (
          <p className="text-[12px] text-pos-ink/55">
            Your rules (kept in this browser): {extraRules.map((r) => `${r.pattern} to ${r.ledger}`).join('; ')}{' '}
            <button type="button" onClick={() => setRules([])} className="underline underline-offset-2">Clear</button>
          </p>
        )}
      </section>

      {source && detection && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-pos-ink/70">
            <span>Layout: <span className="font-medium text-pos-ink">{bank === 'GENERIC' ? 'Other bank' : bankName(bank)}</span>{detection.bankFrom === 'columns' && !bankChoice ? ' (from the column order)' : ''}</span>
            {!mappingOpen && <button type="button" onClick={() => setShowMapping(true)} className="text-[12px] underline underline-offset-2">Check the columns</button>}
            <button type="button" onClick={() => setShowRows(!showRows)} className="text-[12px] underline underline-offset-2">{showRows ? 'Hide the rows as read' : 'See and correct the rows as read'}</button>
          </div>

          {isOcr && <OcrNotice confidence={source.ocrConfidence} pages={source.ocrPages} />}

          {mappingOpen && (
            <ColumnMapping header={headerCells} samples={rows.slice(bodyStart, bodyStart + 3)} roles={roles} bank={bank} reasons={detection.reasons}
              onRoles={chooseRoles} onBank={(b) => { setBankChoice(b); setRolesChoice(null); }} onReset={resetRoles} />
          )}

          {showRows && (
            <section className="pos-card p-2">
              <RowReview rows={rows} header={headerCells} start={bodyStart} conf={source.meta?.map((m) => m.conf)} pages={source.meta?.map((m) => m.page)}
                breakRow={statement?.firstBreak ? statement.firstBreak.line - 1 : null}
                onEdit={(r, c, v) => setEdits((prev) => ({ ...prev, [`${r}:${c}`]: v }))} />
            </section>
          )}
        </>
      )}

      {statement && statement.lines.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {([['Opening balance', statement.opening ?? 'Not shown'], ['Withdrawals', statement.totals.debit], ['Deposits', statement.totals.credit], ['Closing balance', statement.closing ?? 'Not shown']] as const).map(([label, v]) => (
              <div key={label} className="pos-card p-4"><p className="text-[12px] text-pos-ink/55">{label}</p><p className="mt-1 text-[18px] font-semibold tabular-nums text-pos-ink">{/\d/.test(v) ? inr(v) : v}</p></div>
            ))}
          </div>
          {statement.reconciled ? (
            <p className="flex items-center gap-1.5 text-[13px] text-pos-green"><CheckCircle2 className="h-4 w-4" /> The balance runs through every line{statement.reversed ? ' (the statement listed the newest entry first; it is shown oldest first)' : ''}.</p>
          ) : statement.firstBreak ? (
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-pos-red">
              <AlertTriangle className="h-4 w-4" /> The balance stops adding up at {where(statement.firstBreak.line)}: expected <span className="font-mono">{inr(statement.firstBreak.expected)}</span>, statement shows <span className="font-mono">{inr(statement.firstBreak.found)}</span>{breaks > 1 ? ` (${breaks} lines in all)` : ''}.
              {!showRows && <button type="button" onClick={() => setShowRows(true)} className="underline underline-offset-2">Check the rows</button>}
              {breaks > 2 && !mappingOpen && <button type="button" onClick={() => setShowMapping(true)} className="underline underline-offset-2">Check the columns</button>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-[#b45309]"><AlertTriangle className="h-4 w-4" /> Some lines have no balance, so the statement could not be fully checked.</p>
          )}
          {statement.issues.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-[10px] border border-pos-red/30 bg-pos-red/5 px-4 py-2 text-[13px] text-pos-red">{statement.issues.map((i, k) => <li key={k}>{i.line ? `${where(i.line)}: ` : ''}{i.message}</li>)}</ul>
          )}
          <section className="pos-card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pos-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-pos-ink">{final.length} entries{unmatched ? `, ${unmatched} without a ledger (they go to Suspense)` : ''}</h2>
              <button type="button" disabled={!final.length} onClick={download} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"><Download className="h-4 w-4" /> Tally vouchers (XML)</button>
            </div>
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={th}>Date</th><th className={th}>Narration</th><th className={`${th} text-right`}>Out</th><th className={`${th} text-right`}>In</th><th className={`${th} text-right`}>Balance</th><th className={th}>Voucher</th><th className={th}>Ledger</th></tr></thead>
              <tbody>{final.map((l) => (
                <tr key={l.line} className={`border-t border-pos-line ${statement.firstBreak?.line === l.line ? 'bg-pos-red/5' : ''}`}>
                  <td className={`${td} whitespace-nowrap`}>{nice(l.date)}</td>
                  <td className={`${td} max-w-[360px] truncate font-mono text-[12px]`} title={maskNarration(l.narration)}>{maskNarration(l.narration)}</td>
                  <td className={num}>{l.debit !== '0.00' ? inr(l.debit) : ''}</td>
                  <td className={num}>{l.credit !== '0.00' ? inr(l.credit) : ''}</td>
                  <td className={`${num} text-pos-ink/60`}>{l.balance !== null ? inr(l.balance) : ''}</td>
                  <td className={td}>{l.voucherType}</td>
                  <td className={td}><input aria-label={`Ledger for row ${l.line}`} value={overrides[l.line] ?? l.ledger ?? ''} placeholder="Suspense" onChange={(e) => setOverrides({ ...overrides, [l.line]: e.target.value })} className={`${input} h-8 w-48 ${l.ledger ? '' : 'border-[#b45309]/50'}`} /></td>
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
