'use client';

import React, { useState } from 'react';
import { Building2, FilePenLine, Plus, Save, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FvuRun } from './FvuRun';
import { DeductorEditor, deductorEditFromPayload, deductorEditPayload, type ConsoDeductor, type DeductorEdit } from './correction/DeductorEditor';
import { DraftList, DraftTools, type DraftView } from './correction/DraftTools';

const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;
const inr = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

interface Row { recordNo: number; mode: string; pan: string; panPlaceholder: boolean; name: string; section: string; paidOn: string; amount: string; deducted: string; deposited: string; deductedOn: string; rate: string; reason: string; certificate: string }
interface Challan { recordNo: number; nil: boolean; bsr: string; challanNo: string; date: string; tax: string; interest: string; fee: string; others: string; total: string; minorHead: string; deductees: Row[] }
interface Conso { form: string | null; tan: string; tanKnown: boolean; deductor?: ConsoDeductor | null; deductorName: string; taxYear: number | null; quarter: number | null; originalToken: string; previousToken: string; issues: string[]; challans: Challan[] }
type RowEdit = Partial<Record<'pan' | 'name' | 'section' | 'paidOn' | 'amount' | 'deducted' | 'deposited' | 'deductedOn' | 'rate' | 'reason' | 'certificate', string>>;
type ChallanEdit = Partial<Record<'bsr' | 'challanNo' | 'date' | 'tax' | 'interest' | 'fee' | 'others' | 'minorHead', string>>;
interface NewPayee { pan: string; name: string; section: string; paidOn: string; amount: string; deducted: string; deductedOn: string; rate: string }
const BLANK_PAYEE: NewPayee = { pan: '', name: '', section: '', paidOn: '', amount: '', deducted: '', deductedOn: '', rate: '' };

const TYPE_LABEL: Record<string, string> = { C1: 'C1, deductor details', C2: 'C2, challan details', C5: 'C5, PAN correction', C3: 'C3, payee changes', C9: 'C9, new challan' };
const DRAFTS = '/api/v1/tds/correction-drafts';

/**
 * Correction statements from the consolidated file downloaded from TRACES. Without a draft the file
 * stays in this browser and goes to the server only to be read and written. Saving a draft stores
 * the file and the changes for the firm, with every save kept as a version.
 */
export function CorrectionPanel() {
  const { authFetch, user } = useAuth();
  const canWrite = user?.role === 'PARTNER' || user?.role === 'MANAGER';
  const [text, setText] = useState('');
  const [conso, setConso] = useState<Conso | null>(null);
  const [tokens, setTokens] = useState({ original: '', previous: '' });
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [challanEdits, setChallanEdits] = useState<Record<number, ChallanEdit>>({});
  const [added, setAdded] = useState<(NewPayee & { challanNo: number })[]>([]);
  const [newChallan, setNewChallan] = useState<{ bsr: string; challanNo: string; date: string; tax: string; interest: string; fee: string; others: string; payees: NewPayee[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; fileName: string; text: string; pending: string[] } | null>(null);
  const [issues, setIssues] = useState<{ where: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deductorEdit, setDeductorEdit] = useState<DeductorEdit>({});
  const [showDeductor, setShowDeductor] = useState(false);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [etag, setEtag] = useState('');
  const [saved, setSaved] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    setResult(null);
    const t = await file.text();
    setText(t);
    const r = await authFetch('/api/v1/tds/corrections/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.error ?? 'The file could not be read.');
    setConso(b);
    setTokens({ original: b.originalToken, previous: b.previousToken });
    setRowEdits({}); setChallanEdits({}); setAdded([]); setNewChallan(null); setDeductorEdit({});
    setDraft(null); setEtag(''); setSaved(''); setTitle(''); setNote(null);
  };

  /** Puts a saved draft on screen: its file's contents and its changes (PANs masked). */
  const applyDraft = (d: DraftView, tag: string) => {
    const e = d.edits ?? {};
    setDraft(d); setEtag(tag); setTitle(d.title ?? ''); setResult(null); setIssues([]); setError(null);
    setText('');
    setConso({ ...d.conso, tanKnown: true });
    setTokens({ original: d.options?.originalToken ?? d.conso.originalToken, previous: d.options?.previousToken ?? d.conso.previousToken });
    const rows: Record<string, RowEdit> = {};
    for (const x of e.deductees ?? []) {
      const { challanNo, recordNo, ...rest } = x;
      rows[`${challanNo}:${recordNo}`] = rest;
    }
    setRowEdits(rows);
    const ch: Record<number, ChallanEdit> = {};
    for (const x of e.challans ?? []) { const { recordNo, ...rest } = x; ch[recordNo] = rest; }
    setChallanEdits(ch);
    setAdded((e.added ?? []).map((a: NewPayee & { challanNo: number }) => ({ ...BLANK_PAYEE, ...a })));
    const nc = e.newChallans?.[0];
    setNewChallan(nc ? { bsr: nc.bsr, challanNo: nc.challanNo, date: nc.date, tax: nc.tax, interest: nc.interest ?? '', fee: nc.fee ?? '', others: nc.others ?? '', payees: nc.deductees.map((p: NewPayee) => ({ ...BLANK_PAYEE, ...p })) } : null);
    const de = deductorEditFromPayload(e.deductor);
    setDeductorEdit(de);
    setShowDeductor(Object.keys(de).length > 0);
    setSaved(JSON.stringify(normal(e)));
  };

  const openDraft = async (id: string) => {
    setError(null);
    const r = await authFetch(`${DRAFTS}/${id}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'The draft could not be opened.');
    applyDraft(b, r.headers.get('etag') ?? '');
  };

  const edits = () => ({
    deductor: deductorEditPayload(deductorEdit),
    deductees: Object.entries(rowEdits).map(([k, e]) => {
      const [challanNo, recordNo] = k.split(':').map(Number);
      return { challanNo, recordNo, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== '')) };
    }).filter((e) => Object.keys(e).length > 2),
    challans: Object.entries(challanEdits).map(([no, e]) => ({ recordNo: Number(no), ...Object.fromEntries(Object.entries(e).filter(([, v]) => v)) })).filter((e) => Object.keys(e).length > 1),
    added: added.map((a) => ({ ...a, deductedOn: a.deductedOn || undefined, rate: a.rate || undefined })),
    newChallans: newChallan ? [{ bsr: newChallan.bsr, challanNo: newChallan.challanNo, date: newChallan.date, tax: newChallan.tax || '0', interest: newChallan.interest || undefined, fee: newChallan.fee || undefined, others: newChallan.others || undefined, deductees: newChallan.payees.map((p) => ({ ...p, deductedOn: p.deductedOn || undefined, rate: p.rate || undefined })) }] : [],
  });

  const tokenBody = () => ({ originalToken: tokens.original || undefined, previousToken: tokens.previous || undefined });

  /** Creates the draft, or saves a new version of it. Returns false when it did not save. */
  const saveDraft = async (): Promise<boolean> => {
    setError(null); setNote(null);
    const body = { ...tokenBody(), edits: edits(), title: title.trim() || undefined };
    const r = draft
      ? await authFetch(`${DRAFTS}/${draft.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': etag }, body: JSON.stringify(body) })
      : await authFetch(DRAFTS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, text }) });
    const b = await r.json().catch(() => ({}));
    if (r.status === 409 && b.id && !draft) { setError('There is already a draft for this TAN, form and quarter. Open it from the saved drafts.'); return false; }
    if (!r.ok) { setError(b.message ?? (Array.isArray(b.issues) ? b.issues.join(' ') : b.error) ?? 'Not saved.'); return false; }
    applyDraft(b, r.headers.get('etag') ?? '');
    setNote(`Saved as version ${b.currentVersion}.`);
    return true;
  };

  const build = async () => {
    setIssues([]); setResult(null); setError(null);
    if (draft && dirty && !(await saveDraft())) return;
    const r = draft
      ? await authFetch(`${DRAFTS}/${draft.id}/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tokenBody()) })
      : await authFetch('/api/v1/tds/corrections/build', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...tokenBody(), edits: edits() }),
      });
    const b = await r.json().catch(() => ({}));
    if (r.status === 422) return setIssues(b.issues ?? []);
    if (!r.ok) return setError(b.message ?? b.error ?? 'Not prepared.');
    setResult(b);
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = result.fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const setRow = (key: string, k: keyof RowEdit, v: string) => setRowEdits((s) => ({ ...s, [key]: { ...s[key], [k]: v } }));
  const setCh = (no: number, k: keyof ChallanEdit, v: string) => setChallanEdits((s) => ({ ...s, [no]: { ...s[no], [k]: v } }));
  const canAdd = conso?.form === '140' || conso?.form === '138';
  const changes = edits();
  const changeCount = (changes.deductor ? 1 : 0) + changes.deductees.length + changes.challans.length + changes.added.length + changes.newChallans.length;
  const dirty = !draft || JSON.stringify(normal(changes)) !== saved;

  const payeeFields = (p: NewPayee, set: (k: keyof NewPayee, v: string) => void) => (
    <div className="grid gap-2 sm:grid-cols-4">
      {([['pan', 'PAN'], ['name', 'Name'], ['section', 'Section code'], ['paidOn', 'Paid on', 'date'], ['amount', 'Amount'], ['deducted', 'Tax deducted'], ['deductedOn', 'Deducted on', 'date'], ['rate', 'Rate %']] as const).map(([k, label, type]) => (
        <label key={k} className="text-[12px] text-pos-ink/60">{label}
          <input type={type ?? 'text'} value={p[k]} onChange={(e) => set(k, k === 'pan' ? e.target.value.toUpperCase() : e.target.value)} className={input} />
        </label>
      ))}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="pos-card space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FilePenLine className="h-4 w-4 text-pos-accent" /> Correction statement</h2>
        <p className="text-[13px] text-pos-ink/65">
          Download the consolidated file for the statement from TRACES, unzip it, and open the .txt file here. Make the changes, then download the correction file and validate it with Protean&apos;s FVU.
          Forms 138 (first three quarters), 140, 143 and 144, Tax Year 2026-27 onwards, per Protean&apos;s correction formats of 4 Aug 2026.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink hover:bg-pos-tint">
          <Upload className="h-4 w-4" /> Open consolidated file
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
        {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
        {!conso && <DraftList authFetch={authFetch} onOpen={openDraft} />}
      </div>

      {conso && (
        <>
          <div className="pos-card grid gap-3 p-4 sm:grid-cols-3">
            <div className="text-[13px] text-pos-ink">
              <div className="font-semibold">{conso.deductorName || 'Deductor'}</div>
              <div className="text-pos-ink/60">TAN {conso.tan} · Form {conso.form ?? '?'} · Q{conso.quarter} · TY {conso.taxYear}-{String(((conso.taxYear ?? 0) + 1) % 100).padStart(2, '0')}</div>
              {!conso.tanKnown && <div className="mt-1 text-[#dc2626]">This TAN is not one of your clients; add it before preparing a correction.</div>}
            </div>
            <label className="text-[12px] text-pos-ink/60">Token number of the regular statement
              <input value={tokens.original} onChange={(e) => setTokens((t) => ({ ...t, original: e.target.value.replace(/\D/g, '') }))} className={input} maxLength={15} />
            </label>
            <label className="text-[12px] text-pos-ink/60">Token number of the last statement filed (regular or correction)
              <input value={tokens.previous} onChange={(e) => setTokens((t) => ({ ...t, previous: e.target.value.replace(/\D/g, '') }))} className={input} maxLength={15} />
            </label>
            {conso.issues.length > 0 && <ul className="sm:col-span-3 list-disc pl-5 text-[12.5px] text-[#b45309]">{conso.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
          </div>

          <div className="pos-card space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[220px] flex-1 text-[12px] text-pos-ink/60">Draft name
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={conso.deductorName || 'Correction draft'} className={input} disabled={!canWrite} />
              </label>
              {canWrite && (
                <button type="button" onClick={saveDraft} disabled={!!draft && !dirty && title === (draft.title ?? '')} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink hover:bg-pos-tint disabled:opacity-50">
                  <Save className="h-4 w-4" /> {draft ? 'Save new version' : 'Save as draft'}
                </button>
              )}
              <span className="text-[12.5px] text-pos-ink/60">
                {draft ? `Draft version ${draft.currentVersion}${dirty ? ', unsaved changes' : ''}` : 'Not saved; the file stays in this browser.'}
              </span>
            </div>
            {note && <p className="text-[13px] text-pos-ink">{note}</p>}
            {draft && (
              <DraftTools
                authFetch={authFetch} draft={draft} etag={etag} canWrite={canWrite} isPartner={user?.role === 'PARTNER'}
                onChanged={(d, tag) => applyDraft(d, tag)}
                onDeleted={() => { setDraft(null); setEtag(''); setConso(null); setNote(null); }}
              />
            )}
          </div>

          <div className="pos-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-pos-ink"><Building2 className="h-4 w-4 text-pos-accent" /> Deductor details (C1)</h3>
              <button type="button" onClick={() => setShowDeductor((s) => !s)} className="rounded-full border border-pos-line px-3 py-1 text-[12.5px] hover:bg-pos-tint">{showDeductor ? 'Close' : 'Correct deductor details'}</button>
            </div>
            {showDeductor && <DeductorEditor current={conso.deductor ?? null} value={deductorEdit} onChange={setDeductorEdit} />}
          </div>

          {conso.challans.map((ch) => {
            const ce = challanEdits[ch.recordNo] ?? {};
            const chOpen = open === `c${ch.recordNo}`;
            return (
              <div key={ch.recordNo} className="pos-card overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pos-line px-4 py-3">
                  <div className="text-[13px] text-pos-ink">
                    <span className="font-semibold">Challan {ch.recordNo}</span>
                    <span className="ml-2 text-pos-ink/60">{ch.nil ? 'Nil challan' : `BSR ${ch.bsr} · No. ${ch.challanNo} · ${ch.date}`} · {inr(ch.total)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(chOpen ? null : `c${ch.recordNo}`)} className="rounded-full border border-pos-line px-3 py-1 text-[12.5px] hover:bg-pos-tint">{chOpen ? 'Close' : 'Correct challan'}</button>
                    {canAdd && <button type="button" onClick={() => setAdded((a) => [...a, { ...BLANK_PAYEE, challanNo: ch.recordNo }])} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-3 py-1 text-[12.5px] hover:bg-pos-tint"><Plus className="h-3.5 w-3.5" /> Add payee</button>}
                  </div>
                </div>
                {chOpen && (
                  <div className="grid gap-2 border-b border-pos-line p-4 sm:grid-cols-4">
                    <p className="sm:col-span-4 text-[12px] text-pos-ink/55">Challan changes alone go in a challan details correction (C2). If rows under this challan change too, they go together in C3.</p>
                    {([['bsr', 'BSR code', ch.bsr], ['challanNo', 'Challan serial', ch.challanNo], ['date', 'Date', ch.date, 'date'], ['tax', 'Tax', ch.tax], ['interest', 'Interest', ch.interest], ['fee', 'Fee', ch.fee], ['others', 'Others', ch.others], ['minorHead', 'Minor head', ch.minorHead]] as const).map(([k, label, was, type]) => (
                      <label key={k} className="text-[12px] text-pos-ink/60">{label} <span className="text-pos-ink/40">(now {was || 'blank'})</span>
                        <input type={type ?? 'text'} value={ce[k] ?? ''} onChange={(e) => setCh(ch.recordNo, k, e.target.value)} className={input} />
                      </label>
                    ))}
                  </div>
                )}
                <table className="w-full">
                  <thead className="text-pos-ink/55"><tr><th className={th}>#</th><th className={th}>PAN</th><th className={th}>Name</th><th className={th}>Code</th><th className={th}>Paid on</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Deducted</th><th className={`${th} text-right`}>Deposited</th><th className={th}>Reason</th><th className={th} /></tr></thead>
                  <tbody>
                    {ch.deductees.map((d) => {
                      const key = `${ch.recordNo}:${d.recordNo}`;
                      const e = rowEdits[key] ?? {};
                      const isOpen = open === key;
                      const edited = Object.values(e).some((v) => v);
                      return (
                        <React.Fragment key={key}>
                          <tr className={`border-t border-pos-line ${edited ? 'bg-pos-tint' : ''}`}>
                            <td className={td}>{d.recordNo}</td>
                            <td className={`${td} font-mono text-[12px] ${d.panPlaceholder ? 'text-[#b45309]' : ''}`}>{e.pan || d.pan}</td>
                            <td className={td}>{e.name || d.name}</td><td className={td}>{e.section || d.section}</td><td className={td}>{e.paidOn || d.paidOn}</td>
                            <td className={num}>{inr(e.amount || d.amount)}</td><td className={num}>{inr(e.deducted || d.deducted)}</td><td className={num}>{inr(e.deposited || d.deposited)}</td>
                            <td className={td}>{e.reason ?? d.reason}</td>
                            <td className={td}><button type="button" onClick={() => setOpen(isOpen ? null : key)} className="text-[12.5px] text-pos-accent">{isOpen ? 'Close' : 'Correct'}</button></td>
                          </tr>
                          {isOpen && (
                            <tr className="border-t border-pos-line"><td colSpan={10} className="p-4">
                              <div className="grid gap-2 sm:grid-cols-4">
                                {([['pan', 'New PAN'], ['name', 'Name'], ['section', 'Section code'], ['paidOn', 'Paid on', 'date'], ['amount', 'Amount'], ['deducted', 'Tax deducted'], ['deposited', 'Tax deposited'], ['deductedOn', 'Deducted on', 'date'], ['rate', 'Rate %'], ['reason', 'Reason flag'], ['certificate', 'Section 395 certificate']] as const).map(([k, label, type]) => (
                                  <label key={k} className="text-[12px] text-pos-ink/60">{label}
                                    <input type={type ?? 'text'} value={e[k] ?? ''} placeholder={k === 'pan' ? 'Full PAN' : String(d[k as keyof Row] ?? '')} onChange={(ev) => setRow(key, k, k === 'pan' || k === 'reason' ? ev.target.value.toUpperCase() : ev.target.value)} className={input} />
                                  </label>
                                ))}
                              </div>
                              <p className="mt-2 text-[12px] text-pos-ink/55">Leave a box empty to keep what was filed. Changing one valid PAN to another is a separate PAN correction (C5); replacing PANNOTAVBL or PANAPPLIED goes with the other changes (C3).</p>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {added.map((a, i) => a.challanNo !== ch.recordNo ? null : (
                  <div key={i} className="space-y-2 border-t border-pos-line bg-pos-tint p-4">
                    <div className="flex justify-between text-[13px] font-medium text-pos-ink">New payee <button type="button" onClick={() => setAdded((s) => s.filter((_, j) => j !== i))} className="text-[12.5px] text-pos-ink/60">Remove</button></div>
                    {payeeFields(a, (k, v) => setAdded((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x))))}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="pos-card space-y-3 p-4">
            {!newChallan ? (
              <button type="button" disabled={!canAdd} onClick={() => setNewChallan({ bsr: '', challanNo: '', date: '', tax: '', interest: '', fee: '', others: '', payees: [{ ...BLANK_PAYEE }] })} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-3 py-1.5 text-[13px] hover:bg-pos-tint disabled:opacity-50">
                <Plus className="h-4 w-4" /> Add a challan left out of the statement (C9)
              </button>
            ) : (
              <>
                <div className="flex justify-between text-[13px] font-semibold text-pos-ink">New challan <button type="button" onClick={() => setNewChallan(null)} className="text-[12.5px] font-normal text-pos-ink/60">Remove</button></div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {([['bsr', 'BSR code'], ['challanNo', 'Challan serial'], ['date', 'Date', 'date'], ['tax', 'Tax'], ['interest', 'Interest'], ['fee', 'Fee'], ['others', 'Others']] as const).map(([k, label, type]) => (
                    <label key={k} className="text-[12px] text-pos-ink/60">{label}<input type={type ?? 'text'} value={newChallan[k]} onChange={(e) => setNewChallan((c) => c && { ...c, [k]: e.target.value })} className={input} /></label>
                  ))}
                </div>
                {newChallan.payees.map((p, i) => (
                  <div key={i} className="rounded-[12px] bg-pos-tint p-3">{payeeFields(p, (k, v) => setNewChallan((c) => c && { ...c, payees: c.payees.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))}</div>
                ))}
                <button type="button" onClick={() => setNewChallan((c) => c && { ...c, payees: [...c.payees, { ...BLANK_PAYEE }] })} className="text-[12.5px] text-pos-accent">Add another payee</button>
              </>
            )}
            {!canAdd && <p className="text-[12px] text-pos-ink/55">Adding payees or challans needs the Form {conso.form} details; for Forms 143 and 144 add them in the regular statement screens.</p>}
          </div>

          <div className="pos-card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={build} disabled={!changeCount} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">Prepare correction file</button>
              <span className="text-[13px] text-pos-ink/60">{changeCount ? `${changeCount} change${changeCount > 1 ? 's' : ''}` : 'No changes yet'}</span>
            </div>
            {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#dc2626]">{issues.map((i, k) => <li key={k}><span className="font-medium">{i.where}:</span> {i.message}</li>)}</ul>}
            {result && (
              <div className="space-y-2 text-[13px] text-pos-ink">
                <p><span className="font-semibold">{TYPE_LABEL[result.type] ?? result.type}</span> is ready: {result.fileName}</p>
                <button type="button" onClick={download} className="rounded-full border border-pos-line px-4 py-1.5 hover:bg-pos-tint">Download</button>
                {result.pending.length > 0 && <p className="text-[#b45309]">Also needed: {result.pending.map((t) => TYPE_LABEL[t] ?? t).join(', ')}. File this one first; once its token number arrives, download a fresh consolidated file and prepare the next.</p>}
                <FvuRun fileName={result.fileName} text={result.text} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** The changes in a comparable form: PANs masked as the server returns them, empty parts dropped. */
function normal(e: Record<string, unknown>): unknown {
  return JSON.parse(JSON.stringify(e, (k, v) => {
    if (k === 'pan' && typeof v === 'string' && /^[A-Z]{5}\d{4}[A-Z]$/.test(v)) return `XXXXX${v.slice(5)}`;
    if (v === '' || v === null || (Array.isArray(v) && !v.length)) return undefined;
    return v;
  }));
}
