'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, RefreshCw, Usb, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CustomDropdown } from '../ui/CustomSelect';

/** The agent listens on loopback only (apps/dsc-agent). */
const AGENT = process.env.NEXT_PUBLIC_DSC_AGENT_URL || 'http://127.0.0.1:18531';

interface AgentCertificate {
  id: string;
  commonName: string;
  issuer: string;
  serialNumber: string;
  pan?: string;
  validTo: string;
  keyAlgorithm: string;
  provider: string;
  token: boolean;
}

interface Signable {
  id: string;
  form: string;
  period: string;
  client: string;
}

interface Receipt {
  status: 'SIGNED' | 'SIGNED_CERTIFICATE_UNCHECKED';
  form: string;
  period: string;
  client: string;
  digestSha256: string;
  signedAt: string;
  certificate: { commonName: string; issuer: string; serialNumber: string; pan: string | null };
}

const maskPan = (pan?: string | null) => (pan ? `XXXXX${pan.slice(5)}` : 'Not shown in certificate');
const issuerName = (dn: string) => /CN=([^,]+)/.exec(dn)?.[1] ?? dn;
const formLabel = (f: string) => f.replace(/^FORM_/, 'Form ').replace(/^GSTR(\d)/, 'GSTR-$1');

async function agentFetch(path: string, init?: RequestInit, ms = 1500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(`${AGENT}${path}`, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Signs an open return with a Class 3 DSC on this computer. The server builds the document and
 * its digest; the desktop agent signs the digest with a certificate from the Windows store (the
 * token's own driver asks for the PIN, SynexTax never sees it); the server checks the signature
 * against the certificate and records the attempt in the signing trail.
 */
export function DscSigningPanel({ onSigned }: { onSigned?: () => void }) {
  const { authFetch } = useAuth();
  const [agent, setAgent] = useState<'checking' | 'offline' | 'ready'>('checking');
  const [certs, setCerts] = useState<AgentCertificate[]>([]);
  const [certId, setCertId] = useState<string>('');
  const [showAll, setShowAll] = useState(false);
  const [returns, setReturns] = useState<Signable[]>([]);
  const [filingId, setFilingId] = useState<string>('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const scan = useCallback(async () => {
    setAgent('checking');
    try {
      const r = await agentFetch('/api/v1/tokens');
      const b = (await r.json().catch(() => ({}))) as { tokens?: AgentCertificate[] };
      if (!r.ok) throw new Error();
      const list = b.tokens ?? [];
      setCerts(list);
      setCertId((cur) => (list.some((c) => c.id === cur) ? cur : list.find((c) => c.token)?.id ?? ''));
      setAgent('ready');
    } catch {
      setCerts([]);
      setAgent('offline');
    }
  }, []);

  useEffect(() => {
    scan();
    authFetch('/api/v1/dsc/signable')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data?: Signable[] }) => {
        setReturns(b.data ?? []);
        setFilingId((cur) => cur || b.data?.[0]?.id || '');
      })
      .catch(() => setReturns([]));
  }, [scan, authFetch]);

  // A Class 3 DSC is issued on a token; certificates held by Windows itself are shown only on request.
  const visible = showAll ? certs : certs.filter((c) => c.token);
  const hidden = certs.length - certs.filter((c) => c.token).length;
  const cert = visible.find((c) => c.id === certId);
  const target = returns.find((f) => f.id === filingId);

  const sign = async () => {
    if (!cert || !target) return;
    setError(null);
    setReceipt(null);
    try {
      setStep('Preparing the return for signing…');
      const c = await authFetch('/api/v1/dsc/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filingId: target.id }),
      });
      const cb = await c.json().catch(() => ({}));
      if (!c.ok) throw new Error(cb.message ?? 'The server could not prepare the return.');
      const { challengeNonce, agentToken, digestSha256 } = cb.data as { challengeNonce: string; agentToken: string; digestSha256: string };

      setStep(cert.token ? 'Waiting for the token. Enter the PIN in the window your token opens.' : 'Signing on this computer…');
      let s: Response;
      try {
        // The token driver's PIN window waits for the user, so allow up to two minutes.
        s = await agentFetch('/api/v1/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeToken: agentToken, certificateId: cert.id, digestSha256 }) }, 120_000);
      } catch {
        throw new Error('The desktop agent did not answer. Check that it is running, then try again.');
      }
      const sb = await s.json().catch(() => ({}));
      if (!s.ok) throw new Error(String(sb.error ?? 'The agent could not sign.').replace(/^dsc: /, ''));

      setStep('Checking the signature…');
      const v = await authFetch('/api/v1/dsc/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeNonce, filingId: target.id, signature: sb.signature, algorithm: sb.algorithm, certificate: sb.certificate, chain: sb.chain ?? [] }),
      });
      const vb = await v.json().catch(() => ({}));
      if (!v.ok) throw new Error(vb.message ?? 'The signature was not accepted.');
      setReceipt({ ...vb.data, form: target.form, period: target.period, client: target.client });
      onSigned?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed.');
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Certificates on this computer */}
      <div className="space-y-4 lg:col-span-5">
        <div className="space-y-4 rounded-xl border border-pos-line bg-pos-muted p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-pos-line pb-3">
            <div className="flex items-center gap-2">
              <Usb className="h-4 w-4 text-[#3A6FE8]" />
              <h2 className="text-sm font-semibold text-pos-ink">DSC on this computer</h2>
            </div>
            <button type="button" onClick={scan} className="flex items-center gap-1 rounded border border-pos-line bg-pos-surface px-2 py-0.5 text-[12px] font-semibold text-pos-ink/70 hover:text-pos-ink">
              <RefreshCw className={`h-3 w-3 ${agent === 'checking' ? 'animate-spin' : ''}`} /> Check again
            </button>
          </div>

          {agent === 'checking' && <div className="p-4 text-center text-xs text-pos-ink/60">Looking for the desktop agent…</div>}
          {agent === 'offline' && (
            <div className="space-y-1.5 rounded-lg border border-pos-line bg-pos-surface p-3 text-xs text-pos-ink/70">
              <div className="font-semibold text-pos-ink">The SynexTax desktop agent is not running</div>
              <div>Start the agent on this computer with your DSC token plugged in, then check again.</div>
            </div>
          )}
          {agent === 'ready' && visible.length === 0 && (
            <div className="space-y-1.5 rounded-lg border border-pos-line bg-pos-surface p-3 text-xs text-pos-ink/70">
              <div className="font-semibold text-pos-ink">No DSC token found</div>
              <div>Plug in the DSC token. Its driver must be installed so Windows can see the certificate.</div>
            </div>
          )}
          {agent === 'ready' && hidden > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-pos-accent hover:underline">
              {showAll ? 'Hide certificates not on a token' : `Show ${hidden} certificate${hidden === 1 ? '' : 's'} not on a token`}
            </button>
          )}
          {visible.map((c) => (
            <label key={c.id} className={`block cursor-pointer space-y-1.5 rounded-lg border p-3 text-[12px] ${c.id === certId ? 'border-pos-accent bg-pos-surface' : 'border-pos-line bg-pos-surface/60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input type="radio" name="dsc-cert" checked={c.id === certId} onChange={() => setCertId(c.id)} className="accent-pos-accent" />
                  <span className="text-xs font-semibold text-pos-ink">{c.commonName || 'Unnamed certificate'}</span>
                </div>
                <span className={`rounded border px-1.5 py-0.5 text-[12px] font-semibold ${c.token ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/30 bg-amber-500/10 text-amber-600'}`}>
                  {c.token ? 'Token' : 'Not on a token'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[12px] text-pos-ink/60">
                <div>PAN<span className="block font-semibold text-pos-ink">{maskPan(c.pan)}</span></div>
                <div>Valid until<span className="block font-semibold text-pos-ink">{new Date(c.validTo).toLocaleDateString('en-IN')}</span></div>
                <div>Issued by<span className="block text-pos-ink">{issuerName(c.issuer)}</span></div>
                <div>Key<span className="block text-pos-ink">{c.keyAlgorithm}</span></div>
              </div>
              <div className="truncate text-[12px] text-pos-ink/60">{c.provider}</div>
            </label>
          ))}
        </div>
      </div>

      {/* Signing */}
      <div className="space-y-4 lg:col-span-7">
        <div className="space-y-4 rounded-xl border border-pos-line bg-pos-muted p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-pos-line pb-3">
            <div>
              <h2 className="text-sm font-semibold text-pos-ink">Sign a return</h2>
              <p className="text-[12px] text-pos-ink/60">SynexTax prepares the return; your token signs it; the server checks the signature and records it.</p>
            </div>
            <span className="rounded border border-pos-line bg-pos-surface px-2 py-0.5 text-[12px] font-semibold text-pos-accent">Partner or manager</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="block font-semibold text-pos-ink/70">Return</label>
              {returns.length === 0 ? (
                <div className="rounded-lg border border-pos-line bg-pos-surface p-3 text-pos-ink/60">There is no open return to sign.</div>
              ) : (
                <CustomDropdown
                  variant="form"
                  value={filingId}
                  onChange={(v) => setFilingId(v)}
                  className="w-full"
                  buttonClassName="w-full h-10 font-semibold"
                  options={returns.map((f) => ({ value: f.id, label: `${f.client} | ${formLabel(f.form)}`, description: `Period: ${f.period}`, badge: formLabel(f.form) }))}
                />
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-pos-line bg-pos-surface p-3.5 text-[12px] text-pos-ink/70">
              <div className="flex justify-between gap-3"><span>Signed with</span><span className="text-right font-semibold text-pos-ink">{cert ? `${cert.commonName}, ${maskPan(cert.pan)}` : 'Choose a certificate'}</span></div>
              <div className="flex justify-between gap-3"><span>PIN</span><span className="text-right">Entered in your token’s own window; SynexTax never sees it</span></div>
              <div className="flex justify-between gap-3"><span>Time to sign</span><span className="text-right">Two minutes from pressing Sign</span></div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {step && <div role="status" aria-live="polite" className="rounded-lg border border-pos-line bg-pos-surface p-3 text-[12px] text-pos-ink/70">{step}</div>}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={sign}
                disabled={!cert || !target || step !== null}
                className="flex items-center gap-2 rounded-lg bg-pos-accent px-4 py-2 font-semibold text-white shadow-md transition-colors hover:bg-pos-accent-deep disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                <span>{step ? 'Signing…' : 'Sign with DSC'}</span>
              </button>
            </div>
          </div>

          {receipt && (
            <div className={`space-y-2.5 rounded-xl border bg-pos-surface p-4 text-xs shadow-lg ${receipt.status === 'SIGNED' ? 'border-emerald-500/40' : 'border-amber-500/40'}`}>
              <div className={`flex items-center gap-1.5 border-b border-pos-line pb-2 font-semibold ${receipt.status === 'SIGNED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{receipt.status === 'SIGNED' ? 'Signed and checked' : 'Signature checked; certificate not checked'}</span>
              </div>
              <div className="space-y-1 text-[12px] text-pos-ink/70">
                <div>Return: <span className="font-semibold text-pos-ink">{receipt.client}, {formLabel(receipt.form)} {receipt.period}</span></div>
                <div>Signed by: <span className="font-semibold text-pos-ink">{receipt.certificate.commonName}</span> ({receipt.certificate.pan ?? 'PAN not in certificate'})</div>
                <div>Certificate: <span className="text-pos-ink">{issuerName(receipt.certificate.issuer)}, serial {receipt.certificate.serialNumber}</span></div>
                <div>Time: <span className="text-pos-ink">{new Date(receipt.signedAt).toLocaleString('en-IN')}</span></div>
                <div className="truncate">SHA-256: <span className="text-[#3A6FE8]">{receipt.digestSha256}</span></div>
                {receipt.status !== 'SIGNED' && (
                  <div className="pt-1 text-[12px] text-pos-ink/60">
                    This DSC does not chain to a CCA India root, so it was not issued by a licensed certifying authority. It is recorded in the signing trail as unverified; the live service refuses such a DSC.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
