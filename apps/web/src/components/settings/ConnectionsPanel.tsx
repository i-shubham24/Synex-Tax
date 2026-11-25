'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface Status { uploads: 'S3' | 'DISK' | 'DEV_DISK' | 'OFF'; email: boolean; whatsapp: boolean; assistant: boolean; itrSoftwareId: boolean; desktopAgent: boolean }

const ROWS: Array<{ key: keyof Status; title: string; on: string; off: string; how: string }> = [
  { key: 'uploads', title: 'Client document uploads', on: 'Files are stored', off: 'Switched off', how: 'S3_BUCKET and S3_REGION (ap-south-1 or ap-south-2) with AWS keys, or FILE_STORE_DIR on a server with a disk.' },
  { key: 'email', title: 'Email (Amazon SES, India)', on: 'Reminders are sent from SynTax', off: 'Reminders open in your mail app', how: 'MAIL_FROM, SES_REGION and AWS keys.' },
  { key: 'whatsapp', title: 'WhatsApp (Meta Cloud API)', on: 'Reminders are sent from SynTax', off: 'Reminders open in WhatsApp', how: 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and an approved WHATSAPP_REMINDER_TEMPLATE.' },
  { key: 'assistant', title: 'Assistant (Amazon Bedrock, India)', on: 'Explains FVU errors; identifiers are masked first', off: 'Not set up', how: 'BEDROCK_REGION and BEDROCK_MODEL_ID (an India model or profile) with AWS keys.' },
  { key: 'itrSoftwareId', title: 'ITR software ID', on: 'ITR-1 files can be written', off: 'ITR-1 is checked but not written', how: 'ITR_SOFTWARE_ID, issued by the Income Tax Department to a registered e-return intermediary.' },
  { key: 'desktopAgent', title: 'Desktop agent key', on: 'The agent accepts signed requests', off: 'The agent cannot be used', how: 'AGENT_CHALLENGE_PRIVATE_KEY on the server; its public half on each computer running the agent.' },
];

/** What is actually connected, from the server's settings. GST and TRACES links need outside approval and are listed as such. */
export function ConnectionsPanel() {
  const { authFetch } = useAuth();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    authFetch('/api/v1/integrations/status').then(async (r) => r.ok && setS(await r.json()));
  }, [authFetch]);
  const on = (k: keyof Status) => (k === 'uploads' ? s?.uploads !== 'OFF' : Boolean(s?.[k]));

  return (
    <div className="space-y-6">
      <div className="border-b border-pos-line pb-4">
        <h3 className="text-lg font-semibold text-pos-ink">Connections</h3>
        <p className="mt-0.5 text-xs text-pos-ink/70">What this deployment is connected to. Settings are made on the server.</p>
      </div>
      <div className="space-y-3">
        {ROWS.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pos-line bg-pos-muted p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-pos-ink">{r.title}</div>
              <div className="text-[12px] text-pos-ink/60">{s ? (on(r.key) ? r.on : r.off) : 'Checking…'}{r.key === 'uploads' && s?.uploads === 'DEV_DISK' ? ' (development disk)' : ''}</div>
              {s && !on(r.key) && <div className="text-[12px] text-pos-ink/60">To set up: {r.how}</div>}
            </div>
            <span className={`rounded px-2.5 py-1 text-[12px] font-semibold ${s && on(r.key) ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border border-pos-line bg-pos-surface text-pos-ink/60'}`}>{s ? (on(r.key) ? 'Connected' : 'Not set up') : '…'}</span>
          </div>
        ))}
        {[
          ['GST portal (GSP)', 'Filing GSTR-1 and GSTR-3B, downloading GSTR-2B and ledgers needs a contract with a GST Suvidha Provider and each client’s consent on the GST portal.'],
          ['TRACES', 'There is no API for TRACES. Download the consolidated file, CSI file and certificates there; SynTax reads them.'],
        ].map(([t, d]) => (
          <div key={t} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pos-line bg-pos-muted p-4">
            <div className="space-y-1"><div className="text-sm font-semibold text-pos-ink">{t}</div><div className="text-[12px] text-pos-ink/60">{d}</div></div>
            <span className="rounded border border-pos-line bg-pos-surface px-2.5 py-1 text-[12px] font-semibold text-pos-ink/60">Not connected</span>
          </div>
        ))}
      </div>
    </div>
  );
}
