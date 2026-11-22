'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, Plus, RotateCw, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Module = 'GST' | 'TDS' | 'PRACTICE' | 'FEES' | 'DOCUMENTS' | 'AUDIT' | 'CLIENTS';
interface Member {
  id: string;
  name: string;
  role: 'PARTNER' | 'MANAGER' | 'STAFF';
  designation: string | null;
  status: string;
  custom: boolean;
  version?: string;
  modules: Module[];
  clients: 'ALL' | Array<{ assignmentId: string; entityId: string; name: string; accessLevel: 'VIEW' | 'PREPARE' | 'REVIEW' }>;
}
interface Contact { id: string; name: string; status: string; clients: Array<{ assignmentId: string; entityId: string; name: string }> }
interface Team { modules: Module[]; clients: Array<{ id: string; name: string }>; members: Member[]; contacts?: Contact[] }
interface Invitation { id: string; email: string; name: string; role: 'MANAGER' | 'STAFF' | 'CLIENT'; designation: string | null; clients: string[]; status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED'; expiresAt: string; lastSentAt: string; sendCount: number }

const MODULE_LABEL: Record<Module, string> = { GST: 'GST', TDS: 'TDS', PRACTICE: 'Tasks', FEES: 'Fees', DOCUMENTS: 'Documents', AUDIT: 'Audit log', CLIENTS: 'Client import' };
const LEVEL_LABEL = { VIEW: 'View', PREPARE: 'Prepare', REVIEW: 'Review' } as const;
const ROLE_LABEL = { MANAGER: 'Manager', STAFF: 'Staff', CLIENT: 'Client contact' } as const;
const STATUS_LABEL = { PENDING: 'waiting', EXPIRED: 'link expired', ACCEPTED: 'joined', REVOKED: 'withdrawn' } as const;
const fieldCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** Invite people by email, see who has not joined yet, send again or withdraw. */
function Invitations({ clients, onChange }: { clients: Array<{ id: string; name: string }>; onChange: () => void }) {
  const { authFetch } = useAuth();
  const [list, setList] = useState<Invitation[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [form, setForm] = useState({ email: '', name: '', role: 'STAFF' as Invitation['role'], designation: '', entityIds: [] as string[] });
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch('/api/v1/team/invitations');
    if (!r.ok) return;
    const b = await r.json();
    setList(b.invitations);
    setEmailConfigured(b.emailConfigured);
  }, [authFetch]);
  useEffect(() => { load(); }, [load]);

  const show = (ok: boolean, b: { message?: string; link?: string; emailed?: boolean }, fallback: string) =>
    setResult(ok ? { tone: 'ok', text: b.message ?? fallback, link: b.emailed ? undefined : b.link } : { tone: 'bad', text: b.message ?? 'That did not work.' });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (form.role === 'CLIENT' && !form.entityIds.length) return setResult({ tone: 'bad', text: 'Choose at least one client this contact may see.' });
    setBusy(true);
    const r = await authFetch('/api/v1/team/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.email, name: form.name, role: form.role, designation: form.designation || undefined, entityIds: form.entityIds }),
    });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    show(r.ok, b, 'Invitation created.');
    if (r.ok) {
      setForm({ email: '', name: '', role: form.role, designation: '', entityIds: [] });
      load();
    }
  };
  const act = async (inv: Invitation, action: 'resend' | 'revoke') => {
    setResult(null);
    const r = await authFetch(`/api/v1/team/invitations/${inv.id}/${action}`, { method: 'POST' });
    const b = await r.json().catch(() => ({}));
    show(r.ok, b, action === 'revoke' ? `The invitation for ${inv.email} is withdrawn; its link no longer works.` : 'Sent again.');
    load();
    onChange();
  };
  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setResult((p) => (p ? { ...p, text: `${p.text} Link copied.` } : p));
    } catch {
      // The link stays on screen to copy by hand.
    }
  };
  const toggleClient = (id: string) => setForm((f) => ({ ...f, entityIds: f.entityIds.includes(id) ? f.entityIds.filter((x) => x !== id) : [...f.entityIds, id] }));
  const open = list.filter((i) => i.status === 'PENDING' || i.status === 'EXPIRED');
  const closed = list.filter((i) => i.status === 'ACCEPTED' || i.status === 'REVOKED');

  return (
    <section className="space-y-3 rounded-xl border border-pos-line p-4">
      <h4 className="flex items-center gap-2 text-[14px] font-semibold text-pos-ink"><UserPlus className="h-4 w-4 text-pos-ink/60" /> Invite someone</h4>
      {!emailConfigured && (
        <p className="rounded-[10px] bg-pos-tint px-3 py-2 text-[12.5px] text-pos-ink/70">
          Email is not set up for this workspace, so you get the invitation link to send yourself, by email or WhatsApp. Each link works once, for 72 hours.
        </p>
      )}
      <form onSubmit={invite} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12px] text-pos-ink/60">Name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldCls} /></label>
          <label className="text-[12px] text-pos-ink/60">Email<input type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={fieldCls} /></label>
          <label className="text-[12px] text-pos-ink/60">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Invitation['role'] })} className={fieldCls}>
              <option value="STAFF">Staff, prepares returns</option>
              <option value="MANAGER">Manager, reviews and assigns</option>
              <option value="CLIENT">Client contact, sees only their own business</option>
            </select>
          </label>
          {form.role !== 'CLIENT' && (
            <label className="text-[12px] text-pos-ink/60">Designation (optional)<input maxLength={80} placeholder="e.g. Article assistant" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className={fieldCls} /></label>
          )}
        </div>
        <fieldset>
          <legend className="text-[12px] text-pos-ink/60">{form.role === 'CLIENT' ? 'Which clients this contact may see' : 'Clients to work on (optional, you can add more later)'}</legend>
          <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {clients.map((c) => {
              const on = form.entityIds.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleClient(c.id)} className={`rounded-full px-3 py-1 text-[12px] ${on ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/60'}`}>
                  {c.name}
                </button>
              );
            })}
            {!clients.length && <span className="text-[12px] text-pos-ink/50">No clients yet.</span>}
          </div>
        </fieldset>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
          <Mail className="h-4 w-4" /> {busy ? 'Inviting' : 'Send invitation'}
        </button>
      </form>
      {result && (
        <div role="status" className={`rounded-[10px] px-3 py-2 text-[13px] ${result.tone === 'ok' ? 'bg-[#22a356]/10 text-[#15803d]' : 'bg-[#dc2626]/5 text-[#dc2626]'}`}>
          <p>{result.text}</p>
          {result.link && (
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" className={`${fieldCls} font-mono text-[12px]`} />
              <button type="button" onClick={() => copy(result.link!)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] text-pos-ink"><Copy className="h-3.5 w-3.5" /> Copy</button>
            </div>
          )}
        </div>
      )}
      {open.length > 0 && (
        <ul className="divide-y divide-pos-line rounded-xl border border-pos-line">
          {open.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
              <div>
                <p className="text-pos-ink"><span className="font-medium">{i.name}</span> <span className="text-pos-ink/55">{i.email}</span></p>
                <p className="text-[12px] text-pos-ink/55">
                  {ROLE_LABEL[i.role]}{i.clients.length ? `, ${i.clients.join(', ')}` : ''}. {i.status === 'EXPIRED' ? 'The link has expired.' : `Link works until ${when(i.expiresAt)}.`}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => act(i, 'resend')} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-3 py-1 text-[12px] text-pos-ink"><RotateCw className="h-3.5 w-3.5" /> Send again</button>
                <button type="button" onClick={() => act(i, 'revoke')} className="rounded-full px-3 py-1 text-[12px] text-[#dc2626] hover:bg-[#dc2626]/5">Withdraw</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && <p className="text-[12px] text-pos-ink/50">Last 30 days: {closed.map((i) => `${i.name} (${STATUS_LABEL[i.status]})`).join(', ')}.</p>}
    </section>
  );
}

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
    const r = await authFetch(`/api/v1/team/${m.id}/modules`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(m.version ? { 'If-Match': `"${m.version}"` } : {}) }, body: JSON.stringify({ modules: next }) });
    if (r.status === 409) setError('Someone changed this person’s screens while you had the page open. The latest is shown now.');
    if (r.ok || r.status === 409) load();
  };
  const assign = async (m: Member) => {
    const entityId = adding[m.id];
    if (!entityId) return;
    const r = await authFetch(`/api/v1/team/${m.id}/clients`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, accessLevel: 'PREPARE' }) });
    if (r.ok) { setAdding({ ...adding, [m.id]: '' }); load(); }
  };
  const revoke = async (userId: string, assignmentId: string) => {
    const r = await authFetch(`/api/v1/team/${userId}/clients/${assignmentId}/revoke`, { method: 'POST' });
    if (r.ok) load();
  };

  if (!isPartner) return <p className="text-[13px] text-pos-ink/60">Only a partner manages the team.</p>;
  if (error && !team) return <p className="text-[13px] text-[#dc2626]">{error}</p>;
  if (!team) return <p className="text-[13px] text-pos-ink/55">Loading the team.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-pos-ink">Team and access</h3>
        <p className="mt-0.5 text-[12px] text-pos-ink/65">Invite people, choose the screens each person can open and the clients they work on. Partners see everything. A return can only be filed by a partner, or a manager allowed to approve, who did not prepare it.</p>
      </div>
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      <Invitations clients={team.clients} onChange={load} />
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
                      <button type="button" aria-label={`Remove ${c.name} from ${m.name}`} onClick={() => revoke(m.id, c.assignmentId)} className="text-pos-ink/45 hover:text-[#dc2626]"><X className="h-3 w-3" /></button>
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
      {!!team.contacts?.length && (
        <section className="rounded-xl border border-pos-line p-4">
          <h4 className="text-[14px] font-semibold text-pos-ink">Client contacts</h4>
          <p className="mt-0.5 text-[12px] text-pos-ink/60">They sign in to see their own business only.</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {team.contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-pos-ink">{c.name}</span>
                {c.clients.map((x) => (
                  <span key={x.assignmentId} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-2.5 py-0.5 text-[12px] text-pos-ink">
                    {x.name}
                    <button type="button" aria-label={`Remove ${x.name} from ${c.name}`} onClick={() => revoke(c.id, x.assignmentId)} className="text-pos-ink/45 hover:text-[#dc2626]"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {c.status !== 'ACTIVE' && <span className="text-[12px] text-pos-ink/50">Inactive</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
