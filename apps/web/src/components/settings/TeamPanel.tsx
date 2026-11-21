'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Module = 'GST' | 'TDS' | 'PRACTICE' | 'FEES' | 'DOCUMENTS' | 'AUDIT' | 'CLIENTS';
interface Member {
  id: string;
  name: string;
  role: 'PARTNER' | 'MANAGER' | 'STAFF';
  designation: string | null;
  status: string;
  custom: boolean;
  modules: Module[];
  clients: 'ALL' | Array<{ assignmentId: string; entityId: string; name: string; accessLevel: 'VIEW' | 'PREPARE' | 'REVIEW' }>;
}
interface Team { modules: Module[]; clients: Array<{ id: string; name: string }>; members: Member[] }

const MODULE_LABEL: Record<Module, string> = { GST: 'GST', TDS: 'TDS', PRACTICE: 'Tasks', FEES: 'Fees', DOCUMENTS: 'Documents', AUDIT: 'Audit log', CLIENTS: 'Client import' };
const LEVEL_LABEL = { VIEW: 'View', PREPARE: 'Prepare', REVIEW: 'Review' } as const;

/** Who can open which screens and which clients. Partners manage it; the API and database enforce it. */
export function TeamPanel() {
  const { authFetch, user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const isPartner = user?.role === 'PARTNER';

  const load = useCallback(async () => {
    const r = await authFetch('/api/v1/team');
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'Only a partner can see the team.');
    setTeam(b);
  }, [authFetch]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (m: Member, mod: Module) => {
    const next = m.modules.includes(mod) ? m.modules.filter((x) => x !== mod) : [...m.modules, mod];
    const r = await authFetch(`/api/v1/team/${m.id}/modules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: next }) });
    if (r.ok) load();
  };
  const assign = async (m: Member) => {
    const entityId = adding[m.id];
    if (!entityId) return;
    const r = await authFetch(`/api/v1/team/${m.id}/clients`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, accessLevel: 'PREPARE' }) });
    if (r.ok) { setAdding({ ...adding, [m.id]: '' }); load(); }
  };
  const revoke = async (m: Member, assignmentId: string) => {
    const r = await authFetch(`/api/v1/team/${m.id}/clients/${assignmentId}/revoke`, { method: 'POST' });
    if (r.ok) load();
  };

  if (!isPartner) return <p className="text-[13px] text-pos-ink/60">Only a partner manages the team.</p>;
  if (error) return <p className="text-[13px] text-[#dc2626]">{error}</p>;
  if (!team) return <p className="text-[13px] text-pos-ink/55">Loading the team.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-pos-ink">Team and access</h3>
        <p className="mt-0.5 text-[12px] text-pos-ink/65">Choose the screens each person can open and the clients they work on. Partners see everything. A return can only be filed by a partner, or a manager allowed to approve, who did not prepare it.</p>
      </div>
      {team.members.map((m) => (
        <div key={m.id} className="rounded-xl border border-pos-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[14px] font-semibold text-pos-ink">{m.name}</span>
              <span className="ml-2 rounded-full bg-pos-tint px-2 py-0.5 text-[11px] text-pos-ink/70">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
              {m.designation && <span className="ml-2 text-[12px] text-pos-ink/55">{m.designation}</span>}
            </div>
            {m.role !== 'PARTNER' && !m.custom && <span className="text-[11px] text-pos-ink/45">Default screens for the role</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Screens for ${m.name}`}>
            {team.modules.map((mod) => {
              const on = m.modules.includes(mod);
              return (
                <button key={mod} type="button" disabled={m.role === 'PARTNER'} aria-pressed={on} onClick={() => toggle(m, mod)}
                  className={`rounded-full px-3 py-1 text-[12px] ${on ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/55'} disabled:opacity-70`}>{MODULE_LABEL[mod]}</button>
              );
            })}
          </div>
          <div className="mt-3 text-[13px]">
            {m.clients === 'ALL' ? (
              <p className="text-pos-ink/60">All clients</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {m.clients.length === 0 && <span className="text-pos-ink/55">No clients assigned yet; they see none.</span>}
                  {m.clients.map((c) => (
                    <span key={c.assignmentId} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-2.5 py-1 text-[12px] text-pos-ink">
                      {c.name} <span className="text-pos-ink/45">({LEVEL_LABEL[c.accessLevel]})</span>
                      <button type="button" aria-label={`Remove ${c.name} from ${m.name}`} onClick={() => revoke(m, c.assignmentId)} className="text-pos-ink/45 hover:text-[#dc2626]"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select aria-label={`Client to assign to ${m.name}`} value={adding[m.id] ?? ''} onChange={(e) => setAdding({ ...adding, [m.id]: e.target.value })} className="h-8 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-[12px] text-pos-ink">
                    <option value="">Add a client</option>
                    {team.clients.filter((c) => !(m.clients as Array<{ entityId: string }>).some((x) => x.entityId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" disabled={!adding[m.id]} onClick={() => assign(m)} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-3 text-[12px] text-pos-ink disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Assign</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
