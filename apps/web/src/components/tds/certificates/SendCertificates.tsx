'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { History, Send } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const AGENT = 'http://127.0.0.1:18531';
const mask = (pan: string) => (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? `XXXXX${pan.slice(5)}` : pan);

export interface CheckedCert { file: string; pan: string; quarter?: string; signed: boolean; size: number; problem?: string }
interface Client { id: string; legal_name: string; trade_name?: string | null }
interface Row { file: string; pan: string; quarter: string; email: string; mobile: string; name?: string | null }
interface Result { file: string; pan: string; email: string | null; whatsapp: string | null; message?: string; certificateId?: string }
interface SendLog { channel: string; recipient: string; status: string; error: string | null; sentAt: string; sentBy: string | null; linkExpiresAt: string | null; downloads: number | null }

const STATUS: Record<string, string> = { SENT: 'Sent', FAILED: 'Failed', NOT_SET_UP: 'Not set up' };

function currentTaxYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const blob = new Blob([buf]);
  const url: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

/**
 * Sends checked certificates to payees: each PDF is read from the agent unchanged (with a
 * server-signed certs.read code), uploaded for the chosen client and quarter, then emailed as an
 * attachment and, when WhatsApp is set up, announced with a link that works for 7 days.
 */
export function SendCertificates({ selected, onDone }: { selected: CheckedCert[]; onDone?: () => void }) {
  const { authFetch } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [entityId, setEntityId] = useState('');
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [whatsapp, setWhatsapp] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [setup, setSetup] = useState<{ email: boolean; whatsapp: boolean } | null>(null);
  const [log, setLog] = useState<{ file: string; sends: SendLog[] } | null>(null);

  useEffect(() => {
    authFetch('/api/v1/client-master/entities')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClients(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => {});
  }, [authFetch]);

  const key = useMemo(() => selected.map((c) => c.file).join('|'), [selected]);
  useEffect(() => {
    setResults(null);
    setRows(selected.map((c) => ({ file: c.file, pan: c.pan, quarter: c.quarter ?? 'Q1', email: '', mobile: '' })));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Addresses SynexTax already knows: last ones used for this client, or the deductee records.
  useEffect(() => {
    if (!entityId || !selected.length) return;
    const pans = [...new Set(selected.map((c) => c.pan))];
    authFetch('/api/v1/tds/certificates/recipients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, pans }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setRows((prev) => prev.map((row) => {
          const k = b.recipients?.[row.pan];
          return k ? { ...row, email: row.email || k.email || '', mobile: row.mobile || k.mobile || '', name: k.name } : row;
        }));
      })
      .catch(() => {});
  }, [entityId, key, authFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const send = async () => {
    setError(null);
    setResults(null);
    if (!entityId) return setError('Choose the client who deducted the tax.');
    const ready = rows.filter((r) => r.email.trim() || r.mobile.trim());
    if (!ready.length) return setError('Add an email address or mobile number for at least one payee.');
    const badMobile = ready.find((r) => r.mobile.trim() && !/^\+91[6-9]\d{9}$/.test(r.mobile.trim()));
    if (badMobile) return setError(`Mobile for ${mask(badMobile.pan)}: +91 and 10 digits.`);

    setBusy('Getting codes for the agent');
    const ch = await authFetch('/api/v1/tds/certificates/agent-challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: ready.length }) });
    const chb = await ch.json().catch(() => ({}));
    if (!ch.ok) {
      setBusy(null);
      return setError(chb.message ?? 'Could not get codes for the agent from the server.');
    }
    const out: Result[] = [];
    const items: Array<{ certificateId: string; email?: string; mobile?: string; idx: number }> = [];
    for (let i = 0; i < ready.length; i++) {
      const row = ready[i];
      setBusy(`Uploading ${i + 1} of ${ready.length}`);
      try {
        const a = await fetch(`${AGENT}/api/v1/certificates/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: row.file, challengeToken: chb.tokens[i] }) });
        if (!a.ok) {
          const ab = await a.json().catch(() => ({}));
          out.push({ file: row.file, pan: row.pan, email: null, whatsapp: null, message: ab.error ?? 'The agent could not read this file.' });
          continue;
        }
        const pdfBase64 = await toBase64(await a.arrayBuffer());
        const u = await authFetch('/api/v1/tds/certificates/files', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entityId, payeePan: row.pan, taxYear, quarter: row.quarter, fileName: row.file.split('/').pop(), pdfBase64 }),
        });
        const ub = await u.json().catch(() => ({}));
        if (!u.ok) {
          out.push({ file: row.file, pan: row.pan, email: null, whatsapp: null, message: ub.message ?? 'Not uploaded.' });
          continue;
        }
        out.push({ file: row.file, pan: row.pan, email: null, whatsapp: null, certificateId: ub.id });
        items.push({ certificateId: ub.id, email: row.email.trim() || undefined, mobile: row.mobile.trim() || undefined, idx: out.length - 1 });
      } catch {
        setBusy(null);
        return setError('The SynexTax agent is not running on this computer.');
      }
    }
    if (items.length) {
      setBusy('Sending');
      const s = await authFetch('/api/v1/tds/certificates/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ whatsapp, items: items.map(({ certificateId, email, mobile }) => ({ certificateId, email, mobile })) }),
      });
      const sb = await s.json().catch(() => ({}));
      if (!s.ok) setError(sb.message ?? 'Not sent.');
      else {
        setSetup({ email: sb.emailSetUp, whatsapp: sb.whatsappSetUp });
        sb.results.forEach((r: { email: string | null; whatsapp: string | null; message?: string }, i: number) => {
          Object.assign(out[items[i].idx], { email: r.email, whatsapp: r.whatsapp, message: r.message });
        });
      }
    }
    setResults(out);
    setBusy(null);
    onDone?.();
  };

  const showLog = async (r: Result) => {
    if (!r.certificateId) return;
    const l = await authFetch(`/api/v1/tds/certificates/${r.certificateId}/sends`);
    const b = await l.json().catch(() => ({}));
    if (l.ok) setLog({ file: r.file, sends: b.sends });
  };

  const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink';

  return (
    <section className="pos-card space-y-3 p-4 text-[13px] text-pos-ink/70">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">Client who deducted the tax
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className={input}>
            <option value="">Choose</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Tax year<input value={taxYear} onChange={(e) => setTaxYear(e.target.value)} maxLength={7} className={`${input} w-24 font-mono`} /></label>
        <label className="flex h-9 items-center gap-2"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Also send a WhatsApp link (7 days)</label>
      </div>

      <table className="w-full">
        <thead className="text-pos-ink/55"><tr>
          <th className="px-2 py-1 text-left text-[12px] font-medium">PAN</th>
          <th className="px-2 py-1 text-left text-[12px] font-medium">Quarter</th>
          <th className="px-2 py-1 text-left text-[12px] font-medium">Email</th>
          <th className="px-2 py-1 text-left text-[12px] font-medium">Mobile</th>
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.file} className="border-t border-pos-line">
            <td className="px-2 py-1.5"><span className="font-mono text-pos-ink">{mask(r.pan)}</span>{r.name ? <span className="ml-2 text-pos-ink/55">{r.name}</span> : null}</td>
            <td className="px-2 py-1.5">
              <select value={r.quarter} onChange={(e) => update(i, { quarter: e.target.value })} className={`${input} w-20`}>{['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q}>{q}</option>)}</select>
            </td>
            <td className="px-2 py-1.5"><input type="email" value={r.email} maxLength={254} onChange={(e) => update(i, { email: e.target.value })} placeholder="payee@example.com" className={`${input} w-full`} /></td>
            <td className="px-2 py-1.5"><input type="tel" value={r.mobile} maxLength={13} onChange={(e) => update(i, { mobile: e.target.value })} placeholder="+91" className={`${input} w-36 font-mono`} /></td>
          </tr>
        ))}</tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={Boolean(busy) || !rows.length} onClick={send} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pos-accent px-4 font-medium text-white disabled:opacity-50">
          <Send className="h-4 w-4" /> {busy ?? `Send ${rows.length} certificate${rows.length === 1 ? '' : 's'}`}
        </button>
        <span className="text-[12px] text-pos-ink/55">The PDFs go out exactly as TRACES produced them.</span>
      </div>
      {error && <p role="alert" className="text-[#dc2626]">{error}</p>}
      {setup && (!setup.email || (whatsapp && !setup.whatsapp)) && (
        <p className="text-[12px] text-pos-ink/60">{!setup.email ? 'Email is not set up on the server yet. ' : ''}{whatsapp && !setup.whatsapp ? 'WhatsApp is not set up yet.' : ''} These attempts are in the send log as not set up.</p>
      )}

      {results && (
        <table className="w-full">
          <thead className="text-pos-ink/55"><tr>
            <th className="px-2 py-1 text-left text-[12px] font-medium">PAN</th>
            <th className="px-2 py-1 text-left text-[12px] font-medium">Email</th>
            <th className="px-2 py-1 text-left text-[12px] font-medium">WhatsApp</th>
            <th className="px-2 py-1 text-left text-[12px] font-medium" />
          </tr></thead>
          <tbody>{results.map((r) => (
            <tr key={r.file} className="border-t border-pos-line">
              <td className="px-2 py-1.5 font-mono text-pos-ink">{mask(r.pan)}</td>
              <td className={`px-2 py-1.5 ${r.email === 'SENT' ? 'text-[#15803d]' : r.email === 'FAILED' ? 'text-[#dc2626]' : ''}`}>{r.email ? STATUS[r.email] : ''}</td>
              <td className={`px-2 py-1.5 ${r.whatsapp === 'SENT' ? 'text-[#15803d]' : r.whatsapp === 'FAILED' ? 'text-[#dc2626]' : ''}`}>{r.whatsapp ? STATUS[r.whatsapp] : ''}</td>
              <td className="px-2 py-1.5">
                {r.message && <span className="mr-2 text-[#dc2626]">{r.message}</span>}
                {r.certificateId && <button type="button" onClick={() => showLog(r)} className="inline-flex items-center gap-1 text-pos-accent"><History className="h-3.5 w-3.5" /> Send log</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {log && (
        <div className="rounded-[10px] border border-pos-line p-3">
          <p className="mb-2 font-medium text-pos-ink">Send log for <span className="font-mono text-[12px]">{log.file}</span></p>
          {log.sends.length ? (
            <ul className="space-y-1">{log.sends.map((s, i) => (
              <li key={i}>
                {new Date(s.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}, {s.channel === 'EMAIL' ? 'email' : 'WhatsApp'} to {s.recipient}: {STATUS[s.status] ?? s.status}
                {s.sentBy ? ` by ${s.sentBy}` : ''}{s.error ? ` (${s.error})` : ''}
                {s.linkExpiresAt ? `; link works until ${new Date(s.linkExpiresAt).toLocaleDateString('en-IN')}, opened ${s.downloads ?? 0} times` : ''}
              </li>
            ))}</ul>
          ) : <p>Nothing sent yet.</p>}
        </div>
      )}
    </section>
  );
}
