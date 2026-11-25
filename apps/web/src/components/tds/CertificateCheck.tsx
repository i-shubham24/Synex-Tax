'use client';

import React, { useState } from 'react';
import { FolderSearch } from 'lucide-react';
import { SendCertificates } from './certificates/SendCertificates';

const AGENT = 'http://127.0.0.1:18531';
const mask = (pan: string) => (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? `XXXXX${pan.slice(5)}` : pan);

interface Cert { file: string; pan: string; quarter?: string; signed: boolean; size: number; problem?: string }

/**
 * Checks Form 130, 131 and 133 PDFs made by the TRACES PDF converter before they go to payees:
 * one PAN in each file name, and a digital signature in each PDF. SynTax does not make or change them.
 */
export function CertificateCheck() {
  const [sub, setSub] = useState('');
  const [data, setData] = useState<{ folder: string; certificates: Cert[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const scan = async () => {
    setError(null);
    try {
      const r = await fetch(`${AGENT}/api/v1/certificates/scan?folder=${encodeURIComponent(sub)}`);
      const b = await r.json();
      if (!r.ok) return setError(b.error ?? 'Could not read the folder.');
      setData(b);
      setPicked(new Set());
    } catch {
      setError('The SynTax agent is not running on this computer.');
    }
  };
  const list = data?.certificates ?? [];
  const problems = list.filter((c) => c.problem);
  const pans = new Map<string, number>();
  for (const c of list) if (c.pan) pans.set(c.pan, (pans.get(c.pan) ?? 0) + 1);
  const duplicates = [...pans.entries()].filter(([, n]) => n > 1).length;
  // Only certificates that passed the check can be sent.
  const sendable = list.filter((c) => c.signed && c.pan && !c.problem);
  const selected = sendable.filter((c) => picked.has(c.file));
  const toggle = (file: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(file)) n.delete(file); else n.add(file); return n; });
  const allPicked = sendable.length > 0 && selected.length === sendable.length;

  return (
    <section className="space-y-3">
      <div className="pos-card space-y-3 p-4 text-[13px] text-pos-ink/65">
        <p>Run the TRACES PDF converter (with your digital signature) on the certificate files you downloaded from TRACES, and save the PDFs in the agent&apos;s certificates folder. SynTax then checks each one before you send it.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">Sub-folder (optional)<input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="e.g. Q2 2026-27" className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-pos-ink" /></label>
          <button type="button" onClick={scan} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pos-accent px-4 font-medium text-white"><FolderSearch className="h-4 w-4" /> Check certificates</button>
        </div>
        {error && <p className="text-[#dc2626]">{error}</p>}
      </div>
      {data && (
        <section className="pos-card overflow-x-auto">
          <div className="flex flex-wrap justify-between gap-2 border-b border-pos-line px-4 py-3 text-[13px]">
            <span className="font-semibold text-pos-ink">{list.length} PDF{list.length === 1 ? '' : 's'} in {data.folder}</span>
            <span className={problems.length ? 'text-[#dc2626]' : 'text-[#15803d]'}>{problems.length ? `${problems.length} need attention` : 'All signed, one PAN each'}{duplicates ? `; ${duplicates} PAN${duplicates === 1 ? '' : 's'} appear more than once` : ''}</span>
          </div>
          {list.length ? (
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className="px-3 py-2 text-left"><input type="checkbox" aria-label="Choose all that passed" checked={allPicked} disabled={!sendable.length} onChange={() => setPicked(allPicked ? new Set() : new Set(sendable.map((c) => c.file)))} /></th><th className="px-3 py-2 text-left text-[12px] font-medium">File</th><th className="px-3 py-2 text-left text-[12px] font-medium">PAN</th><th className="px-3 py-2 text-left text-[12px] font-medium">Quarter</th><th className="px-3 py-2 text-left text-[12px] font-medium">Signed</th><th className="px-3 py-2 text-left text-[12px] font-medium" /></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.file} className="border-t border-pos-line text-[13px]"><td className="px-3 py-2"><input type="checkbox" aria-label={`Choose ${c.file}`} checked={picked.has(c.file)} disabled={!(c.signed && c.pan && !c.problem)} onChange={() => toggle(c.file)} /></td><td className="px-3 py-2 font-mono text-[12px] text-pos-ink">{c.file}</td><td className="px-3 py-2 font-mono text-pos-ink/70">{c.pan ? mask(c.pan) : ''}</td><td className="px-3 py-2">{c.quarter ?? ''}</td><td className="px-3 py-2">{c.signed ? 'Yes' : 'No'}</td><td className="px-3 py-2 text-[#dc2626]">{c.problem ?? ''}</td></tr>
              ))}</tbody></table>
          ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">No PDFs there yet.</p>}
          <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/55">{selected.length ? `${selected.length} chosen to send.` : 'Choose the certificates that passed to send them to their payees by email and WhatsApp.'}</p>
        </section>
      )}
      {selected.length > 0 && <SendCertificates selected={selected} />}
    </section>
  );
}
