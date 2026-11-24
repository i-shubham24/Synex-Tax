'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Printer, Save } from 'lucide-react';
import { ITR_ENGINE_AY, ITR_ENGINE_FORMS, engineSummary, type ItrFormName } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';
import { useDraftRegime, useItrDraft, FilledFrom } from '../itrDraftStore';
import type { Form, Taxpayer } from '../ItrFormPicker';
import { ItrFiveYearView } from './ItrFiveYearView';
import { ItrChallanCard } from './ItrChallanCard';
import {
  ASSESSMENT_YEARS, STATUS_LABEL, btnPrimary, btnQuiet, fieldCls, inr, taxpayerOf,
  type Ay, type ClientOption, type FiledFiguresIn, type ReturnStatus, type SavedPayment, type SavedReturn, type YearRow,
} from './returnsShared';

type Age = 'BELOW_60' | 'SENIOR' | 'SUPER_SENIOR';

const FILED_FIELDS: Array<[keyof FiledFiguresIn, string]> = [
  ['totalIncome', 'Total income'], ['totalTax', 'Total tax, with surcharge and cess'], ['surcharge', 'of which surcharge'], ['cess', 'of which cess'],
  ['tdsTcs', 'TDS and TCS'], ['advanceTax', 'Advance tax paid'], ['selfAssessment', 'Self-assessment tax paid'],
];

const toFiled = (f: Record<string, string>): FiledFiguresIn => ({
  totalIncome: Number(f.totalIncome || 0), totalTax: Number(f.totalTax || 0),
  ...Object.fromEntries((['surcharge', 'cess', 'tdsTcs', 'advanceTax', 'selfAssessment'] as const).filter((k) => f[k]).map((k) => [k, Number(f[k])])),
});

/**
 * The saved return behind the ITR page: pick a client and an assessment year (AY 2022-23 to 2026-27), load
 * the return saved for that year, save over it (If-Match), keep notes and the filing status, and see the
 * client's five years. The PAN, bank and contact details typed into a form are never saved.
 */
export function ItrReturnBar(props: {
  values: Record<string, string>; setValues: (v: Record<string, string>) => void;
  age: Age; setAge: (a: Age) => void; metro: boolean; setMetro: (m: boolean) => void;
  taxpayer: Taxpayer; setTaxpayer: (t: Taxpayer) => void; form: Form; setChosen: (f: Form | null) => void;
  suggestedRegime: 'NEW' | 'OLD';
}) {
  const { values, setValues, age, setAge, metro, setMetro, setTaxpayer, form, setChosen, suggestedRegime } = props;
  const { authFetch } = useAuth();
  const { draft } = useItrDraft();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [entityId, setEntityId] = useState('');
  const [ay, setAy] = useState<Ay>(ITR_ENGINE_AY);
  const [years, setYears] = useState<YearRow[]>([]);
  const [saved, setSaved] = useState<{ id: string; version: string } | null>(null);
  const [regime, setRegime] = useState<'NEW' | 'OLD'>(suggestedRegime);
  const [regimeTouched, setRegimeTouched] = useState(false);
  const [status, setStatus] = useState<ReturnStatus>('DRAFT');
  const [ack, setAck] = useState('');
  const [filedOn, setFiledOn] = useState('');
  const [notes, setNotes] = useState('');
  const [filed, setFiled] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<SavedPayment[]>([]);
  const [baseline, setBaseline] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const regimeFill = useDraftRegime(regime, setRegime);

  // Until the user picks a regime, follow the lower-tax regime of the computation.
  useEffect(() => { if (!regimeTouched && !regimeFill && !saved) setRegime(suggestedRegime); }, [suggestedRegime, regimeTouched, regimeFill, saved]);
  // Dated challans from Form 26AS go with the saved return (they work interest under 234B and 234C).
  useEffect(() => {
    if (draft.payments) setPayments(draft.payments.items.map((p) => ({ ...(/^\d{7}$/.test(p.bsr) ? { bsr: p.bsr } : {}), date: p.date, serial: p.serial, amount: p.amount, kind: p.kind })));
  }, [draft.payments]);

  useEffect(() => {
    authFetch('/api/v1/itr-returns/clients').then(async (r) => (r.ok ? setClients((await r.json()).clients ?? []) : setClients([]))).catch(() => setClients([]));
  }, [authFetch]);

  const client = clients.find((c) => c.id === entityId);
  const engine = ay === ITR_ENGINE_AY && ITR_ENGINE_FORMS.includes(form as ItrFormName);
  const snapshot = JSON.stringify({ values, age, metro, regime, status, ack, filedOn, notes, filed, form, payments });
  const dirty = !!entityId && snapshot !== baseline && (!!saved || Object.values(values).some((x) => x !== '') || notes !== '');

  const loadYears = useCallback(async (id: string) => {
    const r = await authFetch(`/api/v1/itr-returns?entityId=${encodeURIComponent(id)}`);
    const rows: YearRow[] = r.ok ? (await r.json()).returns ?? [] : [];
    setYears(rows);
    return rows;
  }, [authFetch]);

  /** Opens the saved return of the client for the year, or starts a new one keeping the figures on the page. */
  const open = useCallback(async (id: string, year: Ay) => {
    setMessage(null);
    if (!id) { setYears([]); setSaved(null); return; }
    const rows = await loadYears(id);
    const row = rows.find((x) => x.assessmentYear === year);
    if (!row) {
      setSaved(null); setStatus('DRAFT'); setAck(''); setFiledOn(''); setNotes(''); setFiled({});
      setBaseline('');
      return;
    }
    const r = await authFetch(`/api/v1/itr-returns/${row.id}`);
    if (!r.ok) { setMessage({ kind: 'error', text: 'The saved return could not be opened.' }); return; }
    const s = (await r.json()) as SavedReturn;
    const v = s.input.values ?? {};
    setValues(v); setAge(s.input.ageBand ?? 'BELOW_60'); setMetro(!!s.input.metroCity);
    setRegime(s.regime); setRegimeTouched(true); setStatus(s.status); setAck(s.ackNumber ?? ''); setFiledOn(s.filedOn ?? ''); setNotes(s.notes ?? '');
    const f = s.input.filed ? Object.fromEntries(Object.entries(s.input.filed).map(([k, x]) => [k, String(x)])) : {};
    setFiled(f); setPayments(s.input.payments ?? []);
    setChosen(s.form as Form);
    setSaved({ id: s.id, version: s.version });
    setBaseline(JSON.stringify({ values: v, age: s.input.ageBand ?? 'BELOW_60', metro: !!s.input.metroCity, regime: s.regime, status: s.status, ack: s.ackNumber ?? '', filedOn: s.filedOn ?? '', notes: s.notes ?? '', filed: f, form: s.form, payments: s.input.payments ?? [] }));
  }, [authFetch, loadYears, setValues, setAge, setMetro, setChosen]);

  const pickClient = (id: string) => {
    if (dirty && !window.confirm('The return on screen has changes that are not saved. Open another client anyway?')) return;
    setEntityId(id);
    const c = clients.find((x) => x.id === id);
    setTaxpayer(taxpayerOf(c));
    setChosen(null);
    void open(id, ay);
  };
  const pickYear = (y: Ay) => {
    if (y === ay) return;
    if (dirty && !window.confirm('The return on screen has changes that are not saved. Switch the year anyway?')) return;
    setAy(y);
    if (entityId) void open(entityId, y);
  };

  const preview = useMemo(() => (engine ? engineSummary(values, regime, age, metro) : null), [engine, values, regime, age, metro]);

  const save = async () => {
    if (!entityId) return;
    setBusy(true); setMessage(null);
    const body = {
      entityId, assessmentYear: ay, form, regime, status,
      ackNumber: status === 'FILED' ? ack : (ack || null), filedOn: filedOn || null, notes,
      input: { values: Object.fromEntries(Object.entries(values).filter(([, x]) => x !== '')), ageBand: age, metroCity: metro, payments, ...(engine ? {} : { filed: toFiled(filed) }) },
    };
    try {
      const r = await authFetch(saved ? `/api/v1/itr-returns/${saved.id}` : '/api/v1/itr-returns', {
        method: saved ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json', ...(saved ? { 'If-Match': `"${saved.version}"` } : {}) },
        body: JSON.stringify(body),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage({ kind: 'error', text: b.message ?? 'Not saved.' }); return; }
      setSaved({ id: b.id, version: b.version });
      setBaseline(snapshot);
      await loadYears(entityId);
      setMessage({ kind: 'ok', text: `Saved. Total income ${inr(b.summary?.totalIncome)}, total tax ${inr(b.summary?.totalTax)}.` });
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pos-card space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 text-[12px] font-medium text-pos-ink/75">Client
          <select value={entityId} onChange={(e) => pickClient(e.target.value)} className={fieldCls}>
            <option value="">Pick a client to save this return</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.pan})</option>)}
          </select>
        </label>
        <div role="tablist" aria-label="Assessment year" className="flex flex-wrap gap-1.5">
          {ASSESSMENT_YEARS.map((y) => (
            <button key={y} type="button" role="tab" aria-selected={ay === y} onClick={() => pickYear(y)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${ay === y ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/75 hover:bg-pos-tint'}`}>
              AY {y}
            </button>
          ))}
        </div>
      </div>

      {entityId && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-pos-ink/75">
            <span className="inline-flex items-center gap-1.5 font-medium text-pos-ink"><FolderOpen className="h-4 w-4 text-pos-accent" /> {saved ? `Saved return, ${form}` : `New return, ${form}`}</span>
            <label className="flex items-center gap-2">Regime
              <select value={regime} onChange={(e) => { setRegime(e.target.value as 'NEW' | 'OLD'); setRegimeTouched(true); }} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
                <option value="NEW">New</option><option value="OLD">Old</option>
              </select>
            </label>
            <label className="flex items-center gap-2">Status
              <select value={status} onChange={(e) => setStatus(e.target.value as ReturnStatus)} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
                {(['DRAFT', 'READY', 'FILED'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            {status === 'FILED' && (
              <>
                <label className="flex items-center gap-2">Acknowledgement
                  <input value={ack} maxLength={15} inputMode="numeric" onChange={(e) => setAck(e.target.value.replace(/[^0-9]/g, ''))} className="h-9 w-[170px] rounded-[10px] border border-pos-line bg-pos-surface px-2 font-mono text-pos-ink" />
                </label>
                <label className="flex items-center gap-2">Filed on
                  <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink" />
                </label>
              </>
            )}
          </div>
          <FilledFrom fills={[regimeFill]} />

          {engine ? (
            <p className="text-[13px] text-pos-ink/70">
              AY {ay} is worked from the figures on this page under the {regime === 'NEW' ? 'new' : 'old'} regime: total income <span className="font-mono">{inr(preview?.totalIncome)}</span>, total tax <span className="font-mono">{inr(preview?.totalTax)}</span>, {preview && preview.payable < 0 ? <>refund <span className="font-mono">{inr(-preview.payable)}</span></> : <>to pay <span className="font-mono">{inr(preview?.payable ?? 0)}</span></>}.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-pos-ink/70">
                {ay !== ITR_ENGINE_AY
                  ? `Tax for AY ${ay} is not worked here; the computation on this page uses the rates for AY ${ITR_ENGINE_AY}. Enter the figures of the return as filed.`
                  : `The tax for ${form} is worked in the form below; enter its figures here to keep them with the saved return.`}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {FILED_FIELDS.map(([k, label]) => (
                  <label key={k} className="text-[12px] text-pos-ink/70">{label}
                    <input inputMode="numeric" value={filed[k] ?? ''} onChange={(e) => setFiled({ ...filed, [k]: e.target.value.replace(/[^0-9]/g, '') })} className={`${fieldCls} text-right font-mono`} />
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block text-[12px] font-medium text-pos-ink/75">Notes to the return
            <textarea value={notes} maxLength={4000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="One note a line, for example: salary as per Form 16 of both employers; interest on fixed deposits as per AIS."
              className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-2 text-[13px] text-pos-ink outline-none focus:border-pos-accent" />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}><Save className="h-4 w-4" /> {busy ? 'Saving' : saved ? 'Save changes' : 'Save return'}</button>
            {saved && <Link href={`/itr/print/${saved.id}`} className={btnQuiet}><Printer className="h-4 w-4" /> Computation of income</Link>}
            {dirty && <span className="text-[12px] text-[#b45309]">Changes not saved</span>}
            {message && <span className={`text-[13px] ${message.kind === 'ok' ? 'text-[#15803d]' : 'text-[#dc2626]'}`}>{message.text}</span>}
          </div>
          {client && <p className="text-[12px] text-pos-ink/70">{client.name}, PAN {client.pan}. Only the figures, the regime, notes and challan dates are saved; the PAN, bank account and contact details typed into a form are not.</p>}

          <div className="border-t border-pos-line pt-3">
            <h3 className="mb-2 text-[14px] font-semibold text-pos-ink">Five years of {client?.name ?? 'this client'}</h3>
            <ItrFiveYearView rows={years} current={ay} onPick={pickYear} />
          </div>
          <div className="border-t border-pos-line pt-3">
            <ItrChallanCard returnId={saved?.id ?? null} dirty={dirty} />
          </div>
        </>
      )}
    </section>
  );
}
