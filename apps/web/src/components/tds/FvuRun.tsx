'use client';

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AGENT = 'http://127.0.0.1:18531';

/**
 * Hands the statement to Protean's FVU on this computer through the SynTax agent, then reads
 * back what the FVU produced. The FVU is Protean's own program; SynTax only prepares the folder.
 */
export function FvuRun({ fileName, text }: { fileName: string; text: string }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [state, setState] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const [errors, setErrors] = useState<string>('');
  const { authFetch } = useAuth();
  const [explained, setExplained] = useState<string | null>(null);

  // The India-hosted assistant, when set up, explains the report; identifiers are masked before it is sent.
  const explain = async () => {
    setExplained('Asking…');
    const r = await authFetch('/api/v1/integrations/assist/fvu-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: errors.slice(0, 20000) }) });
    const b = await r.json().catch(() => ({}));
    setExplained(r.ok ? b.answer : b.message ?? 'No answer.');
  };

  const start = async () => {
    setState(null);
    setErrors('');
    // The agent acts only on a single-use token signed by the SynTax server.
    const c = await authFetch('/api/v1/dsc/agent-challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fvu.prepare' }) });
    const cb = await c.json().catch(() => ({}));
    if (!c.ok) return setState({ tone: 'bad', text: cb.message ?? 'Could not get a code for the agent from the server.' });
    try {
      const r = await fetch(`${AGENT}/api/v1/fvu/prepare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName, statement: text, challengeToken: cb.token }) });
      const b = await r.json();
      if (!r.ok) return setState({ tone: 'bad', text: b.error ?? 'The agent could not prepare the file.' });
      setFolder(b.folder);
      setState(b.launched
        ? { tone: 'info', text: `The FVU is open with ${fileName} in ${b.folder}. Validate it there, then check the result here.` }
        : { tone: 'bad', text: `${b.launchError ?? 'The FVU could not be opened.'} The file is saved in ${b.folder}.` });
    } catch {
      setState({ tone: 'bad', text: 'The SynTax agent is not running on this computer. Start it, or validate the downloaded file with the FVU yourself.' });
    }
  };

  const check = async () => {
    if (!folder) return;
    try {
      const r = await fetch(`${AGENT}/api/v1/fvu/result?folder=${encodeURIComponent(folder)}`);
      const b = await r.json();
      if (!r.ok) return setState({ tone: 'bad', text: b.error ?? 'Could not read the result.' });
      if (b.validated) setState({ tone: 'ok', text: `Passed: the FVU wrote ${b.fvuFile}. Upload it with your digital signature.` });
      else if (b.errors) { setState({ tone: 'bad', text: 'The FVU found errors. Fix the rows in SynTax and write the statement again.' }); setErrors(b.errors); }
      else setState({ tone: 'info', text: 'No FVU output yet. Run the validation in the FVU window first.' });
    } catch {
      setState({ tone: 'bad', text: 'The SynTax agent is not running on this computer.' });
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-[10px] bg-pos-muted px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={start} className="inline-flex items-center gap-1.5 rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-pos-ink"><ShieldCheck className="h-4 w-4" /> Validate with the FVU on this computer</button>
        {folder && <button type="button" onClick={check} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-pos-ink">Check the FVU result</button>}
      </div>
      {state && <p role="status" className={state.tone === 'ok' ? 'text-[#15803d]' : state.tone === 'bad' ? 'text-[#dc2626]' : 'text-pos-ink/70'}>{state.text}</p>}
      {errors && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[8px] bg-pos-surface p-2 font-mono text-[12.5px] text-pos-ink">{errors}</pre>}
      {errors && <button type="button" onClick={explain} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-pos-ink">Explain these errors</button>}
      {explained && <p className="whitespace-pre-wrap text-pos-ink/80">{explained}</p>}
    </div>
  );
}
