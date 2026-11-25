'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Download, HardDrive, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Device { id: string; name: string; tokenHint: string; agentVersion: string | null; lastSeenAt: string | null; revokedAt: string | null; createdAt: string }
interface Rule {
  id: string; deviceId: string; device: string; label: string; product: string; sourceFolder: string | null; dailyTime: string;
  retentionDays: number | null; enabled: boolean; lastSuccessAt: string | null; lastError: string | null; late: boolean;
  lastVersion: { fileName: string; sizeBytes: number; completedAt: string } | null;
}
interface Version { id: string; fileName: string; sizeBytes: number; sha256: string; status: string; completedAt: string | null; deletedAt: string | null }

const PRODUCTS: Array<[string, string]> = [['tally', 'Tally'], ['busy', 'Busy'], ['marg', 'Marg'], ['zoho', 'Zoho Books export'], ['vyapar', 'Vyapar backup']];
const productLabel = (p: string) => PRODUCTS.find(([k]) => k === p)?.[1] ?? p;
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Accounting backups uploaded by the SynTax agent: the computers paired with a device token,
 * the backup rules (what, when, how long to keep), the versions kept, and which are late.
 */
export function BackupsPanel() {
  const { authFetch } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [state, setState] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [form, setForm] = useState({ deviceId: '', label: '', product: 'tally', dailyTime: '20:00', retentionDays: '', sourceFolder: '' });
  const [versions, setVersions] = useState<{ rule: Rule; list: Version[] } | null>(null);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([authFetch('/api/v1/backups/devices'), authFetch('/api/v1/backups/rules')]);
    if (d.status === 403) return setState({ tone: 'bad', text: 'A partner or manager looks after backups.' });
    if (!d.ok || !r.ok) return setState({ tone: 'bad', text: 'Backups could not be loaded.' });
    setDevices((await d.json()).devices);
    setRules((await r.json()).rules);
  }, [authFetch]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const post = async (url: string, body: unknown, method = 'POST') => {
    const r = await authFetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) setState({ tone: 'bad', text: b.message ?? 'Not saved.' });
    return r.ok ? b : null;
  };

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(null);
    const b = await post('/api/v1/backups/devices', { name: deviceName });
    if (!b) return;
    setNewToken({ name: deviceName, token: b.token });
    setDeviceName('');
    await load();
  };

  const revoke = async (d: Device) => {
    if (!window.confirm(`Withdraw ${d.name}? Its agent stops uploading until it is paired again.`)) return;
    if (await post(`/api/v1/backups/devices/${d.id}/revoke`, {})) await load();
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(null);
    const b = await post('/api/v1/backups/rules', {
      deviceId: form.deviceId, label: form.label, product: form.product, dailyTime: form.dailyTime,
      retentionDays: form.retentionDays ? Number(form.retentionDays) : null, sourceFolder: form.sourceFolder,
    });
    if (!b) return;
    setForm({ ...form, label: '', sourceFolder: '' });
    setState({ tone: 'ok', text: 'Rule added. The agent picks it up within half an hour, or when it starts.' });
    await load();
  };

  const toggleRule = async (r: Rule) => {
    if (await post(`/api/v1/backups/rules/${r.id}`, { label: r.label, sourceFolder: r.sourceFolder, dailyTime: r.dailyTime, retentionDays: r.retentionDays, enabled: !r.enabled }, 'PUT')) await load();
  };

  const showVersions = async (rule: Rule) => {
    const r = await authFetch(`/api/v1/backups/versions?ruleId=${rule.id}`);
    if (r.ok) setVersions({ rule, list: (await r.json()).versions });
  };

  const download = async (v: Version) => {
    const r = await authFetch(`/api/v1/backups/versions/${v.id}/download`);
    if (!r.ok) return setState({ tone: 'bad', text: 'The file could not be downloaded.' });
    if ((r.headers.get('content-type') ?? '').includes('application/json')) {
      const b = await r.json();
      if (b.url) window.location.href = b.url;
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = v.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = devices.filter((d) => !d.revokedAt);
  const input = 'w-full rounded-lg border border-pos-line bg-pos-surface px-3 py-2 text-sm text-pos-ink focus:border-pos-accent focus:outline-none';
  const late = rules.filter((r) => r.late);

  return (
    <div className="space-y-6">
      <div className="border-b border-pos-line pb-4">
        <h3 className="text-lg font-semibold text-pos-ink">Backups</h3>
        <p className="mt-1 text-xs text-pos-ink/70">The SynTax agent backs up Tally, Busy and Marg data, Zoho Books exports and Vyapar backups on your office computers, and uploads them daily. Unchanged data is not uploaded again. Partners get an email when a backup is more than a day late.</p>
      </div>

      {late.length > 0 && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {late.length} backup{late.length === 1 ? ' is' : 's are'} late: {late.map((r) => r.label).join(', ')}.
        </p>
      )}

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-pos-ink">Computers</h4>
        {devices.length ? (
          <ul className="divide-y divide-pos-line rounded-lg border border-pos-line text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 text-pos-ink"><HardDrive className="h-4 w-4 text-pos-ink/60" /> {d.name} <span className="font-mono text-[12px] text-pos-ink/60">…{d.tokenHint}</span></span>
                <span className="text-xs text-pos-ink/60">
                  {d.revokedAt ? `Withdrawn ${when(d.revokedAt)}` : `Last seen ${when(d.lastSeenAt)}${d.agentVersion ? `, agent ${d.agentVersion}` : ''}`}
                  {!d.revokedAt && <button type="button" onClick={() => revoke(d)} className="ml-3 text-red-600">Withdraw</button>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-pos-ink/60">No computers yet.</p>}
        <form onSubmit={addDevice} className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Computer name</span>
            <input className={input} value={deviceName} maxLength={80} required placeholder="Office PC" onChange={(e) => setDeviceName(e.target.value)} />
          </label>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-pos-accent px-4 py-2 text-xs font-semibold text-white hover:bg-pos-accent-deep"><Plus className="h-4 w-4" /> Add computer</button>
        </form>
        {newToken && (
          <div className="space-y-2 rounded-lg border border-pos-line bg-pos-muted p-3 text-xs text-pos-ink/75">
            <p>Device token for <span className="font-semibold text-pos-ink">{newToken.name}</span>. It is shown only now. On that computer, run <span className="font-mono">synextax-agent pair</span> and paste it when asked.</p>
            <div className="flex items-center gap-2">
              <code className="break-all font-mono text-[12px] text-pos-ink">{newToken.token}</code>
              <button type="button" aria-label="Copy the token" onClick={() => navigator.clipboard?.writeText(newToken.token)} className="text-pos-accent"><Copy className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => setNewToken(null)} className="text-pos-accent">I have saved it</button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-pos-ink">Backup rules</h4>
        {rules.length ? (
          <div className="overflow-x-auto rounded-lg border border-pos-line">
            <table className="w-full text-sm">
              <thead className="text-xs text-pos-ink/55"><tr>
                <th className="px-3 py-2 text-left font-medium">Name</th><th className="px-3 py-2 text-left font-medium">Computer</th>
                <th className="px-3 py-2 text-left font-medium">Daily at</th><th className="px-3 py-2 text-left font-medium">Last backup</th>
                <th className="px-3 py-2 text-left font-medium">Keep</th><th className="px-3 py-2 text-left font-medium" />
              </tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.id} className="border-t border-pos-line">
                  <td className="px-3 py-2 text-pos-ink">{r.label}<span className="block text-xs text-pos-ink/55">{productLabel(r.product)}</span></td>
                  <td className="px-3 py-2">{r.device}</td>
                  <td className="px-3 py-2 font-mono">{r.dailyTime}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={r.late ? 'text-red-600' : 'text-pos-ink/75'}>{r.late ? 'Late. ' : ''}{when(r.lastSuccessAt)}</span>
                    {r.lastVersion && <span className="block text-pos-ink/55">{size(r.lastVersion.sizeBytes)}</span>}
                    {r.lastError && <span className="block text-red-600">{r.lastError}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.retentionDays ? `${r.retentionDays} days` : 'All versions'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <button type="button" onClick={() => showVersions(r)} className="mr-3 text-pos-accent">Versions</button>
                    <button type="button" onClick={() => toggleRule(r)} className="text-pos-ink/70">{r.enabled ? 'Pause' : 'Resume'}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-pos-ink/60">No rules yet.</p>}

        {active.length > 0 && (
          <form onSubmit={addRule} className="grid grid-cols-1 gap-3 rounded-lg border border-pos-line p-3 sm:grid-cols-3">
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Computer</span>
              <select className={input} required value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>
                <option value="">Choose</option>{active.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Software</span>
              <select className={input} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>{PRODUCTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Name</span>
              <input className={input} required maxLength={80} value={form.label} placeholder="Sharma Traders accounts" onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Daily at (India time)</span>
              <input type="time" className={input} required value={form.dailyTime} onChange={(e) => setForm({ ...form, dailyTime: e.target.value })} />
            </label>
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Delete versions older than (days)</span>
              <input type="number" min={7} max={3650} className={input} value={form.retentionDays} placeholder="Keep all" onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} />
            </label>
            <label className="block space-y-1"><span className="block text-xs font-semibold text-pos-ink">Data folder (optional)</span>
              <input className={`${input} font-mono`} maxLength={260} value={form.sourceFolder} placeholder="Found by the agent" onChange={(e) => setForm({ ...form, sourceFolder: e.target.value })} />
            </label>
            <div className="sm:col-span-3"><button type="submit" className="rounded-xl bg-pos-accent px-5 py-2 text-xs font-semibold text-white hover:bg-pos-accent-deep">Add rule</button></div>
          </form>
        )}
      </section>

      {versions && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-pos-ink">Versions of {versions.rule.label}</h4>
          {versions.list.length ? (
            <ul className="divide-y divide-pos-line rounded-lg border border-pos-line text-sm">
              {versions.list.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><span className="font-mono text-[12px] text-pos-ink">{v.fileName}</span> <span className="text-xs text-pos-ink/55">{size(v.sizeBytes)}, {when(v.completedAt)}</span></span>
                  {v.status === 'COMPLETE'
                    ? <button type="button" onClick={() => download(v)} className="inline-flex items-center gap-1 text-xs text-pos-accent"><Download className="h-3.5 w-3.5" /> Download</button>
                    : <span className="text-xs text-pos-ink/60">Deleted {when(v.deletedAt)}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-pos-ink/60">Nothing uploaded yet.</p>}
        </section>
      )}

      {state && <p role={state.tone === 'bad' ? 'alert' : 'status'} className={`text-xs ${state.tone === 'bad' ? 'text-red-600' : 'text-emerald-600'}`}>{state.text}</p>}
    </div>
  );
}
