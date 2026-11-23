'use client';

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Chain {
  checked: number;
  firstBroken: number | null;
  headOk: boolean;
  intact: boolean;
}

/**
 * The audit evidence pack: the change log with its SHA-256 hash chain, the DSC signing trail and
 * the PII reveal log, exported by a partner as one JSON file for auditors.
 */
export function EvidencePanel() {
  const { authFetch, user } = useAuth();
  const [chain, setChain] = useState<Chain | null | 'error'>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const partner = user?.role === 'PARTNER';

  useEffect(() => {
    authFetch('/api/v1/audit/chain')
      .then(async (r) => setChain(r.ok ? await r.json() : 'error'))
      .catch(() => setChain('error'));
  }, [authFetch]);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await authFetch('/api/v1/audit/export');
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setMessage(b.message ?? 'The export did not work. Try again.');
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'synextax-audit.json';
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const status =
    chain === null
      ? 'Checking'
      : chain === 'error'
        ? 'Could not be checked'
        : chain.intact
          ? `Intact, ${chain.checked.toLocaleString('en-IN')} entries`
          : chain.firstBroken !== null
            ? `Broken at entry ${chain.firstBroken}`
            : 'Entries missing at the end';

  return (
    <div className="space-y-6">
      <div className="border-b border-pos-line pb-4">
        <h3 className="text-lg font-semibold text-pos-ink">Audit evidence</h3>
        <p className="mt-1 text-xs text-pos-ink/70">The record auditors ask for under MCA Rule 3(1) and CGST Rule 56(15).</p>
      </div>

      <div className="space-y-3 rounded-xl border border-pos-line bg-pos-muted p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-pos-ink">Evidence pack</span>
          <button
            type="button"
            onClick={download}
            disabled={!partner || busy}
            title={partner ? undefined : 'Only a partner can export the audit trail'}
            className="flex items-center gap-2 rounded-lg bg-pos-accent px-3 py-2 font-semibold text-white transition-colors hover:bg-pos-accent-deep disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>{busy ? 'Preparing' : 'Download (.json)'}</span>
          </button>
        </div>
        <p className="leading-relaxed text-pos-ink/70">
          Every recorded change with the SHA-256 chain that links it to the one before, every DSC signing attempt and every time a full PAN or contact was revealed, with who and why. PANs inside the change details are masked.
        </p>
        {!partner && <p className="text-pos-ink/60">Only a partner can download it.</p>}
        {message && <p role="alert" className="text-red-600">{message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-pos-line bg-pos-surface p-4">
          <div className="text-pos-ink/60">Change log chain</div>
          <div className={`text-sm font-semibold tabular-nums ${chain && chain !== 'error' && !chain.intact ? 'text-red-600' : 'text-pos-ink'}`}>{status}</div>
          <div className="text-pos-ink/60">Recomputed by the server just now</div>
        </div>
        <div className="space-y-1 rounded-xl border border-pos-line bg-pos-surface p-4">
          <div className="text-pos-ink/60">Retention</div>
          <div className="text-sm font-semibold text-pos-ink">8 years</div>
          <div className="text-pos-ink/60">Companies Act Section 128(5); audit rows cannot be edited or deleted</div>
        </div>
      </div>
    </div>
  );
}
